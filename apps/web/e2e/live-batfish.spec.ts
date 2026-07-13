/**
 * Live-stack e2e: requires the docker-compose stack (api + Batfish) running
 * on localhost:8000. Gated behind PW_LIVE_STACK=1.
 *
 * Asserts that DISTINCT Batfish dispositions surface in the UI — denied by
 * ingress vs egress filter, no route, null routed, delivered — never a
 * collapsed generic "blocked". Also exercises engine-verified differential
 * reachability and the redacted config viewer/report.
 */
import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, '../../../fixtures/ncm-archives');

test.skip(!process.env.PW_LIVE_STACK, 'requires live docker-compose stack (PW_LIVE_STACK=1)');

const WORKSPACE = `Live E2E ${Date.now()}`;

async function importArchive(page: Page, file: string, name: string, position: number) {
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, file));
  await page.getByPlaceholder('e.g. May 2024 baseline').fill(name);
  await page.getByRole('button', { name: 'Preview import' }).click();
  await expect(page.getByTestId('import-wizard')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText(/completed/).nth(position)).toBeVisible({ timeout: 30_000 });
}

async function analyze(page: Page, snapshot: string, src: string, dst: string, port?: string) {
  await page.locator('select').first().selectOption({ label: snapshot });
  await page.getByPlaceholder('10.10.10.42').fill(src);
  await page.getByPlaceholder('10.10.20.50').fill(dst);
  if (port !== undefined) await page.getByPlaceholder('443').fill(port);
  await page.getByRole('button', { name: 'Analyze' }).click();
}

test('distinct dispositions, differential reachability, redaction', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');

  // Workspace + three snapshots
  await page.getByPlaceholder('Acme HQ').fill(WORKSPACE);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(WORKSPACE) }).click();
  await page.getByRole('link', { name: 'Imports' }).click();
  await importArchive(page, 'ncm-archive-baseline.zip', 'baseline', 0);
  await importArchive(page, 'ncm-archive-changed.zip', 'changed', 1);
  await importArchive(page, 'ncm-archive-restored.zip', 'restored', 2);

  await page.getByRole('link', { name: 'Path analysis' }).click();

  // 1. baseline permitted flow -> Delivered
  await analyze(page, 'baseline', '10.10.10.42', '10.10.20.50', '443');
  await expect(page.getByText('Delivered to destination subnet')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Computed by analysis engine')).toBeVisible();

  // 2. changed snapshot: same flow -> Denied by EGRESS filter (not generic)
  await analyze(page, 'changed', '10.10.10.42', '10.10.20.50', '443');
  await expect(page.getByText('Denied by egress filter')).toBeVisible({ timeout: 120_000 });

  // 3. denied-in flow (edge ingress ACL): smtp to internet
  await analyze(page, 'baseline', '10.10.10.42', '203.0.113.9', '25');
  await expect(page.getByText('Denied by ingress filter')).toBeVisible({ timeout: 120_000 });

  // 4. no-route flow (LAB router has no default route)
  await analyze(page, 'baseline', '10.10.60.5', '10.10.20.50', '443');
  await expect(page.getByText('No route to destination')).toBeVisible({ timeout: 120_000 });

  // 5. null-routed flow (blackhole on CORE)
  await analyze(page, 'baseline', '10.10.10.42', '10.66.66.6', '443');
  await expect(page.getByText('Null routed (blackholed)')).toBeVisible({ timeout: 120_000 });

  // 6. restored snapshot: broken flow works again
  await analyze(page, 'restored', '10.10.10.42', '10.10.20.50', '443');
  await expect(page.getByText('Delivered to destination subnet')).toBeVisible({ timeout: 120_000 });

  // 7. Differential reachability: engine-computed was/now transition
  await page.getByRole('link', { name: 'Compare & root cause' }).click();
  await page.locator('select').first().selectOption({ label: 'baseline' });
  await page.locator('select').nth(1).selectOption({ label: 'changed' });
  await expect(page.getByText('devices changed')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Compute impact/ }).click();
  await expect(page.getByText('was: Delivered to destination subnet').first())
    .toBeVisible({ timeout: 180_000 });
  await expect(page.getByText('now: Denied by egress filter').first()).toBeVisible();
  // Heuristic is present but labeled as the fallback
  await expect(page.getByText(/temporal correlation only/)).toBeVisible();

  // 8. Findings tab: >=5 distinct finding kinds, engine consulted, and
  //    evidence click-through to the exact config lines
  await page.getByRole('link', { name: 'Snapshots' }).click();
  await page.getByRole('link', { name: 'baseline', exact: true }).click();
  await expect(page.getByText('5 devices')).toBeVisible();
  await page.getByRole('button', { name: 'Findings' }).click();
  await expect(page.getByText('Analysis engine consulted')).toBeVisible({ timeout: 120_000 });
  for (const kind of ['duplicate_ip', 'acl_undefined', 'overlapping_subnets',
                      'trunk_all_vlans', 'acl_unused', 'stale_snapshot']) {
    await expect(page.getByTestId(`finding-${kind}`)).toBeVisible();
  }
  // Hygiene findings must say what they are, not masquerade as security
  await expect(page.getByTestId('finding-acl_unused'))
    .toContainText('not a security finding');
  // Evidence click-through: duplicate IP -> LAB-RTR-01 config, lines highlighted
  await page
    .getByTestId('finding-duplicate_ip')
    .getByRole('link', { name: /LAB-RTR-01/ })
    .click();
  await expect(page).toHaveURL(/\/devices\/.+\/config\?lines=/);
  await expect(page.getByText('10.255.0.1 255.255.255.255').first()).toBeVisible();
  await page.goBack();

  // 9. Redacted config viewer with explicit reveal
  await page.getByRole('button', { name: 'Devices' }).click();
  await page.getByRole('link', { name: 'DIST-SW-01' }).click();
  await page.getByRole('button', { name: 'View configuration' }).click();
  await expect(page.getByText(/secret values? redacted/)).toBeVisible();
  await expect(page.getByText('<REDACTED>').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show secrets' }).click();
  await expect(page.getByText(/Unredacted view/)).toBeVisible();
});
