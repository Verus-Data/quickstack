import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { setTimeout } from 'node:timers/promises';

type Owned = { child: ChildProcess; finished: Promise<number>; drained: Promise<void> };

function portNumber(value: string | undefined, fallback: number): number {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Dev ports must be integers between 1 and 65535.');
  }
  return port;
}

async function checkPort(port: number, name: string) {
  await checkListener(port, name, '127.0.0.1');
  await checkListener(port, name, '::1');
  await checkAddress(port, name, '0.0.0.0');
  await checkAddress(port, name, '::');
}

async function checkListener(port: number, name: string, host: string) {
  // Bun on macOS can bind a wildcard while a loopback listener still owns
  // this port. Check live listeners as well as attempting to bind.
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      reject(
        new Error(
          `${name} port :${port} is already in use. Stop its owner or choose another port.`,
        ),
      );
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (
        'code' in error &&
        ['ECONNREFUSED', 'EAFNOSUPPORT', 'ENETUNREACH'].includes(String(error.code))
      )
        resolve();
      else reject(error);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error(`Could not check ${name} port :${port}.`));
    });
  });
}

async function checkAddress(port: number, name: string, host: string) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', () =>
      reject(
        new Error(
          `${name} port :${port} is already in use or unavailable. Stop its owner or choose another port.`,
        ),
      ),
    );
    server.listen({ port, host, ipv6Only: true }, () => server.close(() => resolve()));
  });
}

function start(args: string[], api = false): Owned {
  const child = spawn('bun', args, {
    detached: true,
    stdio: api ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (api) {
    for (const input of [child.stdout, child.stderr]) {
      if (input)
        createInterface({ input }).on('line', (line) => process.stdout.write(`[api] ${line}\n`));
    }
  }
  const finished = new Promise<number>((resolve) => {
    child.once('error', (error) => {
      process.stderr.write(`[dev] could not start bun: ${error.message}\n`);
      resolve(1);
    });
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
  const drained = new Promise<void>((resolve) => child.once('close', () => resolve()));
  return { child, finished, drained };
}

function signalGroup(pid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH')
      return false;
    throw error;
  }
}

async function stop(owned: Owned) {
  const pid = owned.child.pid;
  if (pid && signalGroup(pid, 'SIGTERM')) {
    // A workspace runner may exit before its watcher. Retain ownership of its
    // original group until every member exits; bound stubborn cleanup.
    for (let attempt = 0; attempt < 40; attempt++) {
      if (!signalGroup(pid, 0)) break;
      await setTimeout(50);
    }
    if (signalGroup(pid, 0)) signalGroup(pid, 'SIGKILL');
  }
  await drainOutput(owned);
}

async function drainOutput(owned: Owned) {
  // Exit starts cleanup even when a watcher inherited the pipes. After group
  // shutdown, bound draining so an escaped pipe holder cannot stall the owner.
  await new Promise<void>((resolve) => {
    const timer = globalThis.setTimeout(() => {
      owned.child.stdout?.destroy();
      owned.child.stderr?.destroy();
      resolve();
    }, 1000);
    owned.drained.then(() => {
      globalThis.clearTimeout(timer);
      resolve();
    });
  });
}

class CommandFailed extends Error {
  readonly status: number;

  constructor(status: number, command: string) {
    super(`${command} exited ${status}`);
    this.status = status;
  }
}

async function main() {
  const owned = new Set<Owned>();
  let interrupted: number | undefined;
  let cleanup: Promise<void> | undefined;
  const stopAll = () => {
    cleanup ??= Promise.all([...owned].map(stop)).then(() => undefined);
    return cleanup;
  };
  const signal = (status: number) => {
    interrupted = status;
    process.exitCode = status;
    stopAll().catch((error) => process.stderr.write(`[dev] cleanup failed: ${String(error)}\n`));
  };
  const onInt = () => signal(130);
  const onTerm = () => signal(143);
  const onHup = () => signal(129);
  const run = (args: string[], api = false) => {
    if (interrupted) throw new CommandFailed(interrupted, 'dev');
    const child = start(args, api);
    owned.add(child);
    return child;
  };
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);
  process.once('SIGHUP', onHup);
  try {
    if (process.argv.length > 2) throw new CommandFailed(2, 'dev accepts no arguments');
    const apiPort = portNumber(process.env.PORT_API, 3000);
    const metroPort = portNumber(process.env.PORT_METRO, 8081);
    if (apiPort === metroPort) throw new Error('API and Metro need different ports.');
    await checkPort(apiPort, 'API');
    await checkPort(metroPort, 'Metro');
    process.stdout.write('[dev] logging to .logs/dev.log (bun run dev:logs to follow it)\n');
    for (const command of ['db:up', 'db:migrate']) {
      const setup = run(['run', command]);
      const status = await setup.finished;
      await stop(setup);
      owned.delete(setup);
      if (status) throw new CommandFailed(status, command);
    }
    process.stdout.write(`[dev] api on :${apiPort}, /health and /docs\n`);
    const api = run(['run', '--filter', './apps/api', 'dev'], true);
    const runtimes = spawnSync('xcrun', ['simctl', 'list', 'runtimes'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const mobileScript = runtimes.status === 0 && runtimes.stdout.includes('iOS') ? 'ios' : 'dev';
    process.stdout.write(`[dev] mobile ${mobileScript} on :${metroPort}\n`);
    const mobile = run([
      'run',
      '--filter',
      './apps/mobile',
      mobileScript,
      '--port',
      String(metroPort),
    ]);
    const status = await Promise.race([api.finished, mobile.finished]);
    process.exitCode = interrupted ?? status;
  } catch (error) {
    process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = interrupted ?? (error instanceof CommandFailed ? error.status : 1);
  } finally {
    process.stdout.write(
      '\n[dev] shutting down owned processes; Postgres stays up (bun run db:down to stop it)\n',
    );
    await stopAll();
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
    process.removeListener('SIGHUP', onHup);
  }
}

await main();
