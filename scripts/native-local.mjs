import { spawn } from 'node:child_process';
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { authenticator } from 'otplib';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const setup = process.argv.includes('--setup');
const adminOnly = process.argv.includes('--admin');

async function waitForPostgres(connectionString, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pool = new Pool({ connectionString, connectionTimeoutMillis: 1500 });
    try {
      await pool.query('SELECT 1');
      await pool.end();
      return;
    } catch {
      await pool.end().catch(() => {});
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error('Timeout waiting for PostgreSQL to be ready');
}

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      windowsHide: true,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${code}`)),
    );
  });
}

async function main() {
  if (process.platform !== 'win32')
    throw Error(
      'This portable launcher is for Windows. See the native deployment guide for other platforms.',
    );
  if (!existsSync('.env')) await run(process.execPath, ['scripts/bootstrap.mjs']);
  process.loadEnvFile('.env');
  if (process.env.DEPLOYMENT_MODE !== 'demo')
    throw Error('Portable setup is restricted to local demo mode.');
  const bin = path.join(root, '.data/native/pgsql/bin');
  if (!existsSync(path.join(bin, 'postgres.exe')))
    throw Error('Extract the PostgreSQL Windows binaries into .data/native/pgsql first.');
  const data = path.join(root, '.data/postgres');
  const url = new URL(process.env.MIGRATION_DATABASE_URL);
  if (url.hostname !== '127.0.0.1')
    throw Error('Portable PostgreSQL must use the loopback address.');
  const port = Number(url.port || '5432');

  if (!existsSync(path.join(data, 'PG_VERSION'))) {
    if (!setup) throw Error('Run npm run setup:native first.');
    await mkdir('.data/native', { recursive: true });
    const passwordFile = path.join(root, '.data/native/init-password');
    await writeFile(passwordFile, decodeURIComponent(url.password), { mode: 0o600, flag: 'wx' });
    try {
      await run(path.join(bin, 'initdb.exe'), [
        '-D',
        data,
        '-U',
        decodeURIComponent(url.username),
        '--pwfile',
        passwordFile,
        '--auth=scram-sha-256',
        '--encoding=UTF8',
        '--locale=C',
      ]);
    } finally {
      await unlink(passwordFile).catch(() => undefined);
    }
  }

  const checkUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  checkUrl.pathname = '/postgres';
  let pgProcess = null;
  let alreadyRunning = false;
  try {
    await waitForPostgres(checkUrl.toString(), 800);
    alreadyRunning = true;
  } catch {
    alreadyRunning = false;
  }

  if (!alreadyRunning) {
    const logFile = path.join(root, '.data/postgres.log');
    const logStream = createWriteStream(logFile, { flags: 'a' });
    pgProcess = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port)], {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    pgProcess.stdout.pipe(logStream);
    pgProcess.stderr.pipe(logStream);
    pgProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) console.error(`PostgreSQL exited with code ${code}`);
    });
    await waitForPostgres(checkUrl.toString(), 20000);
  }

  const cleanup = () => {
    if (pgProcess) {
      try {
        pgProcess.kill('SIGINT');
      } catch {}
    }
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('exit', cleanup);

  if (setup) {
    const database = decodeURIComponent(url.pathname.slice(1));
    if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw Error('Invalid local database name.');
    const adminPool = new Pool({ connectionString: checkUrl.toString() });
    try {
      if (!(await adminPool.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount)
        await adminPool.query(`CREATE DATABASE "${database}"`);
    } finally {
      await adminPool.end();
    }
    const tsx = ['node_modules/tsx/dist/cli.mjs', '--tsconfig', 'tsconfig.api.json'];
    await run(process.execPath, [...tsx, 'scripts/migrate.ts']);
    await run(process.execPath, [...tsx, 'scripts/seed.ts']);
    const accessFile = path.join(root, '.data/local-access.json');
    if (!existsSync(accessFile)) {
      const email = process.env.OWNER_EMAIL || 'kowshikanathan@gmail.com';
      const password = process.env.OWNER_PASSWORD || randomBytes(16).toString('hex');
      const account = {
        email,
        password,
        authenticatorSetupKey: authenticator.generateSecret(),
        loginUrl: 'http://localhost:3000/admin/',
      };
      await run(process.execPath, [...tsx, 'scripts/create-owner.ts'], {
        OWNER_EMAIL: account.email,
        OWNER_PASSWORD: account.password,
        OWNER_TOTP_SECRET: account.authenticatorSetupKey,
      });
      await writeFile(accessFile, JSON.stringify(account, null, 2), { mode: 0o600, flag: 'wx' });
    }
    console.log(
      'Local setup complete. Owner login details: .data/local-access.json. Database and service credentials: .env.',
    );
    cleanup();
    return;
  }

  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const child = spawn(process.execPath, [npmCli, 'run', adminOnly ? 'dev:admin' : 'dev'], {
    cwd: root,
    windowsHide: true,
    stdio: 'inherit',
    env: { ...process.env, REFERENCE_READONLY_PREVIEW: 'false' },
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      child.kill(signal);
      cleanup();
    });
  child.on('error', (error) => {
    console.error(error.message);
    cleanup();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    cleanup();
    process.exitCode = code || 0;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
