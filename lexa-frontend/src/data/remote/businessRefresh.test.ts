import { describe, expect, it } from 'vitest';
import { belongsToBusinessProjection } from './businessRefresh';

describe('authoritative business data refresh', () => {
  it('refreshes the active branch dashboard and real financial projections', () => {
    for (const prefix of ['dashboard','authoritative-reports','general-ledger-journals','ap-invoices','w6-payroll','bank-reconciliations','ws-finance-expense-categories']) {
      expect(belongsToBusinessProjection([prefix,'business1','branch1'],'business1','branch1')).toBe(true);
    }
  });
  it('never refreshes another business or another branch', () => {
    expect(belongsToBusinessProjection(['dashboard','business2','branch1'],'business1','branch1')).toBe(false);
    expect(belongsToBusinessProjection(['dashboard','business1','branch2'],'business1','branch1')).toBe(false);
    expect(belongsToBusinessProjection(['arbitrary-unrelated-cache','business1','branch1'],'business1','branch1')).toBe(false);
  });
  it('refreshes business-wide accounting setup across branches without crossing businesses', () => {
    expect(belongsToBusinessProjection(['general-ledger-accounts','business1'],'business1','branch2')).toBe(true);
    expect(belongsToBusinessProjection(['general-ledger-accounts','business2'],'business1','branch2')).toBe(false);
  });
});
