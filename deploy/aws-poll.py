#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import zipfile

REPO = 'P-GISE/focusai'
ROOT = Path('/opt/focusai')
STATE = Path('/var/lib/focusai-deploy')
APP = 'focusai-app-1'
SHA = re.compile(r'[0-9a-f]{40}')
IMAGE = re.compile(r'sha256:[0-9a-f]{64}')


class DeployError(Exception):
    pass


class Interrupted(DeployError):
    pass


def command(args, *, output=None, timeout=120):
    result = subprocess.run(args, stdout=output or subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=timeout, check=False)
    if result.returncode:
        raise DeployError('command_failed')
    return result.stdout.decode() if output is None else ''


def api(endpoint, *, output=None):
    value = command(['runuser', '-u', 'ubuntu', '--', 'env', 'HOME=/home/ubuntu',
                     'GH_PROMPT_DISABLED=1', 'gh', 'api', f'repos/{REPO}/{endpoint}'],
                    output=output, timeout=300)
    return json.loads(value) if output is None else None


def verified_run(run, sha):
    return all((run.get('head_sha') == sha, run.get('head_branch') == 'main',
                run.get('event') == 'push', run.get('path') == '.github/workflows/aws-release.yml',
                run.get('status') == 'completed', run.get('conclusion') == 'success'))


def protected_tree(tree):
    if tree.get('truncated'):
        raise DeployError('truncated_tree')
    result = {item['path']: item['sha'] for item in tree['tree']
              if item['type'] == 'blob' and (item['path'].startswith(('db/', 'deploy/', '.github/workflows/'))
              or item['path'] in ('server/src/mariadb.ts', 'server/src/init-db.ts'))}
    if 'server/src/mariadb.ts' not in result or 'deploy/aws.compose.yml' not in result:
        raise DeployError('missing_protected_files')
    return result


def image_environment(text, image):
    if not IMAGE.fullmatch(image):
        raise DeployError('invalid_image')
    result, count = re.subn(r'^FOCUSAI_IMAGE=.*$', 'FOCUSAI_IMAGE=' + image, text, flags=re.MULTILINE)
    if count != 1:
        raise DeployError('ambiguous_image_setting')
    return result


def assert_environment_permissions(path):
    if path.is_symlink() or path.stat().st_uid != 0 or path.stat().st_mode & 0o777 != 0o600:
        raise DeployError('unsafe_environment_permissions')


