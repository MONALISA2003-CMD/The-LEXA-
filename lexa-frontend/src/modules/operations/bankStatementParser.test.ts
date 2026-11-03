import { describe, expect, it } from 'vitest';
import { parseBankStatementCsv } from './bankStatementParser';

describe('bank statement import uses real currency minor units', () => {
  it('accepts a Ugandan shilling bank transaction without dividing by 100', () => {
    expect(parseBankStatementCsv('date,direction,amount,description,reference,externalId\n2026-11-02,credit,25000,Customer transfer,TRX1,bank-123', 'UGX')).toEqual([
      {transactionDate:'2026-11-02', direction:'credit', amountMinor:25000, description:'Customer transfer', reference:'TRX1', externalId:'bank-123'},
    ]);
  });
  it('preserves cents for two-decimal currencies', () => {
    expect(parseBankStatementCsv('date,direction,amount,description\n2026-11-02,debit,12.34,Account fee', 'USD')[0]?.amountMinor).toBe(1234);
  });
  it('omits optional references instead of sending undefined fields', () => {
    expect(parseBankStatementCsv('date,direction,amount,description,reference,externalId\n2026-11-02,CREDIT,100,Deposit,,', 'UGX')).toEqual([
      { transactionDate: '2026-11-02', direction: 'credit', amountMinor: 100, description: 'Deposit' },
    ]);
  });
  it('rejects invalid calendar dates and ambiguous signed amounts', () => {
    expect(() => parseBankStatementCsv('date,direction,amount,description\n2026-02-30,credit,100,Invalid date', 'UGX')).toThrow(/real date/i);
    expect(() => parseBankStatementCsv('date,direction,amount,description\n2026-11-02,debit,-100,Invalid amount', 'UGX')).toThrow(/positive amount/i);
  });
  it('rejects unsupported fractional shillings and missing direction', () => {
    expect(() => parseBankStatementCsv('date,direction,amount,description\n2026-11-02,debit,1.5,Invalid amount', 'UGX')).toThrow(/valid UGX decimal places/i);
    expect(() => parseBankStatementCsv('date,direction,amount,description\n2026-11-02,,100,Missing direction', 'UGX')).toThrow(/direction/i);
  });
});
