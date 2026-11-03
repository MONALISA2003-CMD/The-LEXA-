/**
 * Accounting control for an APPROVED payroll payment.
 * Gross pay is recognized as an expense, actual net settlement reduces bank,
 * and deductions remain a payable until separately remitted. Posting is
 * atomic with changing a payroll run to paid and never occurs at calculation.
 */
export function payrollPaymentJournalLines(gross: number, deductions: number, net: number) {
  for (const [name, value] of [['Gross pay', gross], ['Deductions', deductions], ['Net pay', net]] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 9_000_000_000_000) {
      throw new Error(`${name} must be a non-negative, safe integer in minor currency units.`);
    }
  }
  if (gross === 0 || net === 0 || gross !== deductions + net) {
    throw new Error('Payroll amounts are invalid: gross pay must equal positive net pay plus deductions.');
  }
  return [
    { accountKey: 'operating_expenses', debitMinor: gross, description: 'Gross approved payroll expense' },
    { accountKey: 'bank', creditMinor: net, description: 'Net payroll settlement' },
    ...(deductions > 0 ? [{ accountKey: 'payroll_withholdings', creditMinor: deductions, description: 'Payroll deductions awaiting remittance' }] : []),
  ];
}
