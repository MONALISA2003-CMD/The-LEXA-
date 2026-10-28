import { expect, test, type Page } from '@playwright/test';

async function openWorkspace(page: Page) {
  await page.goto('/');
  if (new URL(page.url()).pathname === '/onboarding') {
    await page.getByLabel(/Business name/).fill('LEXA Phase 3 Test Business');
    await page.getByLabel(/First branch name/).fill('Main branch');
    await page.getByRole('button', { name: /Create workspace/ }).click();
  }
  await expect(page.getByRole('heading', { name: /clear records/i })).toBeVisible();
}

test('multi-line quotation recalculates totals and persists to the scoped preview register', async ({ page }) => {
  await openWorkspace(page);
  await page.goto('/modules/quotations');
  await page.getByRole('button', { name: /New quotation/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Customer').fill('Phase 3 Test Customer');
  await dialog.getByLabel(/Discount/).fill('10');
  await dialog.getByLabel('Item or service 1').fill('Rice 5kg');
  await dialog.getByLabel('Quantity for line 1').fill('2');
  await dialog.getByLabel('Unit amount for line 1').fill('1000');
  await dialog.getByRole('button', { name: /Add line/ }).click();
  await dialog.getByLabel('Item or service 2').fill('Cooking oil');
  await dialog.getByLabel('Quantity for line 2').fill('3');
  await dialog.getByLabel('Unit amount for line 2').fill('2500');
  await expect(dialog.getByText(/Document total/)).toBeVisible();
  await expect(dialog.getByText(/10,089/)).toBeVisible();
  await dialog.getByRole('button', { name: /Save preview record/ }).click();
  await expect(page.getByText('Preview record created')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search Quotations' }).fill('Phase 3 Test Customer');
  await expect(page.getByRole('row').filter({ hasText: 'Phase 3 Test Customer' })).toBeVisible();
});

test('report centre supports upcoming periods and exports the selected preview report', async ({ page }) => {
  await openWorkspace(page);
  await page.goto('/modules/reports');
  await page.getByLabel('Select report').selectOption('Recurring billing forecast');
  await page.getByLabel('Reporting period').selectOption('Next 30 days');
  await expect(page.getByRole('heading', { name: 'Recurring billing forecast' })).toBeVisible();
  await expect(page.getByText(/Next 30 days/).first()).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export CSV/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('lexa-preview-report-recurring-billing-forecast');
});

test('mobile navigation opens, reaches the module directory, and finds manufacturing screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'All modules' }).click();
  await page.getByLabel('Search all modules').fill('BOM');
  await expect(page.getByRole('link', { name: /Bills of materials \/ recipes/ })).toBeVisible();
  await page.getByRole('link', { name: /Bills of materials \/ recipes/ }).click();
  await expect(page.getByRole('heading', { name: /Bills of materials \/ recipes/ })).toBeVisible();
});
