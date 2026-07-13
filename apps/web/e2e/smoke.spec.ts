/**
 * Critical-workflow smoke test: workspace -> NCM archive import -> devices ->
 * evidence viewer -> path analysis (honest degraded verdict) -> diff suspects.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, '../../../fixtures/ncm-archives');

const WORKSPACE = `E2E ${Date.now()}`;

test('full investigation workflow', async ({ page }) => {
  await page.goto('/');

  // Create a workspace
  await page.getByPlaceholder('Acme HQ').fill(WORKSPACE);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(WORKSPACE) }).click();

  // Import the baseline NCM archive
  await page.getByRole('link', { name: 'Imports' }).click();
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'ncm-archive-baseline.zip'));
  await page.getByPlaceholder('e.g. May 2024 baseline').fill('Baseline');
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText(/completed/).first()).toBeVisible({ timeout: 15_000 });

  // Import the changed archive
  await page.setInputFiles('input[type=file]', path.join(FIXTURES, 'ncm-archive-changed.zip'));
  await page.getByPlaceholder('e.g. May 2024 baseline').fill('Changed');
  await page.getByRole('button', { name: 'Preview import' }).click();
  await page.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page.getByText(/completed/).nth(1)).toBeVisible({ timeout: 15_000 });

  // Snapshot shows 5 devices; open a device and its evidence
  await page.getByRole('link', { name: 'Snapshots' }).click();
  await page.getByRole('link', { name: 'Baseline' }).click();
  await expect(page.getByText('5 devices')).toBeVisible();
  await page.getByRole('link', { name: 'DIST-SW-01' }).click();
  await expect(page.getByText(/% parsed/)).toBeVisible();

  // ACL tab -> click an evidence line -> config viewer highlights it
  await page.getByRole('button', { name: /ACLs/ }).click();
  await expect(page.getByText('SERVERS-IN')).toBeVisible();
  await page.getByRole('link', { name: /^L\d+$/ }).first().click();
  await expect(page).toHaveURL(/config\?lines=/);
  await expect(page.getByText('Configuration', { exact: true })).toBeVisible();

  // Path analysis: engine off -> verdict must be Unknown, with evidence
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await page.getByRole('link', { name: 'Path analysis' }).click();
  await page.getByPlaceholder('10.10.10.42').fill('10.10.10.42');
  await page.getByPlaceholder('10.10.20.50').fill('10.10.20.50');
  await page.getByPlaceholder('443').fill('443');
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByText('Unknown', { exact: true })).toBeVisible();
  await expect(page.getByText('Candidate evidence (inferred)')).toBeVisible();

  // Compare & root cause: the removed ACL permit must rank first
  await page.getByRole('link', { name: 'Compare & root cause' }).click();
  await expect(page.getByText('devices changed')).toBeVisible();
  const suspectForm = page.locator('form').filter({ hasText: 'Rank suspects' });
  await suspectForm.getByPlaceholder('10.10.10.42').fill('10.10.10.42');
  await suspectForm.getByPlaceholder('10.10.20.50').fill('10.10.20.50');
  await suspectForm.getByPlaceholder('443').fill('443');
  await page.getByRole('button', { name: 'Rank suspects' }).click();
  await expect(page.getByText(/entry removed: .*eq 443/)).toBeVisible();
  await expect(page.getByText('score 100')).toBeVisible();
});
