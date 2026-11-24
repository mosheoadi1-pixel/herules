import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import pg from 'pg';
import { startDatabase } from '../scripts/db/runtime.mjs';
import { createApp } from '../server/app.ts';
import { publicCopy } from '../src/i18n.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ovadia/Downloadsold/agent/.venv/Lib/site-packages/playwright/driver/package');
const directory = await mkdtemp(join(tmpdir(), 'her-rules-public-messaging-'));
const db = await startDatabase(directory, 55451), pool = new pg.Pool({ connectionString: db.url });
process.env.HR_MODE = 'public';
delete process.env.ADMIN_HASH;
process.env.HR_VERIFICATION_DIR = join(directory, 'verification');
let browser: any, server: Server | undefined;
const dom = { id: randomUUID(), nickname: 'Dana דנה', role: 'dom' };
const sub = { id: randomUUID(), nickname: 'שירה Shira', role: 'sub' };
const outside = { id: randomUUID(), nickname: 'Guest', role: 'sub' };
process.env.HR_ADMIN_PUBLIC_IDS = dom.id;
const text = (key: string, lang = 'en') => publicCopy[key][lang === 'he' ? 0 : 1];

try {
  const app = await createApp(pool, 'http://localhost:4193');
  app.use(express.static('dist'));
  const listener = app.listen(0);
  server = listener;
  await new Promise(resolve => listener.once('listening', resolve));
  const url = `http://localhost:${(listener.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
  const memberPage = async (member: typeof dom, fallback = false) => {
    const token = randomBytes(32).toString('hex');
    await pool.query('INSERT INTO public_users(id,nickname,nickname_key,role,gender,verified_at) VALUES($1,$2,$3,$4,$5,now())',
      [member.id, member.nickname, member.nickname.toLowerCase(), member.role, 'other']);
    await pool.query("INSERT INTO public_sessions(hash,public_user_id,expires) VALUES($1,$2,now()+interval '1 hour')",
      [createHash('sha256').update(token).digest('hex'), member.id]);
    const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'hr_public_session', value: token, url, httpOnly: true, sameSite: 'Lax' }]);
    if (fallback) await context.addInitScript(() => { Object.defineProperty(window, 'EventSource', { value: undefined }); });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(url);
    await page.getByRole('heading', { name: 'החדר הראשי', exact: true }).waitFor();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByRole('heading', { name: 'Main room', exact: true }).waitFor();
    return page;
  };
  const d = await memberPage(dom), s = await memberPage(sub), o = await memberPage(outside, true);
  const button = (page: any, key: string) => page.getByRole('button', { name: text(key), exact: true });
  const room = (page: any, name: string) => page.getByRole('navigation', { name: text('msgRooms') }).getByRole('button', { name: new RegExp(name) });
  const thread = (page: any, nickname: string) => page.getByRole('navigation', { name: text('convTitle') }).getByRole('button', { name: new RegExp(nickname) });
  const transcript = (page: any) => page.getByRole('list', { name: text('msgTranscript') });
  const exact = (page: any, value: string) => page.getByText(value, { exact: true });

  await exact(s, text('msgReadOnly')).waitFor();
  assert.equal(await s.getByLabel(text('roomCompose')).count(), 0);
  await room(d, 'Introductions').press('Enter');
  await room(s, 'Introductions').click();
  assert.equal(await d.evaluate(() => document.activeElement?.id), 'msg-heading');
  await exact(d, text('msgGrants')).click();
  await d.getByLabel(text('msgSubNickname')).fill(sub.nickname);
  const approvalForm = d.locator('.msg-address');
  await approvalForm.getByLabel(text('roomCompose')).fill('Welcome to this room');
  await button(d, 'msgAddress').click();
  await exact(s, 'Welcome to this room').waitFor();
  await s.getByLabel(text('roomCompose')).fill('Thanks for the room welcome');
  await button(s, 'roomSend').click();
  await exact(d, 'Thanks for the room welcome').waitFor();
  await room(o, 'Introductions').click();
  await exact(o, 'Thanks for the room welcome').waitFor();
  await exact(o, text('roomPolling')).waitFor();
  await room(s, 'Community channel').click();
  await exact(s, text('msgReadOnly')).waitFor();
  assert.equal(await exact(s, 'Thanks for the room welcome').count(), 0);
  const introPath = '**/api/public/rooms/introductions';
  let release!: () => void, entered!: () => void, delivered!: () => void;
  const parked = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { entered = resolve; });
  const finished = new Promise<void>(resolve => { delivered = resolve; });
  await s.route(introPath, async (route: any) => {
    const response = await route.fetch();
    entered();
    await parked;
    await route.fulfill({ response });
    delivered();
  }, { times: 1 });
  await room(s, 'Introductions').click();
  await reached;
  await room(s, 'Community channel').click();
  release();
  await finished;
  await exact(s, text('roomEmpty')).waitFor();
  assert.equal(await exact(s, 'Thanks for the room welcome').count(), 0, 'a late response cannot populate the newly selected room');
  await room(s, 'Introductions').click();
  await s.getByLabel(text('roomCompose')).waitFor();
  await d.getByRole('button', { name: `${text('msgRevoke')}: ${sub.nickname}` }).click();
  await exact(s, text('msgReadOnly')).waitFor();
  assert.equal(await s.getByLabel(text('roomCompose')).count(), 0);

  // Polling receives an independently approved grant, not just the initial snapshot.
  await d.getByLabel(text('msgSubNickname')).fill(outside.nickname);
  await approvalForm.getByLabel(text('roomCompose')).fill('Welcome from polling');
  await button(d, 'msgAddress').click();
  await o.getByLabel(text('roomCompose')).waitFor();
  await d.getByRole('button', { name: `${text('msgRevoke')}: ${outside.nickname}` }).click();
  await exact(o, text('msgReadOnly')).waitFor();

  // Reporting and removal still operate on the selected room.
  const welcome = transcript(s).locator('li').filter({ hasText: 'Welcome to this room' });
  await exact(welcome, text('msgActions')).click();
  await button(welcome, 'roomReport').click();
  await welcome.getByLabel(text('roomReasonLabel')).fill('Test moderation report');
  await welcome.locator('form').getByRole('button', { name: text('roomReport'), exact: true }).click();
  await exact(s, text('roomReported')).waitFor();
  const adminMessage = transcript(d).locator('li').filter({ hasText: 'Welcome to this room' });
  await exact(adminMessage, text('msgActions')).click();
  await button(adminMessage, 'roomRemove').click();
  await adminMessage.getByLabel(text('roomReasonLabel')).fill('Test moderation removal');
  await adminMessage.locator('form').getByRole('button', { name: text('roomRemove'), exact: true }).click();
  await exact(s, text('roomRemoved')).waitFor();

  // A directory request remains private and does not bypass the recipient's consent.
  await d.getByLabel(text('msgSearch')).fill('שיר');
  const directoryPeople = d.getByRole('navigation', { name: text('msgPeople') });
  await directoryPeople.getByRole('button', { name: sub.nickname, exact: true }).click();
  await d.getByLabel(text('msgOpening')).fill('A private note not for outsiders');
  await button(d, 'msgRequest').click();
  await exact(d, text('convWaiting')).waitFor();
  await thread(s, dom.nickname).click();
  await exact(s, 'A private note not for outsiders').waitFor();
  assert.equal(await s.getByLabel(text('convCompose')).count(), 0);
  assert.equal(await exact(o, 'A private note not for outsiders').count(), 0);
  assert.equal(await thread(o, dom.nickname).count(), 0);
  await button(s, 'convAccept').click();
  await s.getByLabel(text('convCompose')).fill('A reply with consent');
  await button(s, 'roomSend').click();
  await exact(d, 'A reply with consent').waitFor();
  await d.locator('.msg-room-tools > summary').filter({ hasText: text('sessionRequests') }).click();
  await d.getByLabel(text('sessionTitle')).waitFor();
  assert.equal(await exact(o, 'A reply with consent').count(), 0);

  // Test a narrow RTL view, chat selection and focus restoration, then apply a bilateral block.
  await s.setViewportSize({ width: 375, height: 800 });
  await s.getByRole('button', { name: 'עברית', exact: true }).click();
  assert.equal(await s.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await s.locator('#msg-heading bdi').textContent(), dom.nickname);
  assert.equal(await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await s.getByRole('button', { name: text('msgBack','he'), exact: true }).press('Enter');
  assert.equal(await s.evaluate(() => document.activeElement?.id), 'msg-navigation');
  await s.getByRole('navigation', { name: text('convTitle','he') }).getByRole('button', { name: new RegExp(dom.nickname) }).press('Enter');
  assert.equal(await s.evaluate(() => document.activeElement?.id), 'msg-heading');
  await exact(s, 'A reply with consent').waitFor();
  s.once('dialog', (dialog: { accept: () => Promise<void> }) => void dialog.accept());
  await s.getByRole('button', { name: text('roomBlock','he'), exact: true }).click();
  await exact(d, text('errConversation')).waitFor();
  assert.equal(await thread(d, sub.nickname).count(), 0);
  assert.equal(await exact(d, 'A reply with consent').count(), 0);
  await s.getByRole('navigation', { name: text('msgRooms','he') }).getByRole('button', { name: /היכרות/ }).click();
  await exact(s, text('msgReadOnly','he')).waitFor();
  assert.equal(await exact(s, 'Welcome from polling').count(), 0, 'the blocked author is filtered in room history');

  console.log('PASS public messaging browser: desktop and narrow Hebrew/English, keyboard focus, room grants and revoke, SSE and polling, reports/removal, consent, session UI and bilateral block');
} finally {
  await browser?.close();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  await pool.end();
  await db.stop();
  await rm(directory, { recursive: true, force: true });
}
