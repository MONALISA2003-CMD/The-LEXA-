import { expect, test } from '@playwright/test';

test('browser demo entry, employee view, owner view, Assistant and reset stay isolated', async ({ page }) => {
  await page.goto('/demo/');
  await expect(page.getByRole('heading', { name: /Make a sale\. Check the stock/ })).toBeVisible();
  await page.getByRole('button', { name: /Open LEXA Demo Traders/ }).click();
  await expect(page.getByRole('button', { name: 'Start again' })).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/demo\/$/);

  await page.getByRole('link', { name: 'My business', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LEXA Demo Traders' })).toBeVisible();
  // The sample visitor is an owner: employee-only navigation is correctly hidden.
  // Verify the route's safe fallback directly, rather than altering role permissions.
  await page.goto('/demo/my-employment');
  await expect(page.getByRole('heading', { name: 'My employment profile' })).toBeVisible();

  await page.getByRole('button', { name: 'Reports & insights' }).click();
  await page.getByRole('link', { name: 'LEXA Assistant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Explore insights from this sample business' })).toBeVisible();
  await page.getByRole('button', { name: 'Which stock needs attention?' }).click();
  await expect(page.getByRole('heading', { name: 'Stock requiring attention' })).toBeVisible();

  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByRole('heading', { name: /Make a sale\. Check the stock/ })).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/demo\/$/);
  expect(page.url()).not.toContain('/demo/demo');
});
