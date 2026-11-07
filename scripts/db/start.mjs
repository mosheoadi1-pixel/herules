import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { startDatabase } from './runtime.mjs';

const database = await startDatabase(fileURLToPath(new URL('../../.local/postgres', import.meta.url)), 55432);
console.log(`DATABASE_URL=${database.url}`);
console.log('Local development only. Press Enter or Ctrl+C to stop gracefully.');
const input = createInterface({ input: process.stdin, output: process.stdout });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    await database.stop();
    console.log('PostgreSQL stopped; data retained.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    input.close();
  }
}
input.once('line', stop);
input.once('close', stop);
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
