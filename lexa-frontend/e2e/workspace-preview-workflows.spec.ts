import { expect, test } from '@playwright/test';
import { createLocalCustomer, createLocalProduct, openLocalBusiness } from './helpers/localBusiness';

test('multi-line quotation recalculates totals and persists in this local business', async ({ page }) => {
  await openLocalBusiness(page, 'LEXA Workflow Test Business');
  await createLocalProduct(page, { name: 'Rice 5kg', sku: 'RICE-QUOTE', cost: '800', price: '1000' });
  await createLocalProduct(page, { name: 'Cooking oil', sku: 'OIL-QUOTE', cost: '2000', price: '2500' });
  await createLocalCustomer(page, 'Workflow Test Customer');

  await page.goto('/modules/quotations');
  await expect(page.getByRole('heading', { name: 'Prepare a quotation' })).toBeVisible();
  await page.getByLabel(/^Customer \*/).selectOption({ label: 'Workflow Test Customer' });
  await page.getByLabel('Product 1').selectOption({ label: 'Rice 5kg · RICE-QUOTE' });
  await page.getByLabel(/^Quantity$/).first().fill('2');
  await page.getByLabel(/^Unit price/).first().fill('1000');
  await page.getByLabel('Discount %').first().fill('10');
  await page.getByRole('button', { name: 'Add another product' }).click();
  await page.getByLabel('Product 2').selectOption({ label: 'Cooking oil · OIL-QUOTE' });
  await page.getByLabel(/^Quantity$/).nth(1).fill('3');
  await page.getByLabel(/^Unit price/).nth(1).fill('2500');
  await expect(page.locator('.selling-quote-submit')).toContainText('9,300');
  await page.getByRole('button', { name: 'Save quotation' }).click();
  await expect(page.locator('.selling-quote-list article').first()).toContainText('Workflow Test Customer');

  // Reload to prove persistence, not just a React state update.
  await page.reload();
  await expect(page.locator('.selling-quote-list article').first()).toContainText('Workflow Test Customer');
  await expect(page.locator('.selling-quote-list article').first()).toContainText('9,300');
});

test('local-only reports do not claim authoritative server data', async ({ page }) => {
  await openLocalBusiness(page, 'LEXA Reports Test Business');
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: /Business Reports.*made clear/i })).toBeVisible();
  await expect(page.getByText(/Local-only data is not presented as a server-verified report/i)).toBeVisible();
  await expect(page.locator('.lexa-intel-content')).toHaveCount(0);
});

test('mobile navigation can find and open manufacturing modules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLocalBusiness(page, 'LEXA Mobile Navigation Business');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
  await sidebar.getByRole('textbox', { name: 'Find a module' }).fill('materials');
  await sidebar.getByRole('link', { name: 'Bills of materials' }).click();
  await expect(page).toHaveURL(/\/modules\/boms$/);
  await expect(page.getByRole('heading', { name: 'Bills of materials' }).first()).toBeVisible();
});
