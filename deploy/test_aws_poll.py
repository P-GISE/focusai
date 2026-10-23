import importlib.util
import io
import json
from pathlib import Path
import signal
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('aws_poll', Path(__file__).with_name('aws-poll.py'))
poller = importlib.util.module_from_spec(spec)
spec.loader.exec_module(poller)
OLD = 'sha256:' + 'a' * 64
NEW = 'sha256:' + 'b' * 64
SHA = 'c' * 40


class PullerTests(unittest.TestCase):
    def test_only_successful_exact_main_push_is_accepted(self):
        run = dict(head_sha=SHA, head_branch='main', event='push',
                   path='.github/workflows/aws-release.yml', status='completed', conclusion='success')
        self.assertTrue(poller.verified_run(run, SHA))
        for key, wrong in [('head_sha', 'd' * 40), ('head_branch', 'feature'), ('event', 'pull_request'),
                           ('path', '.github/workflows/other.yml'), ('status', 'in_progress'), ('conclusion', 'failure')]:
            with self.subTest(key=key):
                self.assertFalse(poller.verified_run({**run, key: wrong}, SHA))

    def test_schema_and_operational_files_are_protected(self):
        paths = ['server/src/mariadb.ts', 'server/src/init-db.ts', 'db/schema.sql',
                 'deploy/aws.compose.yml', 'deploy/aws-runtime.mjs', '.github/workflows/aws-release.yml', 'src/App.tsx']
        tree = {'tree': [{'path': p, 'sha': str(i), 'type': 'blob'} for i, p in enumerate(paths)]}
        self.assertEqual(set(poller.protected_tree(tree)), set(paths[:-1]))
        with self.assertRaises(poller.DeployError):
            poller.protected_tree({**tree, 'truncated': True})
        with self.assertRaises(poller.DeployError):
            poller.protected_tree({'tree': []})

    def test_image_setting_is_unique_and_preserves_other_settings(self):
        text = 'FOCUSAI_IMAGE=' + OLD + '\nFOCUSAI_PORT=3400\n'
        self.assertEqual(poller.image_environment(text, NEW), text.replace(OLD, NEW))
        for text in ('FOCUSAI_PORT=3400\n', 'FOCUSAI_IMAGE=a\nFOCUSAI_IMAGE=b\n'):
            with self.assertRaises(poller.DeployError):
                poller.image_environment(text, NEW)
        with self.assertRaises(poller.DeployError):
            poller.image_environment('FOCUSAI_IMAGE=x', 'latest')

    def test_successful_replacement_finishes_without_rollback(self):
        events = []
        poller.replace_app(OLD, NEW, lambda x: events.append(('env', x)), lambda x: events.append(('switch', x)),
                           lambda x: events.append(('health', x)), lambda: events.append(('finish', NEW)))
        self.assertEqual(events, [('env', NEW), ('switch', NEW), ('health', NEW), ('finish', NEW)])

    def test_replacement_rolls_back_every_failure_boundary(self):
        for failure in ['env', 'switch', 'health', 'finish']:
            with self.subTest(failure=failure):
                events = []
                def action(name, image):
                    events.append((name, image))
                    if image == NEW and name == failure:
                        raise poller.DeployError('synthetic_failure')
                with self.assertRaises(poller.DeployError):
                    poller.replace_app(OLD, NEW, lambda x: action('env', x), lambda x: action('switch', x),
                                       lambda x: action('health', x), lambda: action('finish', NEW))
                self.assertEqual(events[-3:], [('env', OLD), ('switch', OLD), ('health', OLD)])

    def test_term_and_int_roll_back_and_restore_handlers(self):
        for sig in (signal.SIGTERM, signal.SIGINT):
            with self.subTest(signal=sig):
                before = signal.getsignal(sig)
                events = []
                def health(image):
                    events.append(image)
                    if image == NEW:
                        poller.interrupted(sig, None)
                with self.assertRaises(poller.DeployError):
                    poller.replace_app(OLD, NEW, lambda _: None, lambda _: None, health, lambda: None)
                self.assertEqual(events, [NEW, OLD])
                self.assertEqual(signal.getsignal(sig), before)

    def test_rollback_failure_is_not_success(self):
        def health(_):
            raise poller.DeployError('unhealthy')
        with self.assertRaises(poller.DeployError):
            poller.replace_app(OLD, NEW, lambda _: None, lambda _: None, health, lambda: None)

    def test_interrupted_marker_blocks_before_any_api_or_command(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(poller, 'STATE', Path(temp)), patch.object(poller, 'api') as api:
            (Path(temp) / 'in-progress').write_text('synthetic marker')
            self.assertEqual(poller.poll(), 'blocked_after_interrupted_or_failed_deployment')
            api.assert_not_called()

    def test_noop_and_failed_ci_do_not_touch_docker(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(poller, 'STATE', Path(temp)), patch.object(poller, 'command') as command:
            (Path(temp) / 'deployed.json').write_text(json.dumps({'sha': SHA, 'image': OLD}))
            with patch.object(poller, 'api', return_value={'sha': SHA}):
                self.assertEqual(poller.poll(), 'unchanged')
            with patch.object(poller, 'api', side_effect=[{'sha': 'd' * 40}, {'workflow_runs': []}]):
                self.assertEqual(poller.poll(), 'waiting_for_successful_ci')
            command.assert_not_called()

    def test_schema_change_stops_before_artifact_download(self):
        tree = {'tree': [{'path': p, 'sha': 'x', 'type': 'blob'} for p in ['server/src/mariadb.ts', 'deploy/aws.compose.yml']]}
        changed = {'tree': [{**item, 'sha': 'y'} for item in tree['tree']]}
        run = dict(head_sha=SHA, head_branch='main', event='push', path='.github/workflows/aws-release.yml', status='completed', conclusion='success')
        with tempfile.TemporaryDirectory() as temp, patch.object(poller, 'STATE', Path(temp)), patch.object(poller, 'command') as command:
            (Path(temp) / 'deployed.json').write_text(json.dumps({'sha': 'd' * 40, 'image': OLD}))
            with patch.object(poller, 'api', side_effect=[{'sha': SHA}, {'workflow_runs': [run]}, tree, changed]) as api:
                with self.assertRaisesRegex(poller.DeployError, 'requires_review'):
                    poller.poll()
                self.assertEqual(api.call_count, 4)
            command.assert_not_called()

    def test_archive_rejects_other_tags_revision_and_command(self):
        for tags, revision, command, valid in [(['focusai:' + SHA], SHA, ['node', 'deploy/aws-runtime.mjs'], True),
                                               (['other:latest'], SHA, ['node', 'deploy/aws-runtime.mjs'], False),
                                               (['focusai:' + SHA], 'd' * 40, ['node', 'deploy/aws-runtime.mjs'], False),
                                               (['focusai:' + SHA], SHA, ['sh'], False)]:
            with self.subTest(tags=tags, revision=revision, command=command), tempfile.TemporaryDirectory() as temp:
                archive = Path(temp) / 'image.tar.gz'
                config = {'config': {'Labels': {'org.opencontainers.image.revision': revision}, 'User': 'node', 'Cmd': command}}
                with tarfile.open(archive, 'w:gz') as tar:
                    for name, data in [('manifest.json', [{'Config': 'config.json', 'RepoTags': tags}]), ('config.json', config)]:
                        payload = json.dumps(data).encode()
                        member = tarfile.TarInfo(name)
                        member.size = len(payload)
                        tar.addfile(member, io.BytesIO(payload))
                if valid:
                    poller.verify_archive(archive, SHA)
                else:
                    with self.assertRaises(poller.DeployError):
                        poller.verify_archive(archive, SHA)

    def test_atomic_write_persists_only_new_state(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'state'
            target.write_text('old')
            poller.atomic_write(target, 'new')
            self.assertEqual(target.read_text(), 'new')
            self.assertEqual([p.name for p in Path(temp).iterdir()], ['state'])

    def test_atomic_write_syncs_parent_after_replacement(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'state'
            observed = []
            with patch.object(poller, 'sync_directory', side_effect=lambda parent: observed.append((parent, target.read_text()))):
                poller.atomic_write(target, 'new')
            self.assertEqual(observed, [(Path(temp), 'new')])

    def test_posix_directory_sync_closes_descriptor_on_failure(self):
        with patch.object(poller.os, 'name', 'posix'), patch.object(poller.os, 'O_DIRECTORY', 65536, create=True), patch.object(poller.os, 'open', return_value=17), patch.object(poller.os, 'fsync', side_effect=OSError('synthetic sync failure')), patch.object(poller.os, 'close') as close:
            with self.assertRaises(OSError):
                poller.sync_directory('synthetic directory')
            close.assert_called_once_with(17)

    def test_release_state_commit_and_failure_recovery_are_durable(self):
        for fail in (None, 'health', 'preserved', 'state', 'signal'):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as temp:
                root = Path(temp) / 'root'
                state = Path(temp) / 'state'
                root.mkdir()
                state.mkdir()
                previous = {'sha': 'd' * 40, 'image': OLD}
                environment = 'FOCUSAI_IMAGE=' + OLD + '\nFOCUSAI_PORT=3400\n'
                (root / '.env').write_text(environment)
                (state / 'deployed.json').write_text(json.dumps(previous))
                events = []
                def health(image):
                    events.append(image)
                    if image == NEW and fail in ('health', 'signal'):
                        raise poller.DeployError('synthetic_' + fail)
                def preserved():
                    if fail == 'preserved':
                        raise poller.DeployError('synthetic_unrelated_change')
                original_write = poller.atomic_write
                def write(path, value):
                    if path.name == 'deployed.json' and NEW in value and fail == 'state':
                        raise OSError('synthetic disk failure')
                    original_write(path, value)
                with patch.object(poller, 'ROOT', root), patch.object(poller, 'STATE', state), patch.object(poller, 'switch_app'), patch.object(poller, 'health', side_effect=health), patch.object(poller, 'atomic_write', side_effect=write):
                    if fail:
                        with self.assertRaises((poller.DeployError, OSError)):
                            poller.replace_release(previous, SHA, NEW, 1, environment, preserved)
                        self.assertEqual((root / '.env').read_text(), environment)
                        self.assertEqual(json.loads((state / 'deployed.json').read_text()), previous)
                        self.assertTrue((state / 'in-progress').exists())
                        self.assertEqual(events[-1], OLD)
                        with patch.object(poller, 'api') as api:
                            self.assertEqual(poller.poll(), 'blocked_after_interrupted_or_failed_deployment')
                            api.assert_not_called()
                    else:
                        poller.replace_release(previous, SHA, NEW, 1, environment, preserved)
                        self.assertFalse((state / 'in-progress').exists())
                        self.assertEqual(json.loads((state / 'deployed.json').read_text())['image'], NEW)

    def test_switch_only_replaces_app_without_build_or_initialization(self):
        with patch.object(poller, 'command') as command:
            poller.switch_app(NEW)
            args = command.call_args.args[0]
            self.assertEqual(args[-1], 'app')
            for flag in ('--no-deps', '--no-build', '--pull'):
                self.assertIn(flag, args)
            self.assertNotIn('init', args)
            self.assertNotIn('down', args)

    def test_systemd_allows_bounded_rollback_to_finish(self):
        service = Path(__file__).with_name('focusai-deploy.service').read_text()
        self.assertIn('TimeoutStopSec=10min', service)
        self.assertIn('KillSignal=SIGTERM', service)


if __name__ == '__main__':
    unittest.main()
