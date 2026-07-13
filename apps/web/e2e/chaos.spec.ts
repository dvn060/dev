/**
 * Chaos: kill the Batfish container mid-session and verify the UI degrades
 * honestly — clear banner, Unknown verdicts, no crashes, no infinite
 * spinners — then recovers without an app restart.
 *
 * Gated behind PW_CHAOS=1; requires the docker-compose stack and permission
 * to docker kill/start dev-batfish-1. Uses pre-imported "Night session"
 * workspace snapshots.
 */
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test.skip(!process.env.PW_CHAOS, 'requires live stack + docker control (PW_CHAOS=1)');

function docker(cmd: string) {
  execFileSync('docker', [cmd, 'dev-batfish-1'], { stdio: 'ignore' });
}

test('UI degrades honestly when Batfish dies, recovers when it returns', async ({ page }) => {
  test.setTimeout(360_000);
  try {
    docker('kill');
    // Health cache is 30s; wait it out so the app has noticed.
    await page.waitForTimeout(31_000);

    await page.goto('/');
    await expect(page.getByText('Analysis engine: unavailable')).toBeVisible({
      timeout: 15_000,
    });

    // Path analysis still answers — honestly — and does not hang or crash.
    await page.getByRole('link', { name: /Night session/ }).click();
    await page.getByRole('link', { name: 'Path analysis' }).click();
    await page.locator('select').first().selectOption({ label: 'baseline-v3' });
    await page.getByPlaceholder('10.10.10.42').fill('10.10.10.42');
    await page.getByPlaceholder('10.10.20.50').fill('10.10.20.50');
    await page.getByPlaceholder('443').fill('443');
    await page.getByRole('button', { name: 'Analyze' }).click();
    await expect(page.getByText('Unknown', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No behavioral verdict (engine unavailable)')).toBeVisible();
    await expect(page.getByText('Candidate evidence (inferred)')).toBeVisible();

    // Differential reachability panel reports unavailability instead of spinning.
    await page.getByRole('link', { name: 'Compare & root cause' }).click();
    await page.getByRole('button', { name: /Compute impact/ }).click();
    await expect(page.getByText('Analysis engine unavailable')).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    docker('start');
  }

  // Recovery without reloading the app process: banner flips back and a
  // real verdict comes through.
  await expect
    .poll(
      async () => {
        const resp = await page.request.get('/api/health');
        const body = await resp.json();
        return body.batfish.available;
      },
      { timeout: 180_000, intervals: [5_000] },
    )
    .toBe(true);

  await page.getByRole('link', { name: 'Path analysis' }).click();
  await page.locator('select').first().selectOption({ label: 'baseline-v3' });
  await page.getByPlaceholder('10.10.10.42').fill('10.10.10.42');
  await page.getByPlaceholder('10.10.20.50').fill('10.10.20.50');
  await page.getByPlaceholder('443').fill('443');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Delivered to destination subnet')).toBeVisible({
    timeout: 120_000,
  });
});
