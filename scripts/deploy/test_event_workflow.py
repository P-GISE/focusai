import copy
import io
import json
import os
import subprocess
from pathlib import Path
import tempfile
import textwrap
import time
import unittest
import urllib.request
from unittest.mock import Mock, patch
from types import SimpleNamespace
HERE = Path(__file__).resolve().parent

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.run = {'id': 42, 'head_sha': ('b' * 40), 'head_branch': 'main', 'event': 'push',
                    'path': '.github/workflows/aws-release.yml', 'status': 'completed', 'conclusion': 'success',
                    'repository': {'full_name': 'P-GISE/focusai'}, 'head_repository': {'full_name': 'P-GISE/focusai'}}
        self.event = {'repository': {'full_name': 'P-GISE/focusai'}, 'action': 'completed', 'workflow_run': self.run}
        receipt = {'status': 'verified', 'sha': ('b' * 40), 'requested_run_id': 42,
                   'deployed_run_id': 42, 'artifact_run_id': 42, 'image': ('sha256:' + 'a' * 64)}
        self.success = subprocess.CompletedProcess([], 0, json.dumps(receipt), '')
        self.busy = subprocess.CompletedProcess([], 75, '', 'event_deploy_failed:lock_timeout\n')

    def execute_inline(self, replies, *, manual=False, clock=None):
        text = (HERE / '../../.github/workflows/deploy-event.yml').read_text()
        source = textwrap.dedent(text.split("python3 - <<'PY'", 1)[1].rsplit('          PY', 1)[0])
        event = dict(self.event)
        if manual:
            event['inputs'] = {'run_id': '42', 'sha': ('b' * 40)}
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'event.json'
            path.write_text(json.dumps(event))
            response = Mock()
            response.__enter__ = Mock(return_value=io.StringIO(json.dumps(self.run)))
            response.__exit__ = Mock(return_value=False)
            with patch.dict(os.environ, {'GITHUB_EVENT_PATH': str(path),
                                         'GITHUB_EVENT_NAME': 'workflow_dispatch' if manual else 'workflow_run',
                                         'GITHUB_REF': 'refs/heads/main', 'GH_TOKEN': 'fixture',
                                         'DEPLOY_TARGET': 'fixture@host', 'DEPLOY_KEY_FILE': '/fixture/key',
                                         'DEPLOY_HOSTS_FILE': '/fixture/known_hosts'}), \
                    patch.object(subprocess, 'run', side_effect=replies) as self.ssh, \
                    patch.object(time, 'sleep') as self.sleep, \
                    patch.object(time, 'monotonic', side_effect=clock or (lambda: 0)), \
                    patch.object(urllib.request, 'urlopen', return_value=response) as self.api:
                exec(compile(source, 'workflow-inline', 'exec'), {})

    def test_remote_lock_timeout_retries_then_verifies_receipt(self):
        self.execute_inline([self.busy, self.success])
        self.assertEqual(self.ssh.call_count, 2)
        self.sleep.assert_called_once_with(15)

    def test_remote_lock_retry_budget_exhaustion_is_red(self):
        with self.assertRaises(SystemExit) as error:
            self.execute_inline([self.busy], clock=iter([0, 0, 1201]).__next__)
        self.assertEqual(error.exception.code, 75)
        self.assertEqual(self.ssh.call_count, 1)

    def test_network_error_is_red_without_retry(self):
        failure = subprocess.CompletedProcess([], 255, '', 'ssh connection failed')
        with self.assertRaises(SystemExit) as error:
            self.execute_inline([failure])
        self.assertEqual(error.exception.code, 255)
        self.assertEqual(self.ssh.call_count, 1)
        self.sleep.assert_not_called()

    def test_manual_recovery_fetches_exact_canonical_run(self):
        self.execute_inline([self.success], manual=True)
        self.assertEqual(self.api.call_args.args[0].full_url,
                         'https://api.github.com/repos/' + 'P-GISE/focusai' + '/actions/runs/42')
        self.assertEqual(self.ssh.call_args.args[0][-2:], [('b' * 40), '42'])

    def test_manual_recovery_rejects_failed_canonical_run(self):
        self.run['conclusion'] = 'failure'
        with self.assertRaises(AssertionError):
            self.execute_inline([], manual=True)
        self.ssh.assert_not_called()


    def test_event_also_fetches_canonical_run(self):
        self.execute_inline([self.success])
        self.assertEqual(self.api.call_count, 1)
        command = self.ssh.call_args.args[0]
        self.assertIn('-oIdentitiesOnly=yes', command)
        self.assertIn('-oStrictHostKeyChecking=yes', command)
        self.assertIn('-oUserKnownHostsFile=/fixture/known_hosts', command)

    def test_event_canonical_mismatch_stops_before_ssh(self):
        self.event['workflow_run'] = dict(self.run, id=43)
        with self.assertRaises(AssertionError):
            self.execute_inline([])
        self.ssh.assert_not_called()

    def test_invalid_receipts_are_red(self):
        for field, value in [('sha', 'c'*40), ('requested_run_id', 99),
                             ('deployed_run_id', 99), ('artifact_run_id', 99),
                             ('image', 'bad'), ('status', 'waiting')]:
            receipt = json.loads(self.success.stdout)
            receipt[field] = value
            with self.subTest(field=field), self.assertRaises(AssertionError):
                self.execute_inline([subprocess.CompletedProcess([], 0, json.dumps(receipt), '')])

    def test_non_lock_exit_75_does_not_retry(self):
        with self.assertRaises(SystemExit):
            self.execute_inline([subprocess.CompletedProcess([], 75, '', 'other failure')])
        self.sleep.assert_not_called()

    def test_workflow_activation_and_queue_contract(self):
        text = (HERE / '../../.github/workflows/deploy-event.yml').read_text()
        self.assertNotIn('UNCONFIGURED', text)
        self.assertNotIn('if: ${{ false }}', text)
        self.assertIn('queue: max', text)
        self.assertIn('cancel-in-progress: false', text)
        self.assertNotIn('actions/checkout', text)
        self.assertIn('trap', text)
        self.assertIn('chmod 600', text)

    def test_actual_job_predicate_rejects_untrusted_events(self):
        text = (HERE / '../../.github/workflows/deploy-event.yml').read_text()
        expression = text.split('    if: >-', 1)[1].split('    runs-on:', 1)[0]
        expression = ' '.join(expression.strip()[3:-2].split())
        expression = expression.replace('&&', ' and ').replace('||', ' or ')

        def namespace(value):
            if isinstance(value, dict):
                return SimpleNamespace(**{k: namespace(v) for k, v in value.items()})
            return value

        context = {'repository': 'P-GISE/focusai',
                   'event_name': 'workflow_run', 'ref': 'refs/heads/main',
                   'event': copy.deepcopy(self.event)}

        def evaluate(value):
            return eval(expression, {'__builtins__': {}}, {'github': namespace(value)})

        self.assertTrue(evaluate(context))
        minimal = copy.deepcopy(context)
        del minimal['event']['workflow_run']['path']
        del minimal['event']['workflow_run']['repository']
        self.assertTrue(evaluate(minimal))
        manual = dict(context, event_name='workflow_dispatch', event={})
        self.assertTrue(evaluate(manual))
        self.assertFalse(evaluate(dict(manual, ref='refs/heads/other')))
        for field, value in [('event', 'pull_request'), ('head_branch', 'other'),
                             ('status', 'in_progress'), ('conclusion', 'failure'),
                             ('head_repository', {'full_name': 'fork/repo'})]:
            bad = copy.deepcopy(context)
            bad['event']['workflow_run'][field] = value
            with self.subTest(field=field):
                self.assertFalse(evaluate(bad))
        for field, value in [('repository', 'fork/repo'), ('event_name', 'pull_request')]:
            self.assertFalse(evaluate(dict(context, **{field: value})))
        bad = copy.deepcopy(context)
        bad['event']['action'] = 'requested'
        self.assertFalse(evaluate(bad))

    def test_canonical_trust_boundaries_block_ssh(self):
        original = copy.deepcopy(self.run)
        for field, value in [('event', 'pull_request'), ('head_branch', 'other'),
                             ('status', 'in_progress'), ('conclusion', 'failure'),
                             ('path', '.github/workflows/other.yml'),
                             ('repository', {'full_name': 'fork/repo'}),
                             ('head_repository', {'full_name': 'fork/repo'}),
                             ('id', True), ('head_sha', 'x; whoami')]:
            self.run = dict(original, **{field: value})
            with self.subTest(field=field), self.assertRaises(AssertionError):
                self.execute_inline([])
            self.ssh.assert_not_called()

if __name__ == '__main__':
    unittest.main(verbosity=2)
