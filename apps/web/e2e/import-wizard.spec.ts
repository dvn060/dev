/**
 * Import wizard correction flow against the ambiguous fixture archive:
 * review proposed grouping, rename a snapshot, move a file between
 * snapshots, exclude a file, confirm, and verify the resulting snapshots.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, '../../../fixtures/ncm-archives');
const WORKSPACE = `Wizard E2E ${Date.now()}`;

test('grouping correction: rename, move, exclude, confirm', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Acme HQ').fill(WORKSPACE);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(WORKSPACE) }).click();
  await page.getByRole('link', { name: 'Imports' }).click();

  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'ncm-archive-ambiguous.zip'));
  await page.getByPlaceholder('e.g. May 2024 baseline').fill('mixed');
  await page.getByRole('button', { name: 'Preview import' }).click();

  // Ambiguity is flagged; three proposed groups (May, June, undated)
  await expect(page.getByText('Grouping is ambiguous')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Snapshot 1 name')).toHaveValue('mixed (2024-05-01)');
  await expect(page.getByLabel('Snapshot 2 name')).toHaveValue('mixed (2024-06-05)');
  await expect(page.getByLabel('Snapshot 3 name')).toHaveValue('mixed (undated)');

  // Corrections: rename group 1; move the undated LAB file into it;
  // exclude EDGE-FW-01 from group 2.
  await page.getByLabel('Snapshot 1 name').fill('May full');
  await page.getByLabel('Snapshot for LAB-RTR-01').selectOption({ label: '→ May full' });
  const edgeRow = page.locator('li').filter({ hasText: 'EDGE-FW-01' });
  await edgeRow.getByRole('checkbox').check();

  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText(/completed/).first()).toBeVisible({ timeout: 30_000 });

  // Verify the corrected outcome
  await page.getByRole('link', { name: 'Snapshots' }).click();
  const mayRow = page.locator('tr').filter({ hasText: 'May full' });
  await expect(mayRow).toContainText('3'); // CORE + DIST + LAB
  const juneRow = page.locator('tr').filter({ hasText: 'mixed (2024-06-05)' });
  await expect(juneRow).toContainText('1'); // ACCESS only (EDGE excluded)

  await page.getByRole('link', { name: 'May full' }).click();
  await expect(page.getByText('3 devices')).toBeVisible();
  await expect(page.getByRole('link', { name: 'LAB-RTR-01' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'EDGE-FW-01' })).toHaveCount(0);
});
