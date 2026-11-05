import {expect,test} from '@playwright/test';

/** Exercises the public, local-only product wizard without posting stock. */
test('product wizard exposes labelled controls and clear stock separation',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/onboarding');
 await page.getByLabel(/Business name/).fill('LEXA Product Catalogue Test');
 await page.getByLabel(/First branch name/).fill('Main branch');
 await page.getByRole('button',{name:/Create and open my business/}).click();
 await page.goto('/products');
 await page.getByRole('button',{name:'Add product',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Add a product'});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('navigation',{name:'Product creation steps'})).toBeVisible();
 await expect(dialog.getByLabel(/Product name/)).toBeVisible();
 await expect(dialog.getByLabel(/SKU \/ internal code/)).toBeVisible();
 await expect(dialog.getByRole('button',{name:/3 · Variants & compatibility/})).toBeDisabled();
 await testInfo.attach('product-classification-mobile',{body:await dialog.screenshot({animations:'disabled'}),contentType:'image/png'});
 await dialog.getByLabel(/Product name/).fill('USB-C charging cable');
 await dialog.getByLabel(/SKU \/ internal code/).fill('CABLE-USB-C-01');
 await dialog.getByRole('button',{name:'Continue to prices'}).click();
 await expect(dialog.getByLabel(/Selling price/)).toBeVisible();
 await expect(dialog.getByLabel(/Unit of measure/)).toBeVisible();
 await expect(dialog.getByRole('button',{name:/Save product & continue/})).toBeVisible();
 await expect(dialog.getByText(/Receiving physical devices and assembling kits belong in Inventory/)).toHaveCount(0);
 await testInfo.attach('product-pricing-mobile',{body:await dialog.screenshot({animations:'disabled'}),contentType:'image/png'});
});
