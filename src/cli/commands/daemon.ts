import { spawn } from 'child_process';
import { resolve } from 'path';
import chalk from 'chalk';
import {
  isDaemonRunning,
  readDaemonPid,
  writeDaemonPid,
  DAEMON_PORT,
  DAEMON_HOST,
} from '../../daemon/DaemonServer.js';
import { getDaemonPidFile } from '../../daemon/DaemonServer.js';
import { unlinkSync, existsSync } from 'fs';

export async function daemonStartCommand(cwd: string): Promise<void> {
  if (isDaemonRunning(cwd)) {
    const pid = readDaemonPid(cwd);
    console.log(chalk.yellow(`Daemon already running (PID ${pid})`));
    console.log(chalk.blue(`Dashboard: http://${DAEMON_HOST}:${DAEMON_PORT}/?cwd=${encodeURIComponent(cwd)}`));
    return;
  }

  // Spawn detached daemon process
  const scriptPath = resolve(process.argv[1]);
  const child = spawn(process.execPath, [scriptPath, 'daemon', '_run', '--cwd', cwd], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, FIRECODE_DAEMON: '1' },
  });
  child.unref();

  // Wait briefly for daemon to come up
  await new Promise(r => setTimeout(r, 800));

  if (isDaemonRunning(cwd)) {
    console.log(chalk.green(`✓ Fire Code daemon started (PID ${child.pid})`));
  } else {
    writeDaemonPid(cwd, child.pid!);
    console.log(chalk.green(`✓ Fire Code daemon started (PID ${child.pid})`));
  }
  console.log(chalk.blue(`  Dashboard: http://${DAEMON_HOST}:${DAEMON_PORT}/?cwd=${encodeURIComponent(cwd)}`));
}

export async function daemonStopCommand(cwd: string): Promise<void> {
  const pid = readDaemonPid(cwd);
  if (!pid || !isDaemonRunning(cwd)) {
    console.log(chalk.yellow('Daemon is not running.'));
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    await new Promise(r => setTimeout(r, 500));
    const pidFile = getDaemonPidFile(cwd);
    if (existsSync(pidFile)) unlinkSync(pidFile);
    console.log(chalk.green(`✓ Daemon stopped (PID ${pid})`));
  } catch (err) {
    console.error(chalk.red(`Failed to stop daemon: ${String(err)}`));
  }
}

export async function daemonStatusCommand(cwd: string): Promise<void> {
  const pid = readDaemonPid(cwd);
  if (!pid || !isDaemonRunning(cwd)) {
    console.log(chalk.gray('● Daemon: stopped'));
    return;
  }
  console.log(chalk.green(`● Daemon: running (PID ${pid})`));
  console.log(chalk.blue(`  http://${DAEMON_HOST}:${DAEMON_PORT}/?cwd=${encodeURIComponent(cwd)}`));
}

export async function daemonRunCommand(cwd: string): Promise<void> {
  // This is the internal entrypoint — called in the detached child process
  const { DaemonServer, writeDaemonPid: writePid } = await import('../../daemon/DaemonServer.js');
  writePid(cwd, process.pid);

  const server = new DaemonServer(cwd);
  await server.start();

  const cleanup = (): void => { server.stop(); process.exit(0); };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}
