import type { PreviewRecord } from './moduleCatalog';
import { documentLineSubtotalFromValues, documentLineQuantity } from './documentLines';
import { assemblyUnitCost, journalTotals, readAssemblyComponents, readJournalLines, validateJournalLines } from './structuredEntries';

export type FormValues = Record<string, string>;

export function safeNumber(value: string | undefined): number {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
export function effectiveTaxRate(values: FormValues): number {
  if (['Zero-rated', 'Exempt', 'Outside scope'].includes(values.taxTreatment ?? '')) return 0;
  return Math.max(0, safeNumber(values.taxRate));
}

function documentLineQuantityFromValues(values: FormValues): number | null {
  if (!values.lineItemsJson) return null;
  try {
    const parsed: unknown = JSON.parse(values.lineItemsJson);
    if (!Array.isArray(parsed)) return null;
    return documentLineQuantity(parsed as Array<{ id: string; description: string; quantity: string; unitAmount: string }>);
  } catch { return null; }
}

export function calculateRecord(moduleId: string, values: FormValues, existingId?: string): PreviewRecord {
  const result: PreviewRecord = {
    id: existingId ?? ('PRE-' + moduleId.slice(0, 3).toUpperCase() + '-' + Date.now().toString().slice(-7)),
    updatedAt: new Date().toISOString(),
    status: values.status || 'Draft',
    ...values,
  };
  const n = (key: string) => safeNumber(values[key]);
  if (moduleId === 'leads') result.weightedValue = String(Math.round(Math.max(0, n('estimatedValue')) * Math.min(100, Math.max(0, n('probability'))) / 100 * 100) / 100);
  if (moduleId === 'campaigns') {
    result.costPerLead = n('leadsGenerated') > 0 ? String(Math.round((n('actualSpend') / n('leadsGenerated')) * 100) / 100) : '—';
    result.opportunityConversionPercent = n('leadsGenerated') > 0 ? String(Math.round((n('opportunitiesCreated') / n('leadsGenerated')) * 10000) / 100) : '0';
  }
  if (moduleId === 'sales-teams') {
    result.achievementPercent = n('salesTarget') > 0 ? String(Math.round((n('salesAchieved') / n('salesTarget')) * 10000) / 100) : '—';
    result.indicativeCommission = String(Math.round(Math.max(0, n('salesAchieved')) * Math.max(0, n('commissionRate')) / 100 * 100) / 100);
  }
  if (moduleId === 'item-bundles') {
    const componentCost = assemblyUnitCost(readAssemblyComponents(moduleId, values));
    result.unitCost = String(componentCost);
    result.componentCount = String(readAssemblyComponents(moduleId, values).length);
    const summary = readAssemblyComponents(moduleId, values).map((line) => line.quantity === '1' ? line.description.trim() : `${line.description.trim()} × ${line.quantity}`).filter(Boolean).join('; ');
    result.componentsSummary = summary;
    const margin = Math.round((n('sellingPrice') - componentCost) * 100) / 100;
    result.grossMargin = String(margin);
    result.marginPercent = n('sellingPrice') > 0 ? String(Math.round((margin / n('sellingPrice')) * 10000) / 100) : '0';
  }
  if (moduleId === 'picklists') {
    result.unitsOutstanding = String(Math.max(0, n('unitsToPick') - n('unitsPicked')));
    result.pickPercent = n('unitsToPick') > 0 ? String(Math.round((n('unitsPicked') / n('unitsToPick')) * 10000) / 100) : '0';
  }
  if (moduleId === 'budgets') {
    result.variance = String(Math.round((n('budgetAmount') - n('actualAmount')) * 100) / 100);
    result.availableBudget = String(Math.round((n('budgetAmount') - n('actualAmount') - n('committedAmount')) * 100) / 100);
    result.forecastVariance = String(Math.round((n('budgetAmount') - n('forecastAmount')) * 100) / 100);
    result.utilisationPercent = n('budgetAmount') > 0 ? String(Math.round((n('actualAmount') / n('budgetAmount')) * 10000) / 100) : '—';
  }
  if (moduleId === 'cash-sessions') {
    const expected = Math.round((n('openingFloat') + n('cashSales') - n('cashRefunds') - n('cashDrops')) * 100) / 100;
    result.expectedCash = String(expected);
    result.variance = String(Math.round((n('countedCash') - expected) * 100) / 100);
  }
  if (moduleId === 'boms') {
    const components = readAssemblyComponents(moduleId, values);
    const unitMaterialCost = assemblyUnitCost(components);
    result.unitMaterialCost = String(unitMaterialCost);
    result.componentCount = String(components.length);
    result.componentSummary = components.map((line) => line.quantity === '1' ? line.description.trim() : `${line.description.trim()} × ${line.quantity}`).filter(Boolean).join('; ');
    result.estimatedMaterialCost = String(Math.round(Math.max(0, n('outputQuantity')) * unitMaterialCost * 100) / 100);
  }
  if (moduleId === 'accounting') {
    const lines = readJournalLines(values);
    const totals = journalTotals(lines);
    const debitLine = lines.find((line) => safeNumber(line.debit) > 0);
    const creditLine = lines.find((line) => safeNumber(line.credit) > 0);
    result.journalLinesJson = JSON.stringify(lines);
    result.totalDebit = String(totals.debit);
    result.totalCredit = String(totals.credit);
    result.balanceDifference = String(totals.difference);
    result.amount = String(totals.debit);
    result.debitAccount = debitLine?.account ?? '';
    result.creditAccount = creditLine?.account ?? '';
  }
  if (moduleId === 'job-cards') result.hoursVariance = String(Math.round((n('actualHours') - n('plannedHours')) * 100) / 100);
  if (moduleId === 'leave' && values.startDate && values.endDate) {
    const start = Date.parse(values.startDate + 'T00:00:00Z');
    const end = Date.parse(values.endDate + 'T00:00:00Z');
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) result.daysRequested = String(Math.floor((end - start) / 86400000) + 1);
  }
  if (moduleId === 'replenishment') {
    const demandDuringLead = Math.max(0, n('averageDailyDemand')) * Math.max(0, n('leadTimeDays'));
    result.recommendedQuantity = String(Math.max(0, Math.ceil(demandDuringLead + Math.max(0, n('safetyStock')) - Math.max(0, n('onHand')))));
    result.daysCover = n('averageDailyDemand') > 0 ? String(Math.round((Math.max(0, n('onHand')) / n('averageDailyDemand')) * 100) / 100) : '—';
  }
  if (moduleId === 'timesheets') {
    result.billableAmount = String(Math.round(Math.max(0, n('billableHours')) * Math.max(0, n('hourlyRate')) * 100) / 100);
    result.nonBillableHours = String(Math.round(Math.max(0, n('hours') - n('billableHours')) * 100) / 100);
  }
  if (moduleId === 'customers') result.outstandingBalance = String(n('openingBalance'));
  if (moduleId === 'suppliers') result.outstandingPayable = String(n('openingPayable'));
  if (moduleId === 'opportunities') result.weightedValue = String(Math.round(Math.max(0, n('amount')) * Math.min(100, Math.max(0, n('probability'))) / 100 * 100) / 100);
  if (moduleId === 'projects') result.budgetVariance = String(Math.round((n('budget') - n('actualCost')) * 100) / 100);
  if (moduleId === 'tasks') result.hoursVariance = String(Math.round((n('actualHours') - n('estimatedHours')) * 100) / 100);
  if (moduleId === 'work-orders') {
    const planned = Math.max(0, n('plannedQuantity'));
    result.plannedCost = String(Math.round(planned * Math.max(0, n('unitCost')) * 100) / 100);
    result.completionPercent = String(planned > 0 ? Math.round(Math.min(100, Math.max(0, n('completedQuantity')) / planned * 100) * 100) / 100 : 0);
  }
  if (moduleId === 'quality') {
    const inspected = Math.max(0, n('inspectedQuantity'));
    result.rejectionRate = String(inspected > 0 ? Math.round(Math.max(0, n('rejectedQuantity')) / inspected * 10000) / 100 : 0);
  }
  if (moduleId === 'sales-returns' || moduleId === 'purchase-returns') {
    const unit = Math.max(0, n(moduleId === 'sales-returns' ? 'unitPrice' : 'unitCost'));
    const subtotal = documentLineSubtotalFromValues(moduleId, values) ?? (Math.max(0, n('quantity')) * unit);
    const tax = Math.max(0, subtotal) * effectiveTaxRate(values) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    result.subtotal = String(Math.round(subtotal * 100) / 100);
    result.taxAmount = String(Math.round(tax * 100) / 100);
    result.total = String(total);
    if (moduleId === 'sales-returns') result.creditAmount = String(total);
    else result.debitAmount = String(total);
  }
  if (['quotations', 'sales-orders', 'sales-invoices', 'purchases', 'purchase-invoices', 'supplier-quotes', 'recurring-invoices'].includes(moduleId)) {
    const isPurchase = moduleId === 'purchases' || moduleId === 'purchase-invoices' || moduleId === 'supplier-quotes';
    const supportsDiscount = moduleId === 'quotations' || moduleId === 'sales-orders';
    const quantity = Math.max(0, documentLineQuantityFromValues(values) ?? n('quantity'));
    const unitPrice = Math.max(0, n(isPurchase ? 'unitCost' : 'unitPrice'));
    const subtotal = documentLineSubtotalFromValues(moduleId, values) ?? (quantity * unitPrice);
    const discountAmount = supportsDiscount ? subtotal * Math.max(0, n('discountPercent')) / 100 : 0;
    const taxAmount = Math.max(0, subtotal - discountAmount) * effectiveTaxRate(values) / 100;
    const total = Math.max(0, subtotal - discountAmount + taxAmount);
    result.subtotal = String(Math.round(subtotal * 100) / 100);
    result.discountAmount = String(Math.round(discountAmount * 100) / 100);
    result.taxAmount = String(Math.round(taxAmount * 100) / 100);
    result.total = String(Math.round(total * 100) / 100);
    if (moduleId === 'purchases' || moduleId === 'purchase-invoices') result.amountDue = String(Math.max(0, Math.round((total - n('amountPaid')) * 100) / 100));
    if (moduleId === 'sales-invoices') result.amountDue = String(Math.max(0, Math.round((total - n('amountReceived')) * 100) / 100));
  }
  if (moduleId === 'expenses') {
    const taxAmount = Math.max(0, n('amount')) * effectiveTaxRate(values) / 100;
    result.taxAmount = String(Math.round(taxAmount * 100) / 100);
    result.total = String(Math.round((n('amount') + taxAmount) * 100) / 100);
  }
  if (moduleId === 'stock-counts') result.variance = String(Math.round((n('countedQuantity') - n('expectedQuantity')) * 100) / 100);
  if (moduleId === 'tax-documents') result.taxAmount = String(Math.round((n('taxableAmount') * effectiveTaxRate(values) / 100) * 100) / 100);
  if (moduleId === 'bank-reconciliation') result.difference = String(Math.round((n('statementBalance') - n('bookBalance')) * 100) / 100);
  if (moduleId === 'payroll') result.netPay = String(Math.round(Math.max(0, n('grossPay') - n('deductions')) * 100) / 100);
  if (moduleId === 'attendance') {
    const toMinutes = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN; };
    const start = toMinutes(values.clockIn ?? ''); const end = toMinutes(values.clockOut ?? '');
    const minutes = Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.max(0, end - start - Math.max(0, n('breakMinutes'))) : 0;
    result.workedHours = String(Math.round((minutes / 60) * 100) / 100);
  }
  if (moduleId === 'assets') {
    const cost = Math.max(0, n('cost'));
    const residual = Math.max(0, n('residualValue'));
    const life = Math.max(0, n('usefulLifeYears'));
    const accumulated = Math.max(0, n('accumulatedDepreciation'));
    result.annualDepreciation = life > 0 ? String(Math.round((Math.max(0, cost - residual) / life) * 100) / 100) : '0';
    result.carryingValue = String(Math.max(residual, cost - accumulated));
  }
  return result;
}
export function validateRecord(moduleId: string, values: FormValues, record: PreviewRecord): string | null {
  const n = (key: string) => safeNumber(values[key]);
  if (['quotations', 'sales-orders', 'sales-invoices', 'recurring-invoices'].includes(moduleId)) {
    if (n('quantity') <= 0 || n('unitPrice') < 0) return 'Enter a quantity above zero and a valid unit price.';
    if (n('taxRate') < 0 || n('taxRate') > 100) return 'Tax rate must be between 0 and 100%.';
    if (moduleId === 'quotations' && values.validUntil && values.issueDate && values.validUntil < values.issueDate) return 'The validity date cannot be earlier than the issue date.';
    if (moduleId === 'recurring-invoices' && values.nextRunDate && values.startDate && values.nextRunDate < values.startDate) return 'The next invoice date cannot be earlier than the schedule start date.';
    if (moduleId === 'recurring-invoices' && values.endDate && values.startDate && values.endDate < values.startDate) return 'The schedule end date cannot be earlier than its start date.';
    if (moduleId === 'recurring-invoices' && values.endDate && values.nextRunDate && values.nextRunDate > values.endDate && ['Active', 'Review'].includes(values.status ?? '')) return 'The next run falls after the schedule end date; pause or end the schedule, or correct the dates.';
    if (moduleId === 'sales-orders' && values.expectedDate && values.orderDate && values.expectedDate < values.orderDate) return 'Expected delivery cannot be earlier than the order date.';
    if (moduleId === 'sales-invoices' && values.dueDate && values.issueDate && values.dueDate < values.issueDate) return 'Invoice due date cannot be earlier than the issue date.';
    if (['quotations', 'sales-orders'].includes(moduleId) && n('discountPercent') > 100) return 'Discount cannot exceed 100%.';
    if (moduleId === 'sales-invoices' && n('amountReceived') > safeNumber(record.total)) return 'Amount received cannot be greater than the calculated invoice total.';
  }
  if (['sales-returns', 'purchase-returns'].includes(moduleId)) {
    if (n('quantity') <= 0) return 'Return quantity must be above zero.';
    const unitKey = moduleId === 'sales-returns' ? 'unitPrice' : 'unitCost';
    if (n(unitKey) < 0) return 'The original unit amount cannot be negative.';
    if (n('taxRate') < 0 || n('taxRate') > 100) return 'Tax rate must be between 0 and 100%.';
  }
  if (moduleId === 'leads') {
    if (n('estimatedValue') < 0) return 'Estimated lead value cannot be negative.';
    if (n('probability') < 0 || n('probability') > 100) return 'Lead probability must be between 0 and 100%.'
    if (values.createdDate && values.expectedCloseDate && values.expectedCloseDate < values.createdDate) return 'Expected close date cannot be earlier than the lead creation date.';
  }
  if (moduleId === 'cash-sessions') {
    if ([n('openingFloat'), n('cashSales'), n('cashRefunds'), n('cashDrops'), n('countedCash')].some((value) => value < 0)) return 'Cash session figures cannot be negative.';
    if (n('cashRefunds') + n('cashDrops') > n('openingFloat') + n('cashSales')) return 'Refunds and drops cannot exceed the opening float plus recorded cash sales.';
  }
  if (moduleId === 'boms') {
    if (n('outputQuantity') <= 0) return 'BOM output quantity must be greater than zero.';
    if (n('unitMaterialCost') < 0) return 'Unit material cost cannot be negative.';
    if (values.effectiveFrom && values.effectiveTo && values.effectiveTo < values.effectiveFrom) return 'BOM end date cannot be earlier than its effective start date.';
  }
  if (moduleId === 'job-cards') {
    if (n('plannedHours') <= 0) return 'Planned job-card hours must be greater than zero.';
    if (n('actualHours') < 0) return 'Actual job-card hours cannot be negative.';
    if (values.startDate && values.endDate && values.endDate < values.startDate) return 'Job-card completion date cannot be earlier than its start date.';
  }
  if (moduleId === 'leave') {
    if (values.startDate && values.endDate && values.endDate < values.startDate) return 'Leave end date cannot be earlier than the start date.';
    if (n('daysRequested') < 1) return 'Requested leave must include at least one calendar day.';
  }
  if (moduleId === 'replenishment') {
    if ([n('onHand'), n('reorderPoint'), n('leadTimeDays'), n('safetyStock')].some((value) => value < 0 || !Number.isInteger(value))) return 'On-hand, reorder point, lead time and safety stock must be whole numbers of zero or more.';
    if (n('averageDailyDemand') < 0) return 'Average daily demand cannot be negative.';
  }
  if (moduleId === 'packages') {
    if (n('packageCount') <= 0 || !Number.isInteger(n('packageCount'))) return 'Package count must be a positive whole number.';
    if (n('weightKg') < 0) return 'Package weight cannot be negative.';
    if (values.status === 'Shipped' && !String(values.trackingReference ?? '').trim() && String(values.courier ?? '').trim().toLowerCase() !== 'own fleet') return 'Enter a tracking reference before marking a courier shipment as shipped.';
  }
  if (moduleId === 'timesheets') {
    if (n('hours') <= 0) return 'Time entry must include more than zero hours.';
    if (n('billableHours') < 0 || n('billableHours') > n('hours')) return 'Billable hours must be between zero and total hours.';
    if (n('hourlyRate') < 0) return 'Reference hourly rate cannot be negative.';
  }
  if (moduleId === 'opportunities') {
    if (n('amount') < 0) return 'Estimated deal value cannot be negative.';
    if (n('probability') < 0 || n('probability') > 100) return 'Win probability must be between 0 and 100%.';
    if (values.createdDate && values.expectedCloseDate && values.expectedCloseDate < values.createdDate) return 'Expected close date cannot be earlier than the creation date.';
  }
  if (moduleId === 'projects') {
    if (n('budget') < 0 || n('actualCost') < 0) return 'Project budget and actual cost cannot be negative.';
    if (n('progressPercent') < 0 || n('progressPercent') > 100) return 'Project progress must be between 0 and 100%.';
    if (values.startDate && values.targetEndDate && values.targetEndDate < values.startDate) return 'Target end date cannot be earlier than the start date.';
  }
  if (moduleId === 'tasks') {
    if (n('estimatedHours') < 0 || n('actualHours') < 0) return 'Estimated and actual hours cannot be negative.';
    if (values.startDate && values.dueDate && values.dueDate < values.startDate) return 'Task due date cannot be earlier than the start date.';
  }
  if (moduleId === 'support' && values.createdDate && values.responseDue && values.responseDue < values.createdDate) return 'Response due date cannot be earlier than the case creation date.';
  if (moduleId === 'work-orders') {
    if (n('plannedQuantity') <= 0) return 'Planned output must be greater than zero.';
    if (n('completedQuantity') < 0 || n('completedQuantity') > n('plannedQuantity')) return 'Completed output must be between zero and the planned quantity.';
    if (values.startDate && values.targetDate && values.targetDate < values.startDate) return 'Target completion cannot be earlier than the start date.';
    if (n('unitCost') < 0) return 'Estimated unit cost cannot be negative.';
  }
  if (moduleId === 'quality') {
    if (n('inspectedQuantity') <= 0) return 'Inspected quantity must be greater than zero.';
    if (n('acceptedQuantity') < 0 || n('rejectedQuantity') < 0) return 'Accepted and rejected quantities cannot be negative.';
    if (n('acceptedQuantity') + n('rejectedQuantity') !== n('inspectedQuantity')) return 'Accepted plus rejected quantities must equal the inspected quantity.';
  }
  if (moduleId === 'batches') {
    const quantityKeys = ['receivedQuantity', 'availableQuantity'];
    if (quantityKeys.some((key) => n(key) < 0 || !Number.isInteger(n(key)))) return 'Batch quantities must be whole numbers of zero or more.';
    if (n('availableQuantity') > n('receivedQuantity')) return 'Available quantity cannot exceed the received quantity.';
    if (values.receivedDate && values.expiryDate && values.expiryDate < values.receivedDate) return 'Expiry date cannot be earlier than the received date.';
  }
  if (['purchases', 'purchase-invoices', 'supplier-quotes'].includes(moduleId)) {
    if (n('quantity') <= 0) return 'Quantity ordered / billed must be above zero.';
    if (n('taxRate') < 0 || n('taxRate') > 100) return 'Tax rate must be between 0 and 100%.';
    if (n('amountPaid') > safeNumber(record.total)) return 'The amount paid cannot be greater than the calculated purchase total.';
    if (moduleId === 'purchase-invoices' && values.dueDate && values.billDate && values.dueDate < values.billDate) return 'Supplier invoice due date cannot be earlier than the bill date.';
    if (moduleId === 'supplier-quotes' && values.validUntil && values.quoteDate && values.validUntil < values.quoteDate) return 'Quote validity cannot end before the quote date.';
  }
  if (moduleId === 'expenses' && n('amount') <= 0) return 'Expense amount must be greater than zero.';
  if (moduleId === 'payroll' && n('employeeCount') <= 0) return 'Include at least one employee in a payroll run.';
  if (moduleId === 'tax-codes') {
    if (n('ratePercent') < 0 || n('ratePercent') > 100) return 'Tax rate must be between 0 and 100%.';
    if (values.effectiveTo && values.effectiveFrom && values.effectiveTo < values.effectiveFrom) return 'Tax-code end date cannot be earlier than its effective start date.';
    if (values.treatment === 'Zero-rated' || values.treatment === 'Exempt' || values.treatment === 'Outside scope') { if (n('ratePercent') !== 0) return 'Zero-rated, exempt and outside-scope tax codes must have a zero rate.'; }
  }
  if (moduleId === 'bank-reconciliation') {
    if ([n('statementLineCount'), n('matchedCount'), n('unmatchedCount')].some((count) => count < 0 || !Number.isInteger(count))) return 'Statement and match counts must be whole numbers of zero or more.';
    if (n('matchedCount') + n('unmatchedCount') > n('statementLineCount')) return 'Matched and unmatched lines cannot exceed the statement line count.';
  }
  if (moduleId === 'price-lists') {
    if (n('sellingPrice') < 0 || n('basePrice') < 0) return 'Prices cannot be negative.';
    if (n('discountPercent') < 0 || n('discountPercent') > 100) return 'Discount must be between 0 and 100%.';
    if (values.validUntil && values.validFrom && values.validUntil < values.validFrom) return 'The end date cannot be earlier than the start date.';
  }
  if (moduleId === 'deliveries' && values.expectedDate && values.dispatchDate && values.expectedDate < values.dispatchDate) return 'Expected arrival cannot be earlier than the dispatch date.';
  if (moduleId === 'payroll') {
    if (n('employeeCount') < 0 || !Number.isInteger(n('employeeCount'))) return 'Employee count must be a whole number of zero or more.';
    if (n('grossPay') < 0 || n('deductions') < 0) return 'Gross pay and deductions cannot be negative.';
    if (n('deductions') > n('grossPay')) return 'Deductions cannot exceed gross pay.';
    if (values.periodStart && values.periodEnd && values.periodEnd < values.periodStart) return 'Payroll period end cannot be before the start date.';
  }
  if (moduleId === 'attendance') {
    const validTime = (value: string) => /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
    if (!validTime(values.clockIn ?? '') || !validTime(values.clockOut ?? '')) return 'Enter clock-in and clock-out in 24-hour HH:MM format.';
    const clockMinutes = (value: string) => { const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim()); return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN; };
    const clockIn = clockMinutes(values.clockIn ?? ''); const clockOut = clockMinutes(values.clockOut ?? '');
    if (clockOut <= clockIn) return 'Clock-out must be later than clock-in. Overnight shifts need a future overnight-shift rule.';
    if (n('breakMinutes') < 0 || n('breakMinutes') >= clockOut - clockIn) return 'Break duration must be shorter than the recorded shift.';
  }
  if (moduleId === 'tax-documents' && (n('taxableAmount') < 0 || n('taxRate') < 0 || n('taxRate') > 100)) return 'Enter a non-negative taxable amount and a tax rate between 0 and 100%.';
  if (moduleId === 'stock-counts' && (n('expectedQuantity') < 0 || n('countedQuantity') < 0)) return 'System and counted quantities cannot be negative.';
  if (moduleId === 'payments' && n('amount') <= 0) return 'Payment amount must be greater than zero.';
  if (moduleId === 'accounting') {
    const journalError = validateJournalLines(values);
    if (journalError) return journalError;
  }
  if (moduleId === 'assets') {
    if (n('usefulLifeYears') <= 0) return 'Useful life must be at least one year.';
    if (n('residualValue') > n('cost')) return 'Residual value cannot exceed acquisition cost.';
    if (n('accumulatedDepreciation') > n('cost')) return 'Accumulated depreciation cannot exceed acquisition cost.';
  }
  if (moduleId === 'receiving') {
    if (n('acceptedQuantity') < 0 || n('rejectedQuantity') < 0 || n('acceptedQuantity') + n('rejectedQuantity') <= 0) return 'Enter a positive accepted or rejected quantity.';
    if (n('acceptedQuantity') + n('rejectedQuantity') > n('orderedQuantity')) return 'Accepted and rejected quantities cannot exceed the ordered quantity on this receipt.';
  }
  if (moduleId === 'stock-transfers') {
    if (n('quantity') <= 0) return 'Transfer quantity must be greater than zero.';
    const fromBranch = (values.fromBranch ?? '').trim().toLowerCase();
    const toBranch = (values.toBranch ?? '').trim().toLowerCase();
    if (!fromBranch || !toBranch) return 'Enter both the source and destination branches.';
    if (fromBranch === toBranch) return 'Source and destination branches must be different.';
  }
  if (moduleId === 'campaigns') {
    if ([n('budget'), n('actualSpend'), n('leadsGenerated'), n('opportunitiesCreated')].some((value) => value < 0)) return 'Campaign spend, budget and lead counts cannot be negative.';
    if (![n('leadsGenerated'), n('opportunitiesCreated')].every(Number.isInteger)) return 'Lead and opportunity counts must be whole numbers.';
    if (n('opportunitiesCreated') > n('leadsGenerated')) return 'Opportunities created cannot exceed leads generated in this campaign.';
    if (values.startDate && values.endDate && values.endDate < values.startDate) return 'Campaign end date cannot be earlier than its start date.';
  }
  if (moduleId === 'sales-teams') {
    if (n('salesTarget') < 0 || n('salesAchieved') < 0) return 'Sales targets and achieved values cannot be negative.';
    if (n('commissionRate') < 0 || n('commissionRate') > 100) return 'Indicative commission must be between 0 and 100%.';
  }
  if (moduleId === 'item-bundles') {
    if (n('componentCount') <= 0 || !Number.isInteger(n('componentCount'))) return 'A bundle must contain at least one whole component line.';
    if (n('unitCost') < 0 || n('sellingPrice') < 0) return 'Bundle cost and selling price cannot be negative.';
  }
  if (moduleId === 'picklists') {
    if ([n('lineCount'), n('unitsToPick'), n('unitsPicked')].some((value) => value < 0 || !Number.isInteger(value))) return 'Picklist line and unit counts must be whole numbers of zero or more.';
    if (n('lineCount') <= 0 || n('unitsToPick') <= 0) return 'A picklist must include at least one line and one unit.';
    if (n('unitsPicked') > n('unitsToPick')) return 'Picked units cannot exceed units requested on the picklist.';
    if (values.status === 'Picked' && n('unitsPicked') !== n('unitsToPick')) return 'A completed picklist must account for all requested units; use Short pick or Partially picked instead.';
  }
  if (moduleId === 'budgets') {
    if ([n('budgetAmount'), n('actualAmount'), n('committedAmount'), n('forecastAmount')].some((value) => value < 0)) return 'Budget, actual, committed and forecast values cannot be negative.';
    if (values.periodStart && values.periodEnd && values.periodEnd < values.periodStart) return 'Budget period end cannot be earlier than its start.';
  }
  if (moduleId === 'integrations') {
    if (n('recordsProcessed') < 0 || !Number.isInteger(n('recordsProcessed'))) return 'Records processed must be a whole number of zero or more.';
    if (values.status === 'Test passed' && (!values.lastCheckedAt || !String(values.lastResult ?? '').trim())) return 'A passing test requires a checked date and a recorded result.';
    if (String(values.lastError ?? '').toLocaleLowerCase().includes('password=') || String(values.lastError ?? '').toLocaleLowerCase().includes('token=')) return 'Do not store secrets or tokens in integration notes. Use the secure backend / deployment environment instead.';
  }
  return null;
}

