import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { startDatabase } from './runtime.mjs';

const directory = await mkdtemp(resolve(tmpdir(), 'her-rules-pg-gate-'));
const port = 55433;
const clients = [];
let database;
try {
  database = await startDatabase(directory, port);
  for (let i = 0; i < 2; i++) {
    const client = new pg.Client({ connectionString: database.url, connectionTimeoutMillis: 5000 });
    clients.push(client);
    await client.connect();
  }
  const [a, b] = clients;
  const version = (await a.query('SELECT version()')).rows[0].version;
  assert.match(version, /^PostgreSQL 18\./);
  console.log(version);
  await a.query('CREATE SCHEMA setup_gate; CREATE TABLE setup_gate.probe (id integer PRIMARY KEY, note text NOT NULL)');
  await a.query("INSERT INTO setup_gate.probe VALUES (1, 'שלום')");
  assert.equal((await b.query('SELECT note FROM setup_gate.probe')).rows[0].note, 'שלום');
  console.log('PASS: schema/table creation and UTF-8 persistence visible to second connection');
  await a.query('BEGIN');
  await a.query("INSERT INTO setup_gate.probe VALUES (2, 'rollback')");
  assert.equal((await a.query('SELECT count(*)::int AS n FROM setup_gate.probe')).rows[0].n, 2);
  assert.equal((await b.query('SELECT count(*)::int AS n FROM setup_gate.probe')).rows[0].n, 1);
  await a.query('ROLLBACK');
  assert.equal((await a.query('SELECT count(*)::int AS n FROM setup_gate.probe')).rows[0].n, 1);
  console.log('PASS: transaction isolation and rollback');
  const results = await Promise.all([a.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.2)'), b.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.2)')]);
  assert.notEqual(results[0].rows[0].pid, results[1].rows[0].pid);
  console.log('PASS: overlapping queries on two distinct PostgreSQL backends');
} finally {
  await Promise.all(clients.map(client => client.end()));
  if (database) await database.stop();
}
const log = await readFile(resolve(directory, 'server.log'), 'utf8');
assert.match(log, /database system is shut down/);
await assert.rejects(readFile(resolve(directory, 'postmaster.pid')), { code: 'ENOENT' });
const stopped = new pg.Client({ connectionString: database.url, connectionTimeoutMillis: 1000 });
try {
  await assert.rejects(stopped.connect(), error => error.code === 'ECONNREFUSED');
} finally {
  await stopped.end();
}
console.log('PASS: graceful shutdown, no postmaster.pid, connection refused');
const restarted = await startDatabase(directory, port);
const reader = new pg.Client({ connectionString: restarted.url, connectionTimeoutMillis: 5000 });
try {
  await reader.connect();
  assert.equal((await reader.query('SELECT note FROM setup_gate.probe')).rows[0].note, 'שלום');
  console.log('PASS: restart reuses cluster and retains committed data');
} finally {
  await reader.end();
  await restarted.stop();
}
assert.match(await readFile(resolve(directory, 'server.log'), 'utf8'), /database system is shut down/);
await assert.rejects(readFile(resolve(directory, 'postmaster.pid')), { code: 'ENOENT' });
await rm(directory, { recursive: true });
console.log('PASS: isolated test cluster removed');
