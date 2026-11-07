import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { subscriptionConfirmationContent } from '../src/platform-administration/subscription-confirmation-content.ts';

const source = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const controller = source('../src/platform-administration/platform-administration.controller.ts');
const email = source('../src/platform-administration/subscription-access-email.ts');
const review = source('../../lexa-frontend/src/modules/platform-admin/PlatformAdministrationPage.tsx');
const demo = source('../../lexa-frontend/src/modules/demo/browserDemoSeed.ts');

test('subscription confirmation email invites a verified account owner to sign in, not bypass payment verification', () => {
  const content = subscriptionConfirmationContent({businessName:'Kampala Books',paidThrough:new Date('2026-12-07T08:00:00Z')});
  assert.match(content.subject,/payment confirmed/i);
  assert.match(content.text,/Kampala Books/);
  assert.match(content.text,/UGX 50,000/);
  assert.match(content.actionUrl,/^https:\/\/lexaaamaal\.com\/sign-in\?subscription=active$/);
  assert.doesNotMatch(content.actionUrl,/token|password|session|admin/);
});

test('payment approval still requires admin privilege, actual received funds and a provider reference', () => {
  assert.match(controller,/await this\.admin\(request,\['super_admin','billing_manager'\]\)/);
  assert.match(controller,/b\.confirmation!=='I_VERIFIED_RECEIPT'/);
  assert.match(controller,/!isPlausibleProviderReference\(verifiedReference\)/);
  assert.match(controller,/claim\.amount_ugx!==SUBSCRIPTION_PRICE_UGX/);
  assert.match(controller,/if \('approved' in decision && decision\.approved === true\)/);
  assert.match(controller,/sendApprovalNotice\(emailRecipient \?\? null,emailBusiness/);
  assert.doesNotMatch(controller,/sendApprovalNotice\(emailRecipient,emailBusiness,publicDecision\.expiresAt,claimId\)/);
  assert.match(email,/idempotencyKey: `lexa-subscription-approved-\$\{input\.claimId\}`/);
  assert.match(controller,/emailNotification:/);
  assert.match(controller,/console\.warn/);
  assert.match(review,/reviewRequirements\.length>0/);
  assert.match(review,/disabled=\{working\|\|reviewRequirements\.length>0\}/);
});

test('browser demo generator is typed for strict optional fields and uses supported Dexie transaction signature', () => {
  assert.match(demo,/categoryId: categoryId\.get\(cat\)!/);
  assert.match(demo,/selected=\[products\[\(i\*5\)%products\.length\]!/);
  assert.match(demo,/customerName:customerNames\[i%customerNames\.length\]!/);
  assert.match(demo,/db\.transaction\('rw',\[/);
  assert.match(demo,/db\.transaction\('rw',db\.tables,async/);
});
