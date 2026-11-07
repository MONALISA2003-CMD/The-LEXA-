import { expect, type Page } from '@playwright/test';

/**
 * The browser suite is served only by Playwright's isolated Vite dev server with
 * VITE_DATA_PROVIDER=local. Do not point this fixture at any real account/API.
 * LEXA automatically creates the first branch; the old branch-name field was removed.
 */
export async function openLocalBusiness(page: Page, businessName: string): Promise<void> {
  await page.goto('/onboarding');
  await expect(page.getByRole('textbox', { name: /Business name/i })).toBeVisible();
  await page.getByRole('textbox', { name: /Business name/i }).fill(businessName);
  // On mobile the essential-only cookie choice covers the submit button.
  // Record a deliberate privacy choice, never silently accept analytics.
  const essentialOnly = page.getByRole('button', { name: 'Essential only' });
  if (await essentialOnly.isVisible()) await essentialOnly.click();
  await page.getByRole('button', { name: /Create and open my business/i }).click();
  await expect(page).toHaveURL(/\/$/);
  // The Overview headline is allowed to change; assert the opened business is
  // present in the actual dashboard rather than matching retired marketing copy.
  await expect(page.locator('.overview-hero').getByRole('heading')).toContainText(businessName);
  await expect(page.locator('.overview-context strong')).toHaveText(businessName);
}

export async function createLocalProduct(
  page: Page,
  draft: { name: string; sku: string; cost: string; price: string },
): Promise<void> {
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add product', exact: true }).first().click();
  // Dialog title changes from Add to Edit after save; keep a stable locator.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/Product name/i).fill(draft.name);
  await dialog.getByLabel(/SKU \/ internal code/i).fill(draft.sku);
  // Explicitly exercise the generic stock item. Specialist presets can require
  // serial/IMEI or batch specifications that ordinary groceries do not have.
  await dialog.getByLabel('What are you adding?').selectOption('general');
  await dialog.getByRole('button', { name: 'Continue to prices' }).click();
  await dialog.getByLabel(/^Cost price/i).fill(draft.cost);
  await dialog.getByLabel(/^Selling price/i).fill(draft.price);
  await dialog.getByRole('button', { name: /Save product & continue/ }).click();
  // The real save transition enters step 3 and exposes the Finish control.
  // If validation fails this assertion keeps the error visible in the trace.
  await expect(dialog.getByRole('button', { name: /Finish setup/ })).toBeVisible();
  await expect(dialog.getByText('Product saved.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /Finish setup/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(draft.name, { exact: true }).first()).toBeVisible();
}

export async function createLocalCustomer(page: Page, name: string): Promise<void> {
  await page.goto('/modules/customers');
  await page.getByRole('button', { name: 'Add customer', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add customer record' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Customer / business name').fill(name);
  await dialog.getByLabel('Phone number').fill('0700000000');
  await dialog.getByRole('button', { name: 'Save to my business' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Customer record details' })).toContainText(name);
}
