import { spawnSync } from 'node:child_process';

const commands = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];

for (const command of commands) {
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (probe.error?.code === 'ENOENT' || probe.status !== 0) continue;

  const install = spawnSync(command, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (install.error) throw install.error;
  if (install.status !== 0) process.exit(install.status ?? 1);
  process.exit(0);
}

throw new Error('未找到可用的 Python，请在部署环境安装 Python 3 后重试。');
