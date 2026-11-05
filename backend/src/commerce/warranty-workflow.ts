/** Warranty claim decisions and repair posting rules.
 * Decisions are evidence-based; catalogue warranty months alone never establish
 * statutory coverage or turn a supplier responsibility into a merchant expense.
 */
export class WarrantyWorkflowError extends Error {
  constructor(message:string) { super(message); this.name='WarrantyWorkflowError'; }
}
export type WarrantyCaseStatus='opened'|'inspecting'|'repair_approved'|'repairing'|'rejected'|'closed'|'replaced';
export type WarrantyCoverage='seller_warranty'|'goodwill'|'manufacturer_warranty'|'out_of_warranty'|'not_covered';
const STEPS:Readonly<Record<WarrantyCaseStatus,readonly WarrantyCaseStatus[]>>={
 opened:['inspecting'], inspecting:['repair_approved','rejected'],repair_approved:['repairing'],
 repairing:['closed'],rejected:['closed'],closed:[],replaced:[],
};
const SELLER_COVERAGE:ReadonlySet<WarrantyCoverage>=new Set(['seller_warranty','goodwill']);
/** All warranty processing uses a reviewed state edge, never status override. */
export function authorizeWarrantyTransition(input:{
  previous:WarrantyCaseStatus;
  next:WarrantyCaseStatus;
  createdBy:string;
  actor:string;
  evidenceReference:string;
  notes:string;
  coverage?:WarrantyCoverage;
}):void {
 if (!STEPS[input.previous]?.includes(input.next)) throw new WarrantyWorkflowError('This warranty state change is not permitted.');
 if (!input.actor || !input.evidenceReference.trim() || input.evidenceReference.length>250 || input.notes.trim().length<8 || input.notes.length>1000)
  throw new WarrantyWorkflowError('Warranty decisions require a documented evidence reference and inspection or resolution notes.');
 if (input.next==='repair_approved'||input.next==='rejected') {
  if (input.actor===input.createdBy)throw new WarrantyWorkflowError('A separate authorized reviewer must decide warranty coverage.');
  if (!input.coverage)throw new WarrantyWorkflowError('Coverage responsibility must be documented before deciding a claim.');
  if (input.next==='repair_approved'&&!SELLER_COVERAGE.has(input.coverage))
   throw new WarrantyWorkflowError('Only an approved seller warranty or documented goodwill case may consume store parts as warranty expense.');
  if (input.next==='rejected'&&SELLER_COVERAGE.has(input.coverage))
   throw new WarrantyWorkflowError('A covered claim cannot be rejected as an uncovered warranty claim.');
 } else if (input.coverage!==undefined) {
  throw new WarrantyWorkflowError('Coverage responsibility can only be set by the claim reviewer.');
 }
}
/** Allow repairs to consume parts only after independent coverage approval. */
export function assertWarrantyPartEligible(status:WarrantyCaseStatus,decision:WarrantyCoverage|undefined):void {
 if (status!=='repairing' || !decision || !SELLER_COVERAGE.has(decision)) {
  throw new WarrantyWorkflowError('A reviewed seller-warranty or goodwill repair is required before issuing a stocked part.');
 }
}
