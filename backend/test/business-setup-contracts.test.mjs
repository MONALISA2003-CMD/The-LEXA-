import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { availablePaymentCodes, validateSetupStep, SetupValidationError } from '../src/business-setup/business-setup.rules.ts';

const root = new URL('../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');

test('business identity validates location and normalizes tenant-safe customer inputs', () => {
  const input = { step:1,businessName:'  Kampala Gadget Hub  ',branchName:' Shop One ',country:'ug',city:'Kampala',physicalAddress:'',onlineOnly:false,email:'hello@example.com' };
  const result = validateSetupStep(input);
  assert.equal(result.businessName,'Kampala Gadget Hub');
  assert.equal(result.branchName,'Shop One');
  assert.equal(result.country,'UG');
  assert.throws(()=>validateSetupStep({...input,city:'',physicalAddress:'',onlineOnly:false}),SetupValidationError);
  assert.throws(()=>validateSetupStep({...input,email:'not-an-email'}),SetupValidationError);
});

test('business models, offering types and channels are multi-select and validated against allow-lists', () => {
  const input={step:2,industry:'electronics',businessModels:['retail','wholesale','retail'],offeringTypes:['physical_goods','services'],offeringsDescription:'Phones, accessories and repairs',sellingChannels:['shop','social']};
  const result=validateSetupStep(input);
  assert.deepEqual(result.businessModels,['retail','wholesale']);
  assert.deepEqual(result.offeringTypes,['physical_goods','services']);
  assert.throws(()=>validateSetupStep({...input,businessModels:['merchant_api_gateway']}),SetupValidationError);
  assert.throws(()=>validateSetupStep({...input,offeringTypes:[]}),SetupValidationError);
  assert.throws(()=>validateSetupStep({...input,industry:'unknown'}),SetupValidationError);
});

test('payments are record-only and require explicit business owner confirmation',()=>{
  const input={step:3,currency:'UGX',timezone:'Africa/Kampala',methods:['cash','mtn_momo','airtel_money'],confirmation:true};
  assert.deepEqual(validateSetupStep(input).methods,input.methods);
  assert.throws(()=>validateSetupStep({...input,confirmation:false}),SetupValidationError);
  assert.throws(()=>validateSetupStep({...input,methods:[]}),SetupValidationError);
  assert.throws(()=>validateSetupStep({...input,methods:['stripe']}),SetupValidationError);
  assert.ok(availablePaymentCodes.every(x=>!/(gateway|connect|charge|initiate|process)/i.test(x.code)));
});

test('tenant setup schema has strict RLS and no cross-tenant or gateway capabilities',()=>{
  const sql=source('prisma/migrations/20261103190000_business_setup_profile/migration.sql');
  const prisma=source('prisma/schema.prisma');
  const controller=source('src/business-setup/business-setup.controller.ts');
  const policy=source('src/authorization/role-policy.ts');
  assert.match(sql,/business_profiles.*ENABLE ROW LEVEL SECURITY/s);
  assert.match(sql,/business_profiles FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/business_payment_methods FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/app\.tenant_id/);
  assert.match(prisma,/model BusinessProfile/);
  assert.match(prisma,/model BusinessPaymentMethod/);
  assert.match(controller,/Only a business owner may confirm/);
  assert.match(controller,/manualPaymentsConfirmedAt/);
  assert.match(controller,/tenantId: workspaceId/);
  assert.match(policy,/business-setup/);
  assert.doesNotMatch(controller,/(stripe\.charges|paymentIntents\.create|chargeCard|sendMoney|mobileMoneyTransfer)/i);
});

test('wizard resumes verified owners on their existing tenant and limits POS to configured methods',()=>{
  const wizard=source('../lexa-frontend/src/modules/business-setup/BusinessSetupPage.tsx');
  const onboarding=source('../lexa-frontend/src/modules/onboarding/OnboardingPage.tsx');
  const checkout=source('../lexa-frontend/src/modules/checkout/CheckoutPage.tsx');
  const core=source('src/core/core.controller.ts');
  assert.match(onboarding,/profile\.isOwner && !profile\.completedAt/);
  assert.match(onboarding,/destination = '\/business-setup'/);
  assert.match(wizard,/businessSetupApi\.save/);
  assert.match(wizard,/businessSetupApi\.complete/);
  assert.match(checkout,/paymentReceiptConfirmed/);
  assert.match(checkout,/paymentMethods\.filter|paymentMethods\.some/);
  assert.match(core,/assertRecordedMethodsEnabled/);
});
