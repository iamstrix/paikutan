import { expect, test } from '@playwright/test';

// Full solo match driven from the real lobby button: a bot plays the local seat
// (autoplay hook) with the host sim sped up, and the match must reach the
// podium with a winner and no errors.

test('bot playtest: a solo match runs from hub to podium', async ({ page }, testInfo) => {
  test.setTimeout(200_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.seed(12345));
  await page.getByRole('button', { name: 'Play with bots' }).click();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.phase)).toBe('hub');

  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setTimeScale(6);
    window.__THREE_GAME_TEST_HOOKS__?.setAutoplay(true);
  });

  const phases = new Set<string>();
  let maxRound = 0;
  const deadline = Date.now() + 170_000;
  while (Date.now() < deadline) {
    const d = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    if (d) {
      phases.add(d.phase);
      maxRound = Math.max(maxRound, d.round);
      if (d.phase === 'podium') break;
    }
    await page.waitForTimeout(250);
  }

  const final = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
  const metrics = { phases: [...phases], rounds: maxRound, players: final?.players, calls: final?.renderer.calls };
  await testInfo.attach('bot-metrics', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });
  console.log('bot metrics', JSON.stringify(metrics));

  expect(final?.phase, 'match should end on the podium').toBe('podium');
  for (const p of ['charge', 'throw', 'fight', 'roundEnd']) expect(phases.has(p), `phase ${p} visited`).toBe(true);
  expect(maxRound).toBeGreaterThan(0);
  expect(Math.max(...(final?.players ?? []).map((p) => p.score))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
