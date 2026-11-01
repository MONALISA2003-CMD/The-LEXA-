import { expect, test } from '@playwright/test';

test('workspace → product → opening stock → sale → return workflow', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel(/Business name/).fill('LEXA E2E Traders');
  await page.getByLabel(/First branch name/).fill('Main branch');
  await page.getByRole('button', { name: /Create workspace/ }).click();
  await expect(page.getByRole('heading', { name: /clear records/i })).toBeVisible();

  await page.getByRole('link', { name: 'Products' }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  await page.getByLabel(/Product name/).fill('Rice 5kg');
  await page.getByLabel(/SKU \/ internal code/).fill('RICE-5-E2E');
  await page.getByLabel(/Cost price/).fill('9000');
  await page.getByLabel(/Selling price/).fill('12000');
  await page.getByRole('button', { name: /Save product/ }).click();
  await expect(page.getByText('Rice 5kg')).toBeVisible();

  await page.getByRole('link', { name: 'Inventory' }).click();
  await page.getByRole('button', { name: 'Opening stock' }).click();
  await page.getByLabel(/Opening quantity/).fill('10');
  await page.getByLabel(/^Reason/).fill('Opening stock for E2E');
  await page.getByRole('button', { name: /Save movement/ }).click();
  await expect(page.getByText('Opening stock recorded')).toBeVisible();

  await page.getByRole('link', { name: 'Checkout' }).click();
  await page.getByRole('button', { name: /Rice 5kg/ }).click();
  await page.getByRole('button', { name: /Complete sale & create receipt/ }).click();
  await expect(page.getByRole('heading', { name: 'Sale details' }).first()).toBeVisible();
  await expect(page.getByText(/LEXA-/)).toBeVisible();

  await page.getByRole('button', { name: /Record return/ }).click();
  await page.getByLabel(/Quantity to return for Rice 5kg/).fill('1');
  await page.getByLabel(/Record a refund/).check();
  await page.getByRole('button', { name: /Save return/ }).click();
  await expect(page.getByText(/RET-/)).toBeVisible();

  await page.getByRole('link', { name: 'Inventory' }).click();
  await expect(page.getByText('10', { exact: true })).toBeVisible();
});
