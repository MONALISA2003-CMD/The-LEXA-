import { expect, test } from '@playwright/test';
import { createLocalProduct, openLocalBusiness } from './helpers/localBusiness';

/** This deliberately uses Playwright's isolated local provider, never production. */
test('workspace → product → opening stock → paid sale → refunded return', async ({ page }) => {
  await openLocalBusiness(page, 'LEXA E2E Traders');
  await createLocalProduct(page, { name: 'Rice 5kg', sku: 'RICE-5-E2E', cost: '9000', price: '12000' });

  await page.goto('/inventory');
  // Inventory's visible action is 'Record opening stock'. The legacy
  // 'Opening stock' button is hidden by the current Stock & movements design.
  // Scope to the hero action, which is unique even when the empty movement
  // history also offers a 'Record opening stock' button.
  await expect(page.locator('.solar-inventory .solar-hero h1')).toHaveText('Stock & movements');
  const openingStock = page.locator('.solar-inventory .solar-hero-actions')
    .getByRole('button', { name: 'Record opening stock', exact: true });
  await expect(openingStock).toBeEnabled();
  await openingStock.click();
  const stock = page.getByRole('dialog', { name: 'Record opening stock' });
  // Assert the selected product, not merely the presence of an option.
  await expect(stock.getByRole('combobox', { name: /^Product/ }).locator('option:checked'))
    .toContainText('Rice 5kg');
  await stock.getByLabel(/Opening quantity/).fill('10');
  await stock.getByLabel(/^Reason/).fill('Opening stock for E2E');
  await stock.getByRole('button', { name: 'Save movement' }).click();
  await expect(stock).toHaveCount(0);
  await expect(page.getByText('Opening stock recorded')).toBeVisible();
  // Verify that inventory really persisted the opening movement before selling.
  const balanceRow = page.locator('.inventory-balance-card').getByRole('row')
    .filter({ hasText: 'Rice 5kg' });
  await expect(balanceRow.getByRole('cell').nth(2), 'Opening stock must show exactly 10 units on hand').toHaveText('10');

  await page.goto('/checkout');
  await page.getByRole('button', { name: /Rice 5kg/ }).click();
  await page.getByLabel(/Amount received \(UGX\)/).fill('12000');
  await page.getByLabel(/I have independently verified the money received/i).check();
  await page.getByRole('button', { name: /Complete sale & create receipt/ }).click();
  await expect(page).toHaveURL(/\/sales\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Sales receipt' })).toBeVisible();
  await expect(page.getByText(/LEXA-/).first()).toBeVisible();
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

  // Check the stock debit before recording the return. The checkout must debit one unit.
  const receiptUrl = page.url();
  await page.goto('/inventory');
  await expect(page.locator('.inventory-balance-card').getByRole('row')
    .filter({ hasText: 'Rice 5kg' }).getByRole('cell').nth(2),
  'A paid one-unit sale must reduce stock from 10 to 9').toHaveText('9');
  await page.goto(receiptUrl);
  await expect(page.getByRole('heading', { name: 'Sales receipt' })).toBeVisible();

  await page.getByRole('button', { name: /Record return/ }).click();
  const reversal = page.getByRole('dialog', { name: 'Record a return' });
  await reversal.getByLabel('Quantity to return for Rice 5kg').fill('1');
  await reversal.getByLabel(/^Return reason/).fill('Customer returned an unopened item');
  await reversal.getByLabel('Record a refund').check();
  await reversal.getByRole('button', { name: 'Save return' }).click();
  await expect(reversal).toHaveCount(0);
  await expect(page.getByText(/RET-/).first()).toBeVisible();
  await expect(page.getByText('Refund record included')).toBeVisible();

  await page.goto('/inventory');
  await expect(page.locator('.solar-inventory .solar-hero h1')).toHaveText('Stock & movements');
  await expect(page.getByText('Rice 5kg').first()).toBeVisible();
  // One item sold and then restocked: original opening quantity must be restored.
  await expect(page.locator('.inventory-balance-card').getByRole('row').filter({ hasText: 'Rice 5kg' }).getByRole('cell').nth(2), 'Restocked sale must restore exactly 10 units on hand').toHaveText('10');
});
