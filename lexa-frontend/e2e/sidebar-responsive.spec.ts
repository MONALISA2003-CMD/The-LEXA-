import { expect, test } from '@playwright/test';
import { openLocalBusiness } from './helpers/localBusiness';

/** The local-only Playwright web server must never have a production API origin. */
test('LEXA navigation keeps one dark sidebar and the business-area links work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openLocalBusiness(page, 'LEXA Sidebar Desktop Test');
  const sidebar = page.getByRole('complementary', { name: 'Main navigation' });
  await expect(sidebar).toHaveCSS('background-color', 'rgb(11, 31, 58)');
  await expect(sidebar.getByText('BUSINESS AREAS')).toBeVisible();
  await sidebar.getByRole('button', { name: 'Finance', exact: true }).click();
  await expect(sidebar.getByRole('link', { name: 'Financial overview' })).toBeVisible();
  await sidebar.getByRole('link', { name: 'Financial overview' }).click();
  await expect(page).toHaveURL(/\/modules\/finance-overview$/);
  await expect(sidebar).toHaveCSS('background-color', 'rgb(11, 31, 58)');
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(sidebar).toHaveCSS('background-color', 'rgb(11, 31, 58)');
  await expect(sidebar.getByRole('link', { name: 'Financial overview' })).toHaveClass(/nav-link-active/);
});

test('mobile navigation is usable at 320px, traps focus and can be dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openLocalBusiness(page, 'LEXA Sidebar Phone Test');
  const open = page.getByRole('button', { name: 'Open navigation' });
  await open.click();
  const sidebar = page.getByRole('dialog', { name: 'Main navigation' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveCSS('background-color', 'rgb(11, 31, 58)');
  await expect(sidebar.getByRole('link', { name: 'Account & business settings' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidebar).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  const drawer = page.getByRole('dialog', { name: 'Main navigation' });
  await drawer.getByRole('textbox', { name: 'Find a page' }).fill('Bank & cash');
  await expect(drawer.getByRole('link', { name: 'Bank & cash accounts' })).toBeVisible();
  await drawer.getByRole('link', { name: 'Bank & cash accounts' }).click();
  await expect(page).toHaveURL(/\/modules\/money-accounts$/);
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
  const doesNotOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(doesNotOverflow).toBe(true);
});

test('tablet drawer stays readable at 820px and closes on navigation', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await openLocalBusiness(page, 'LEXA Sidebar Tablet Test');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const sidebar = page.getByRole('dialog', { name: 'Main navigation' });
  await sidebar.getByRole('button', { name: 'Inventory', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Stock activity' }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole('dialog', { name: 'Main navigation' })).toHaveCount(0);
});
