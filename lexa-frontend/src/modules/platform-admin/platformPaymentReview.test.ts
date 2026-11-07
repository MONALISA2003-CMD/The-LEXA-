import {describe,expect,it} from 'vitest';
import {paymentReviewRequirements} from './platformPaymentReview';
const claim={providerReference:'44882509807',internalReference:'LXA-ABC123',verificationNote:'Checked official MTN merchant statement, 07:51.',independentlyConfirmed:true,amountUGX:50_000};
describe('independent platform payment verification',()=>{
  it('allows complete, independently verified payment details',()=>expect(paymentReviewRequirements(claim)).toEqual([]));
  it('rejects an empty provider reference even if the checkbox is marked',()=>expect(paymentReviewRequirements({...claim,providerReference:''})).not.toEqual([]));
  it('does not accept the LEXA request reference as the provider receipt',()=>expect(paymentReviewRequirements({...claim,providerReference:'LXA-ABC123'}).length).toBeGreaterThan(0));
  it('does not accept a one-word note as verification evidence',()=>expect(paymentReviewRequirements({...claim,verificationNote:'Ok'}).length).toBeGreaterThan(0));
  it('requires the receiving account to have been checked',()=>expect(paymentReviewRequirements({...claim,independentlyConfirmed:false}).length).toBeGreaterThan(0));
  it('does not approve an amount mismatch',()=>expect(paymentReviewRequirements({...claim,amountUGX:0}).length).toBeGreaterThan(0));
});
