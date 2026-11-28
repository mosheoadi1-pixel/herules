import assert from 'node:assert/strict';
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

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ovadia/Downloadsold/agent/.venv/Lib/site-packages/playwright/driver/package');
process.env.HR_MODE = 'private';
const directory = await mkdtemp(join(tmpdir(), 'her-rules-private-ux-'));
const db = await startDatabase(directory, Number(process.env.PRIVATE_UX_DB_PORT || 55452));
const pool = new pg.Pool({ connectionString: db.url });
let browser: any, server: Server | undefined;
const button = (page: any, name: string) => page.getByRole('button', { name, exact: true });
const noOverflow = async (page: any) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
const focused = async (page: any, id: string) => page.waitForFunction((value: string) => document.activeElement?.id === value, id);
const screenshots = process.env.HR_REVIEW_SCREENSHOTS;
const capture = async (page: any, name: string) => {
  if (screenshots) await page.screenshot({ path: join(screenshots, `${name}.png`), animations: 'disabled' });
};
const luminosity = (rgb: string) => rgb.match(/\d+/g)!.slice(0, 3).map(Number).map(channel => {
  const value = channel / 255;
  return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
}).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
const ratio = (a: string, b: string) => {
  const aa = luminosity(a), bb = luminosity(b);
  return (Math.max(aa, bb) + .05) / (Math.min(aa, bb) + .05);
};
const screenshotsWithContrast = async (page: any, name: string) => {
  const colors = await page.locator('.private-entrance .auth').evaluate((auth: HTMLElement) => {
    const enter = getComputedStyle(auth.querySelector('button')!);
    const note = getComputedStyle(auth.querySelector('.private-entry-note')!);
    return [enter.color, enter.backgroundColor, note.color];
  });
  // Check the note against the brightest stop of the auth background gradient.
  const ratios = [ratio(colors[0], colors[1]), ratio(colors[2], 'rgb(52, 24, 21)')];
  assert.ok(ratios.every(value => value >= 4.5), `Entry text contrast ${ratios}`);
  await capture(page, name);
};

