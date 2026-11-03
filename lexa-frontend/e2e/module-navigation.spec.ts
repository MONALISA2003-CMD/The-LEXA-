import { expect, test } from '@playwright/test';
import { EXISTING_MODULE_LINKS, PHASE_TWO_LINKS } from '../src/modules/operations/moduleCatalog';

/** Local-only navigation smoke test. It must never write to production. */
test('the directory and every registered module render without uncaught browser errors', async ({ page }) => {
  test.setTimeout(300_000);
  const uncaught: string[] = [];
  page.on('pageerror', (error) => { uncaught.push(error.message); });

  await page.goto('/onboarding');
  await page.getByLabel(/Business name/).fill('LEXA navigation smoke business');
  await page.getByLabel(/First branch name/).fill('Main branch');
  await page.getByRole('button', { name: 'Create and open my business' }).click();
  await expect(page.getByRole('heading', { name: /Your business, in focus/i })).toBeVisible();

  await page.getByRole('link', { name: 'All modules' }).click();
  await expect(page).toHaveURL(/\/modules$/);
  await expect(page.getByRole('heading', { name: 'All business modules' })).toBeVisible();
  await expect(page.locator('.module-directory-card')).toHaveCount(EXISTING_MODULE_LINKS.length + PHASE_TWO_LINKS.length);

  // Visiting the routes exercises each lazy module chunk, component rendering,
  // workspace context and error boundary in a clean local-only business.
  for (const { to, title } of [...EXISTING_MODULE_LINKS, ...PHASE_TWO_LINKS]) {
    await page.goto(to);
    await expect(page.locator('.page-content'), `${title}: app shell did not render`).toBeVisible();
    await expect(page.locator('.error-screen'), `${title}: route error boundary rendered`).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/(sign-in|onboarding)(?:\?|$)/);
    expect(uncaught, `Uncaught error while visiting ${title} (${to})`).toEqual([]);
  }
});
