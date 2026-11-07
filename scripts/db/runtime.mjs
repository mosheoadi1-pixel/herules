import EmbeddedPostgres from 'embedded-postgres';
import { access, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const bin = resolve(root, 'node_modules/@embedded-postgres/windows-x64/native/bin');
export const binaries = {
  pgCtl: resolve(bin, 'pg_ctl.exe'),
};
// pg_ctl's server must not inherit Node pipes: their open handles prevent execFile completion on Windows.
const run = (file, args) => new Promise((accept, reject) => {
  const child = spawn(file, args, { stdio: 'ignore', windowsHide: true });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? accept() : reject(new Error(`${file} exited ${code}; inspect ${args[2]}/server.log`)));
});

export async function startDatabase(directory, port) {
  if (process.platform !== 'win32') throw new Error('This local setup is verified for Windows x64 only.');
  await mkdir(dirname(directory), { recursive: true });
  try {
    await access(resolve(directory, 'PG_VERSION'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const cluster = new EmbeddedPostgres({
      databaseDir: directory, port, user: 'postgres', password: 'local-dev-only',
      authMethod: 'scram-sha-256', persistent: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
    });
    await cluster.initialise();
  }
  await run(binaries.pgCtl, ['start', '-D', directory, '-l', resolve(directory, 'server.log'),
    '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '30']);
  return {
    url: `postgresql://postgres:local-dev-only@127.0.0.1:${port}/postgres`,
    async stop() {
      await run(binaries.pgCtl, ['stop', '-D', directory, '-m', 'fast', '-w', '-t', '30']);
    },
  };
}
