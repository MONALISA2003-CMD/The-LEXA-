import { expect, test } from '@playwright/test';
import { createLocalProduct, openLocalBusiness } from './helpers/localBusiness';

/** This deliberately uses Playwright's isolated local provider, never production. */
test('workspace → product → opening stock → paid sale → refunded return', async ({ page }) => {
  await openLocalBusiness(page, 'LEXA E2E Traders');
  await createLocalProduct(page, { name: 'Rice 5kg', sku: 'RICE-5-E2E', cost: '9000', price: '12000' });

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Opening stock', exact: true }).click();
  const stock = page.getByRole('dialog', { name: 'Record opening stock' });
  await expect(stock.getByLabel(/^Product/)).toContainText('Rice 5kg');
  await stock.getByLabel(/Opening quantity/).fill('10');
  await stock.getByLabel(/^Reason/).fill('Opening stock for E2E');
  await stock.getByRole('button', { name: 'Save movement' }).click();
  await expect(page.getByText('Opening stock recorded')).toBeVisible();

  await page.goto('/checkout');
  await page.getByRole('button', { name: /Rice 5kg/ }).click();
  await page.getByLabel(/Amount received \(UGX\)/).fill('12000');
  await page.getByLabel(/I have independently verified the money received/i).check();
  await page.getByRole('button', { name: /Complete sale & create receipt/ }).click();
  await expect(page).toHaveURL(/\/sales\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Sales receipt' })).toBeVisible();
  await expect(page.getByText(/LEXA-/).first()).toBeVisible();

  await page.getByRole('button', { name: /Record return/ }).click();
  const reversal = page.getByRole('dialog', { name: 'Record a return' });
  await reversal.getByLabel('Quantity to return for Rice 5kg').fill('1');
  await reversal.getByLabel(/^Return reason/).fill('Customer returned an unopened item');
  await reversal.getByLabel('Record a refund').check();
  await reversal.getByRole('button', { name: 'Save return' }).click();
  await expect(page.getByText(/RET-/).first()).toBeVisible();

  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Inventory' }).first()).toBeVisible();
  await expect(page.getByText('Rice 5kg').first()).toBeVisible();
  // One item sold and then restocked: original opening quantity must be restored.
  await expect(page.locator('.inventory-balance-card').getByRole('row').filter({ hasText: 'Rice 5kg' })).toContainText(/\b10\b/);
});