def sync_directory(path):
    if os.name == 'nt':
        return
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write(path, content):
    fd, temporary = tempfile.mkstemp(prefix='.deploy-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        Path(temporary).unlink(missing_ok=True)


def inspect(name):
    return json.loads(command(['docker', 'inspect', name], timeout=20))[0]


def other_containers():
    result = {}
    for name in command(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines():
        if name == APP:
            continue
        item = inspect(name)
        result[name] = (item['Id'], item['State']['StartedAt'], item['State']['Running'],
                        item['RestartCount'], item['State']['OOMKilled'])
    return result


def switch_app(_image):
    command(['docker', 'compose', '--project-directory', str(ROOT), '-p', 'focusai',
             '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'aws.compose.yml'),
             'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'])


def health(image):
    for attempt in range(12):
        item = inspect(APP)
        good = item['Image'] == image and item['State']['Running'] and not item['State']['OOMKilled']
        if good and item['State'].get('Health', {}).get('Status') == 'healthy':
            try:
                result = json.loads(command(['curl', '--silent', '--fail', '--max-time', '5',
                                             'http://127.0.0.1:3400/api/health']))
                if result.get('mariaEnabled') and result.get('mariaReachable'):
                    return
            except Interrupted:
                raise
            except (DeployError, ValueError, subprocess.TimeoutExpired):
                pass
        if attempt < 11:
            time.sleep(5)
    raise DeployError('health_failed')


def replace_app(old, new, write_environment, switch, check_health, finish):
    try:
        write_environment(new)
        switch(new)
        check_health(new)
        finish()
    except BaseException:
        handlers = {sig: signal.signal(sig, signal.SIG_IGN) for sig in (signal.SIGTERM, signal.SIGINT)}
        try:
            write_environment(old)
            switch(old)
            check_health(old)
        finally:
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
        raise


def verify_archive(path, sha):
    with tarfile.open(path, 'r:gz') as archive:
        members = archive.getmembers()
        if sum(item.size for item in members) > 3 * 1024 ** 3:
            raise DeployError('oversized_image')
        manifests = [item for item in members if item.name == 'manifest.json' and item.isfile()]
        if len(manifests) != 1 or manifests[0].size > 1024 ** 2:
            raise DeployError('invalid_image_manifest')
        manifest = json.load(archive.extractfile(manifests[0]))
        if len(manifest) != 1 or manifest[0].get('RepoTags') != ['focusai:' + sha]:
            raise DeployError('unexpected_image_tags')
        config_name = manifest[0].get('Config')
        configs = [item for item in members if item.name == config_name and item.isfile()]
        if len(configs) != 1 or configs[0].size > 1024 ** 2:
            raise DeployError('invalid_image_config')
        config = json.load(archive.extractfile(configs[0]))['config']
        if (config.get('Labels') or {}).get('org.opencontainers.image.revision') != sha:
            raise DeployError('archive_revision_mismatch')
        if config.get('User') != 'node' or config.get('Cmd') != ['node', 'deploy/aws-runtime.mjs']:
            raise DeployError('unexpected_runtime')


def replace_release(previous, sha, image, run_id, original_environment, preserved):
    atomic_write(STATE / 'in-progress', json.dumps({'sha': sha, 'previous': previous}) + '\n')
    atomic_write(STATE / 'previous-environment', original_environment)

    def set_image(value):
        atomic_write(ROOT / '.env', image_environment(original_environment, value))

    def finish():
        preserved()
        atomic_write(STATE / 'deployed.json', json.dumps({'sha': sha, 'image': image,
                     'previous_sha': previous['sha'], 'previous_image': previous['image'],
                     'run_id': run_id, 'deployed_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}) + '\n')

    try:
        replace_app(previous['image'], image, set_image, switch_app, health, finish)
    except BaseException:
        atomic_write(STATE / 'deployed.json', json.dumps(previous) + '\n')
        raise
    (STATE / 'in-progress').unlink()
    sync_directory(STATE)


def poll():
    if (STATE / 'in-progress').exists():
        return 'blocked_after_interrupted_or_failed_deployment'
    sha = api('commits/main')['sha']
    if not SHA.fullmatch(sha):
        raise DeployError('invalid_head')
    previous = json.loads((STATE / 'deployed.json').read_text())
    if not SHA.fullmatch(previous['sha']) or not IMAGE.fullmatch(previous['image']):
        raise DeployError('invalid_baseline')
    if sha == previous['sha']:
        return 'unchanged'
    runs = api('actions/workflows/aws-release.yml/runs?event=push&branch=main&head_sha=' + sha + '&per_page=1')['workflow_runs']
    if not runs or not verified_run(runs[0], sha):
        return 'waiting_for_successful_ci'
    run = runs[0]
    before = protected_tree(api(f"git/trees/{previous['sha']}?recursive=1"))
    after = protected_tree(api(f'git/trees/{sha}?recursive=1'))
    if before != after:
        raise DeployError('schema_or_deployment_change_requires_review')
    artifacts = api(f"actions/runs/{int(run['id'])}/artifacts")['artifacts']
    artifacts = [item for item in artifacts if item['name'] == 'focusai-app-' + sha and not item['expired']]
    if len(artifacts) != 1:
        raise DeployError('missing_unique_artifact')
    artifact = artifacts[0]
    digest = artifact.get('digest', '')
    if not IMAGE.fullmatch(digest) or not 0 < artifact['size_in_bytes'] < 2 * 1024 ** 3:
        raise DeployError('invalid_artifact_metadata')
    if shutil.disk_usage(ROOT).free < 5 * 1024 ** 3:
        raise DeployError('insufficient_disk')
    env_path = ROOT / '.env'
    assert_environment_permissions(env_path)
    original_environment = env_path.read_text()
    old = inspect(APP)
    if old['Image'] != previous['image'] or not old['State']['Running']:
        raise DeployError('running_release_mismatch')
    others = other_containers()

    def preserved():
        if other_containers() != others:
            raise DeployError('unrelated_container_changed')

    with tempfile.TemporaryDirectory(prefix='download-', dir=STATE) as temporary:
        archive = Path(temporary) / 'artifact.zip'
        with archive.open('wb') as stream:
            api(f"actions/artifacts/{int(artifact['id'])}/zip", output=stream)
        with archive.open('rb') as stream:
            if 'sha256:' + hashlib.file_digest(stream, 'sha256').hexdigest() != digest:
                raise DeployError('artifact_digest_mismatch')
        image_archive = Path(temporary) / 'focusai-image.tar.gz'
        with zipfile.ZipFile(archive) as bundle:
            members = bundle.infolist()
            names = {'focusai-image.tar.gz', 'focusai-image.sha256', 'revision.txt', 'schema-source.sha256'}
            if len(members) != len(names) or {item.filename for item in members} != names:
                raise DeployError('unexpected_artifact_contents')
            for item in members:
                limit = 2 * 1024 ** 3 if item.filename.endswith('.tar.gz') else 1024
                if item.file_size > limit:
                    raise DeployError('oversized_artifact_member')
            if bundle.read('revision.txt').decode().strip() != sha:
                raise DeployError('artifact_revision_mismatch')
            expected = bundle.read('focusai-image.sha256').decode().split()[0]
            if not re.fullmatch('[0-9a-f]{64}', expected):
                raise DeployError('invalid_image_checksum')
            with bundle.open('focusai-image.tar.gz') as source, image_archive.open('wb') as target:
                shutil.copyfileobj(source, target)
        with image_archive.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                raise DeployError('image_checksum_mismatch')
        verify_archive(image_archive, sha)
        command(['docker', 'load', '--input', str(image_archive)], timeout=300)
    candidate = inspect('focusai:' + sha)
    image = candidate['Id']
    if not IMAGE.fullmatch(image) or (candidate['Config'].get('Labels') or {}).get('org.opencontainers.image.revision') != sha:
        raise DeployError('loaded_image_revision_mismatch')
    if api('commits/main')['sha'] != sha:
        return 'superseded'
    preserved()
    replace_release(previous, sha, image, run['id'], original_environment, preserved)
    return 'deployed_' + sha


def interrupted(_signum, _frame):
    raise Interrupted('deployment_interrupted')


def main():
    import fcntl
    if os.geteuid() != 0:
        raise DeployError('root_required')
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    with (STATE / 'deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('focusai_deploy status=another_deployment_running', flush=True)
            return
        print('focusai_deploy status=' + poll(), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        category = str(error) if isinstance(error, DeployError) else type(error).__name__
        print('focusai_deploy status=failed reason=' + category, flush=True)
        raise SystemExit(1)
