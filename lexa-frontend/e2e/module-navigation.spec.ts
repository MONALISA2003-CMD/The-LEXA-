import { expect, test } from '@playwright/test';
import { EXISTING_MODULE_LINKS, PHASE_TWO_LINKS } from '../src/modules/operations/moduleCatalog';
import { openLocalBusiness } from './helpers/localBusiness';

/** Local-only navigation smoke test. Never write to the production service. */
test('every registered business module renders without uncaught browser errors', async ({ page }) => {
  test.setTimeout(300_000);
  const uncaught: string[] = [];
  page.on('pageerror', (error) => { uncaught.push(error.message); });
  await openLocalBusiness(page, 'LEXA Navigation Smoke Business');

  // The retired /modules directory has been replaced by the permission-aware sidebar.
  const sidebar = page.locator('aside.sidebar[aria-label="Main navigation"]');
  await sidebar.getByRole('textbox', { name: 'Find a page' }).fill('Products');
  await expect(sidebar.getByRole('link', { name: 'Products', exact: true })).toHaveCount(1);
  await sidebar.getByRole('textbox', { name: 'Find a page' }).fill('Checkout');
  await expect(sidebar.getByRole('link', { name: 'Checkout / POS' })).toHaveCount(1);
  await sidebar.getByRole('textbox', { name: 'Find a page' }).fill('');

  // Exercise every lazy module chunk, workspace context and route error boundary.
  for (const { to, title } of [...EXISTING_MODULE_LINKS, ...PHASE_TWO_LINKS]) {
    await page.goto(to);
    await expect(page.locator('.page-content'), `${title}: app shell did not render`).toBeVisible();
    await expect(page.locator('.error-screen'), `${title}: route error boundary rendered`).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/(sign-in|onboarding)(?:\?|$)/);
    expect(uncaught, `Uncaught error while visiting ${title} (${to})`).toEqual([]);
  }
});