export function nextStatus(moduleId: string, current: string): string | undefined {
  const transitions: Record<string, Record<string, string>> = {
    customers: { Active: 'On hold', 'On hold': 'Inactive' },
    leads: { New: 'Contacted', Contacted: 'Qualified', Qualified: 'Converted', Converted: 'Won', Lost: 'Reopened' },
    contacts: { Active: 'Inactive', Inactive: 'Active' },
    campaigns: { Draft: 'Planned', Planned: 'Active', Active: 'Completed' },
    'sales-teams': { Active: 'On leave', 'On leave': 'Inactive', Inactive: 'Active' },
    'item-bundles': { Draft: 'Review', Review: 'Active', Active: 'Inactive', Inactive: 'Active' },
    picklists: { Draft: 'Assigned', Assigned: 'Picking', Picking: 'Picked', 'Partially picked': 'Picking', 'Short pick': 'Picking' },
    'cost-centers': { Active: 'Inactive', Inactive: 'Active' },
    budgets: { Draft: 'Review', Review: 'Approved', Approved: 'Closed' },
    integrations: { 'Not connected': 'Configuration needed', 'Configuration needed': 'Ready for test', 'Ready for test': 'Test passed', Error: 'Ready for test', Paused: 'Configuration needed' },
    'recurring-invoices': { Draft: 'Review', Review: 'Active', Active: 'Paused', Paused: 'Active' },
    'cash-sessions': { Open: 'Count entered', 'Count entered': 'Reviewed', 'Variance review': 'Reviewed', Reviewed: 'Closed' },
    boms: { Draft: 'Review', Review: 'Active', Active: 'Superseded' },
    'job-cards': { Draft: 'Ready', Ready: 'In progress', 'In progress': 'Completed', Paused: 'In progress', 'Needs review': 'Completed' },
    leave: { Requested: 'Approved', Approved: 'Taken', Rejected: 'Requested' },
    replenishment: { 'Review needed': 'Reviewed', Reviewed: 'Draft PO created', 'Draft PO created': 'Ordered' },
    packages: { 'Not shipped': 'Shipped', Shipped: 'Delivered', Exception: 'Shipped' },
    timesheets: { Draft: 'Submitted', Submitted: 'Approved', Approved: 'Invoiced', Rejected: 'Submitted' },

    opportunities: { New: 'Qualified', Qualified: 'Proposal', Proposal: 'Negotiation', Negotiation: 'Won' },
    projects: { Draft: 'Active', Active: 'On hold', 'On hold': 'Active' },
    tasks: { Open: 'In progress', 'In progress': 'Blocked', Blocked: 'In progress', Done: 'Reopened' },
    support: { New: 'Triaged', Triaged: 'In progress', 'In progress': 'Waiting on customer', 'Waiting on customer': 'Resolved', Resolved: 'Closed', Closed: 'Reopened' },
    'work-orders': { Draft: 'Planned', Planned: 'In progress', 'In progress': 'Quality check', 'Quality check': 'Completed' },
    quality: { Draft: 'Inspection', Inspection: 'Accepted', 'Needs rework': 'Inspection' },
    batches: { 'In stock': 'Quarantined', Quarantined: 'In stock' },
    'sales-returns': { Draft: 'Needs inspection', 'Needs inspection': 'Reviewed', Reviewed: 'Approved', Approved: 'Credited' },
    'purchase-returns': { Draft: 'Needs inspection', 'Needs inspection': 'Approved', Approved: 'Dispatched', Dispatched: 'Credit requested', 'Credit requested': 'Credit received' },
    'price-lists': { Draft: 'Review', Review: 'Active', Active: 'Expired' },
    'purchase-requests': { Draft: 'Submitted', Submitted: 'Under review', 'Under review': 'Approved', Approved: 'Converted' },
    rfqs: { Draft: 'Sent', Sent: 'Responses received', 'Responses received': 'Evaluated', Evaluated: 'Awarded' },
    'supplier-quotes': { Draft: 'Received', Received: 'Under review', 'Under review': 'Accepted' },
    'chart-of-accounts': { Draft: 'Active', Active: 'Blocked' },
    'tax-codes': { Draft: 'Active', Active: 'Expired' },
    'bank-reconciliation': { Draft: 'Matching', Matching: 'Needs review', 'Needs review': 'Reconciled', Reopened: 'Matching' },
    deliveries: { Draft: 'Picking', Picking: 'Packed', Packed: 'Dispatched', Dispatched: 'In transit', 'In transit': 'Delivered' },
    warehouses: { Active: 'Restricted', Restricted: 'Under maintenance', 'Under maintenance': 'Active' },
    employees: { Active: 'On leave', 'On leave': 'Suspended', Suspended: 'Exited' },
    attendance: { Pending: 'Reviewed', Reviewed: 'Approved' },
    payroll: { Draft: 'Review', Review: 'Approved', Approved: 'Payment prepared', 'Payment prepared': 'Paid' },
    suppliers: { Active: 'On hold', 'On hold': 'Inactive' },
    quotations: { Draft: 'Sent', Sent: 'Accepted' },
    'sales-orders': { Draft: 'Confirmed', Confirmed: 'Partially fulfilled', 'Partially fulfilled': 'Fulfilled', Fulfilled: 'Invoiced' },
    'sales-invoices': { Draft: 'Issued', Issued: 'Partially paid', 'Partially paid': 'Paid' },
    purchases: { Draft: 'Ordered', Ordered: 'Partially received', 'Partially received': 'Received' },
    'purchase-invoices': { Draft: 'Received', Received: 'Approved', Approved: 'Partially paid', 'Partially paid': 'Paid' },
    receiving: { Draft: 'Needs inspection', 'Needs inspection': 'Received' },
    'stock-counts': { Draft: 'Counted', Counted: 'Needs review', 'Needs review': 'Approved', Approved: 'Posted' },
    'tax-documents': { Draft: 'Ready for integration' },
    expenses: { Draft: 'Approved', Approved: 'Paid' },
    payments: { Pending: 'Recorded', Recorded: 'Reconciled' },
    accounting: { Draft: 'Posted' },
    assets: { Active: 'Under maintenance', 'Under maintenance': 'Disposed' },
    'stock-transfers': { Draft: 'Requested', Requested: 'In transit', 'In transit': 'Received' },
    team: { Invited: 'Active', Active: 'Suspended' },
  };
  return transitions[moduleId]?.[current];
}