try {
  const app = await createApp(pool, 'http://localhost:4194');
  app.use(express.static('dist'));
  const listener = app.listen(0);
  server = listener;
  await new Promise(resolve => listener.once('listening', resolve));
  const url = `http://localhost:${(listener.address() as AddressInfo).port}`;
  browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const phone = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });
  const wife = await desktop.newPage(), husband = await phone.newPage();
  const errors: string[] = [];
  for (const page of [wife, husband]) page.on('pageerror', (error: Error) => errors.push(error.message));
  await Promise.all([wife.goto(url), husband.goto(url)]);
  await husband.locator('#private-entry-title').waitFor();
  assert.equal(await husband.locator('html').getAttribute('dir'), 'rtl');
  assert.equal(await husband.locator('.private-artwork-frame').evaluate((frame: HTMLElement) => getComputedStyle(frame).animationName), 'none');
  assert.equal(await husband.locator('.private-artwork').getAttribute('data-revealed'), null);
  await screenshotsWithContrast(husband, 'private-entry-375-he');
  await button(wife, 'English').click();
  await button(wife, 'Enter').waitFor();
  await screenshotsWithContrast(wife, 'private-entry-desktop-en');
  await wife.waitForFunction(() => document.querySelector<HTMLElement>('.private-artwork')?.style.getPropertyValue('--private-drift'));
  // Scroll in a shorter desktop viewport so the visual-only movement is observable.
  await wife.setViewportSize({ width: 1200, height: 580 });
  await wife.waitForFunction(() => scrollY === 0 && document.documentElement.scrollHeight > innerHeight);
  const before = await wife.locator('.private-artwork').evaluate((scene: HTMLElement) => scene.style.getPropertyValue('--private-drift'));
  await wife.evaluate(() => scrollBy(0, 85));
  await wife.waitForFunction((previous: string) => {
    const next = document.querySelector<HTMLElement>('.private-artwork')?.style.getPropertyValue('--private-drift') ?? '';
    return next && next !== previous && Math.abs(parseFloat(next)) <= 14;
  }, before);
  await wife.emulateMedia({ reducedMotion: 'reduce' });
  await wife.waitForFunction(() => !document.querySelector<HTMLElement>('.private-artwork')?.style.getPropertyValue('--private-drift'));
  await wife.setViewportSize({ width: 1365, height: 900 });
  await wife.evaluate(() => scrollTo(0, 0));
  const staticPage = await desktop.newPage();
  await staticPage.addInitScript(() => Reflect.deleteProperty(window, 'IntersectionObserver'));
  await staticPage.goto(url);
  await staticPage.locator('.private-artwork').waitFor();
  assert.equal(await staticPage.locator('.private-artwork').getAttribute('data-revealed'), null);
  await staticPage.close();

  for (const [page, names] of [[wife, ['Enter']], [husband, ['כניסה', 'Enter']]] as const) {
    for (const name of names) {
      if (page === husband && name === 'Enter') await button(page, 'English').click();
      const enter = button(page, name), box = await enter.boundingBox();
      assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= (page.viewportSize()?.height ?? 0), `Above-fold ${name}`);
      assert.equal(await page.evaluate(() => scrollY), 0);
      await noOverflow(page);
      assert.equal(await page.getByLabel('Email', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: /Google|Apple/ }).count(), 0);
    }
  }
  await capture(husband, 'private-entry-375-en');
  await button(husband, 'עברית').click();
  await button(wife, 'עברית').focus();
  await wife.keyboard.press('Tab');
  assert.ok(await wife.getByLabel('Role', { exact: true }).evaluate((el: Element) => el === document.activeElement && getComputedStyle(el).outlineWidth === '3px'));
  await wife.keyboard.press('Tab');
  await wife.keyboard.press('Tab');
  assert.ok(await button(wife, 'Enter').evaluate((el: Element) => el === document.activeElement && getComputedStyle(el).outlineStyle === 'solid'));
  await wife.keyboard.press('Enter');
  assert.equal((await wife.request.get(`${url}/api/state`)).status(), 401, 'Adult participation checkbox remains required');
  await wife.getByRole('checkbox').check();
  await button(wife, 'Enter').press('Enter');
  await wife.getByRole('heading', { name: 'Waiting for the second player' }).waitFor();
  await focused(wife, 'private-game-title');
  await husband.locator('select[name="role"]').selectOption('husband');
  await husband.getByRole('checkbox').check();
  await button(husband, 'כניסה').press('Enter');
  await husband.getByRole('region', { name: 'הצעד הבא' }).waitFor();
  await focused(husband, 'private-game-title');
  const invitations = await husband.getByRole('heading', { name: 'ההזמנות שלכם', exact: true }).boundingBox();
  assert.ok(invitations && invitations.y + invitations.height <= 667, 'Invitations heading fits on the first mobile screen');
  await capture(husband, 'private-game-375-he');
  await button(husband, 'English').click();
  await noOverflow(husband);
  await capture(husband, 'private-game-375-en');

  const next = wife.getByRole('region', { name: 'Next step' });
  const sessions = async () => (await (await wife.request.get(`${url}/api/state`)).json()).sessions as {
    id: string; status: string; started: boolean; approvals: string[]; points: number; missions: { status: string }[];
  }[];
  const snapshot = async () => (await sessions()).find(session => session.status === 'active')!;
  const session = await snapshot();
  assert.equal(session.status, 'active');
  assert.equal(session.started, true);
  assert.deepEqual(session.approvals, []);
  await next.getByRole('button', { name: 'Draft a mission', exact: true }).waitFor();
  await wife.getByText('There’s no active invitation.', { exact: true }).waitFor();
  await capture(wife, 'private-game-desktop-en');
  await next.getByRole('button', { name: 'Draft a mission', exact: true }).press('Enter');
  const title = wife.getByLabel('Title', { exact: true });
  assert.ok(await title.evaluate((el: Element) => el === document.activeElement));
  await title.fill('Optional tea');
  await wife.getByLabel('Mission text and boundaries').fill('Would you like to share a cup of tea?');
  await wife.getByLabel('Secret until sent explicitly', { exact: false }).check();
  await button(wife, 'Save draft only').click();
  await wife.getByRole('heading', { name: 'Optional tea', exact: true }).waitFor();
  assert.equal(await husband.getByRole('heading', { name: 'Optional tea', exact: true }).count(), 0);
  await button(wife, 'Send now').click();
  const current = husband.getByRole('region', { name: 'Current invitation', exact: true });
  await current.getByRole('heading', { name: 'Optional tea', exact: true }).waitFor();
  assert.equal((await snapshot()).missions[0].status, 'pending');
  assert.equal(await button(husband, 'Done').count(), 0);
  const nav = husband.getByRole('navigation');
  const more = nav.getByRole('button', { name: /^More\b/ });
  const updates = nav.getByRole('button', { name: /^Updates\b/ });
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  assert.equal(await updates.isVisible(), false);
  await more.press('Enter');
  await updates.press('Enter');
  assert.equal(await updates.getAttribute('aria-current'), 'page');
  await husband.getByRole('heading', { name: 'Session history', exact: true }).waitFor();
  await nav.getByRole('button', { name: 'Messages', exact: true }).click();
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  assert.equal(await nav.getByRole('button', { name: 'Messages', exact: true }).getAttribute('aria-current'), 'page');
  await button(husband, 'View current invitation').press('Enter');
  const article = current.locator('article');
  const articleId = await article.getAttribute('id');
  assert.ok(articleId);
  await focused(husband, articleId);
  assert.equal(await article.evaluate((el: Element) => getComputedStyle(el).outlineStyle), 'solid');
  await button(husband, 'Accept invitation').click();
  await button(husband, 'Pause my play').click();
  await button(husband, 'Release my pause').waitFor();
  assert.equal(await button(husband, 'Done').isDisabled(), true);
  await button(husband, 'Release my pause').click();
  await button(husband, 'Done').click();
  await wife.getByRole('navigation').getByRole('button', { name: 'Dashboard', exact: true }).click();
  const review = wife.locator('.dashboard-attention');
  await review.getByText('Needs attention', { exact: true }).waitFor();
  await review.getByRole('button', { name: 'Approve and award once', exact: true }).click();
  await wife.getByRole('navigation').getByRole('button', { name: 'Rewards & wishes', exact: true }).click();
  await wife.getByText('His points to spend on rewards: 5', { exact: true }).waitFor();
  assert.equal((await snapshot()).points, 5);
  for (const page of [wife, husband]) {
    await page.getByRole('navigation').getByRole('button', { name: 'Dashboard', exact: true }).click();
    await noOverflow(page);
  }
  await capture(wife, 'private-dashboard-desktop-en');
  await capture(husband, 'private-dashboard-375-en');
  await husband.getByText('Preferences', { exact: true }).click();
  await button(husband, 'High contrast').press('Enter');
  assert.equal(await button(husband, 'High contrast').getAttribute('aria-pressed'), 'true');
  await button(wife, 'Archive & new session').click();
  const archive = wife.getByRole('dialog', { name: 'Archive and start a new session?' });
  const restarted = wife.waitForResponse((response: any) => response.url().endsWith('/restart') && response.request().method() === 'POST');
  await archive.getByRole('button', { name: 'Archive and start a new session', exact: true }).click();
  assert.equal((await restarted).status(), 200);
  const fresh = await snapshot();
  assert.notEqual(fresh.id, session.id);
  assert.deepEqual(fresh.missions, []);
  assert.equal(fresh.points, 5);
  assert.equal((await sessions()).find(item => item.id === session.id)?.status, 'stopped');
  await button(husband, 'Sign out').click();
  await focused(husband, 'private-entry-title');
  assert.equal(await husband.evaluate(() => scrollY), 0);
  assert.equal((await husband.request.get(`${url}/api/state`)).status(), 401);
  assert.deepEqual(errors, []);
  console.log('PASS private UX: desktop + 375px Hebrew/English, above-fold role entry, keyboard/focus, entry contrast, bounded motion/static fallback, role pairing, invitation choice, pause, review/points and sign-out');
} finally {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
  await pool.end();
  await db.stop();
  await rm(directory, { recursive: true, force: true });
}
