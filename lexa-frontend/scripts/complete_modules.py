#!/usr/bin/env python3
"""Apply the LEXA preview workflow-completion patch with source guards and idempotency."""
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT
PAGE_PATH = FRONTEND / "src/modules/operations/OperationsWorkspacePage.tsx"
TOOLS_PATH = FRONTEND / "src/data/mock/previewDataTools.ts"
CATALOG_PATH = FRONTEND / "src/modules/operations/moduleCatalog.ts"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        fail(f"{label}: expected exactly one source match, found {count}; no source changes written")
    return text.replace(old, new, 1)


def between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    first = text.find(start)
    if first < 0:
        fail(f"{label}: start marker not found")
    second = text.find(end, first + len(start))
    if second < 0:
        fail(f"{label}: end marker not found")
    return text[:first] + replacement + text[second:]


def generic_values_source() -> str:
    return r'''function genericRelatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {
  const target = getModuleDefinition(targetId);
  const today = dateInputValue(new Date());
  const dueDate = dateInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const sourceReferenceField = REFERENCE_FIELDS[sourceModuleId];
  const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;

  if (!target) return {};
  if (targetId === 'audit') {
    const sourceTitle = getModuleDefinition(sourceModuleId)?.title ?? sourceModuleId;
    return {
      eventDate: today,
      actor: 'Preview workspace user',
      action: 'Review note created',
      entity: sourceTitle,
      reference: sourceReference,
      detail: `Preview review note for ${sourceTitle} ${sourceReference}. This is not a trusted security audit event or a posted business transaction.`,
      status: 'Recorded',
    };
  }

  const aliases: Record<string, string[]> = {
    customer: ['customer', 'customerName', 'company', 'contactName', 'clientName', 'accountName', 'partyName'],
    customerName: ['customerName', 'customer', 'company', 'contactName', 'clientName'],
    company: ['company', 'customer', 'customerName', 'contactName', 'name'],
    contactName: ['contactName', 'contact', 'customer', 'customerName', 'name'],
    contact: ['contact', 'phone', 'phoneNumber', 'contactName'],
    phone: ['phone', 'contact', 'phoneNumber'],
    email: ['email', 'contactEmail'],
    supplier: ['supplier', 'supplierName', 'preferredSupplier', 'supplierInvited', 'vendor'],
    supplierName: ['supplierName', 'supplier', 'preferredSupplier', 'vendor'],
    partyName: ['partyName', 'customer', 'supplier', 'payee', 'company'],
    itemSummary: ['itemSummary', 'itemDescription', 'productName', 'product', 'bundleName', 'description', 'task'],
    itemDescription: ['itemDescription', 'itemSummary', 'productName', 'product', 'description'],
    item: ['item', 'product', 'productName', 'itemSummary', 'itemDescription'],
    product: ['product', 'productName', 'itemSummary', 'itemDescription'],
    productName: ['productName', 'finishedProductName', 'bundleName', 'itemSummary', 'product', 'item'],
    productSKU: ['productSKU', 'finishedProductSKU', 'sku', 'productCode'],
    sku: ['sku', 'productSKU', 'finishedProductSKU', 'bundleCode'],
    quantity: ['quantity', 'recommendedQuantity', 'orderedQuantity', 'plannedQuantity', 'unitsToPick'],
    orderedQuantity: ['orderedQuantity', 'quantity', 'plannedQuantity'],
    unitPrice: ['unitPrice', 'sellingPrice', 'estimatedValue', 'amount'],
    unitCost: ['unitCost', 'costPrice', 'unitPrice', 'amount'],
    amount: ['amount', 'amountDue', 'netPay', 'total', 'estimatedValue'],
    amountDue: ['amountDue', 'total', 'amount', 'estimatedValue'],
    amountPaid: ['amountPaid', 'amountReceived', 'paidAmount'],
    amountReceived: ['amountReceived', 'amountPaid', 'paidAmount'],
    taxRate: ['taxRate'],
    taxTreatment: ['taxTreatment'],
    project: ['project', 'projectName', 'projectCode'],
    projectName: ['projectName', 'project', 'projectCode', 'name'],
    task: ['task', 'taskName', 'subject', 'description'],
    taskName: ['taskName', 'task', 'subject'],
    employee: ['employee', 'employeeName', 'memberName', 'operator'],
    employeeName: ['employeeName', 'employee', 'memberName'],
    operator: ['operator', 'employee', 'employeeName'],
    owner: ['owner', 'assignedTo', 'manager', 'preparedBy'],
    assignedTo: ['assignedTo', 'owner', 'manager'],
    department: ['department', 'group', 'team'],
    warehouse: ['warehouse', 'location', 'warehouseName'],
    location: ['location', 'warehouse', 'locationCode'],
    account: ['account', 'accountName', 'terminal', 'moneyAccount'],
    accountName: ['accountName', 'account', 'name'],
    campaign: ['campaign', 'campaignCode', 'source'],
    source: ['source', 'campaign', 'campaignCode'],
    description: ['description', 'itemSummary', 'subject', 'name', 'title', 'nextAction'],
    subject: ['subject', 'description', 'itemSummary', 'name'],
    purpose: ['purpose', 'description', 'nextAction'],
    salesOrder: ['salesOrder', 'orderNumber', 'salesOrderReference', 'sourceOrder'],
    salesOrderReference: ['salesOrderReference', 'orderNumber', 'salesOrder', 'sourceOrder'],
    orderNumber: ['orderNumber', 'quoteNumber', 'salesOrder', 'invoiceNumber'],
    purchaseOrder: ['purchaseOrder', 'poNumber', 'orderNumber', 'billNumber'],
    purchaseOrderReference: ['purchaseOrderReference', 'poNumber', 'orderNumber'],
    sourceInvoice: ['sourceInvoice', 'invoiceNumber'],
    sourcePurchaseOrder: ['sourcePurchaseOrder', 'purchaseOrder', 'poNumber', 'billNumber'],
    rfqNumber: ['rfqNumber', 'requestNumber'],
    requestNumber: ['requestNumber', 'purchaseRequest'],
    sourceReference: ['sourceReference', sourceReferenceField ?? 'id'],
    reference: [sourceReferenceField ?? 'id', 'sourceReference', 'reference', 'invoiceNumber', 'orderNumber'],
    ticketNumber: ['ticketNumber', 'supportReference'],
    priority: ['priority'],
    channel: ['channel'],
    category: ['category'],
    branch: ['branch', 'branches'],
    role: ['role'],
    frequency: ['frequency'],
    currency: ['currency'],
    taxCode: ['taxCode', 'taxCodeReference'],
    costCenter: ['costCenter', 'costCenterCode', 'name'],
    costCenterCode: ['costCenterCode', 'costCenter'],
    bundleName: ['bundleName', 'productName', 'itemSummary'],
    bomReference: ['bomReference', 'bomCode'],
    workOrderNumber: ['workOrderNumber', 'jobCardNumber'],
    sourceType: ['sourceType'],
  };
  const result: FormValues = {};
  for (const field of target.fields) {
    if (field.key === 'status') continue;
    const candidates = aliases[field.key] ?? [field.key];
    const found = candidates.map((key) => source[key]).find((value) => typeof value === 'string' && value.trim().length > 0);
    if (found !== undefined) result[field.key] = found;
    else if (field.kind === 'date') {
      if (/(due|valid|expected|target|response|needed|needby|nextRun)/i.test(field.key)) result[field.key] = dueDate;
      else result[field.key] = today;
    }
  }
  // Use deliberate semantics for common business documents where a generic same-key copy is unsafe.
  if (targetId === 'sales-orders' && sourceModuleId === 'opportunities') {
    result.customer = source.company ?? source.contactName ?? '';
    result.itemSummary = source.nextAction ?? ('Opportunity ' + (source.opportunityCode ?? source.id));
    result.quantity = '1';
    result.unitPrice = source.amount ?? source.estimatedValue ?? '0';
    result.discountPercent = '0';
    result.taxTreatment = 'Standard rated';
    result.taxRate = '18';
  }
  if (targetId === 'payments' && sourceModuleId === 'payroll') {
    result.direction = 'Money out';
    result.partyType = 'Other';
    result.partyName = 'Payroll run ' + (source.payrollReference ?? source.id);
    result.amount = source.netPay ?? '0';
    result.notes = 'Preview payment for payroll run ' + (source.payrollReference ?? source.id) + '; no external transfer is initiated.';
  }
  return result;
}

'''


def main() -> None:
    for path in (PAGE_PATH, TOOLS_PATH, CATALOG_PATH):
        if not path.exists():
            fail(f"required source file is missing: {path.relative_to(ROOT)}")

    page = PAGE_PATH.read_text(encoding="utf-8")
    tools = TOOLS_PATH.read_text(encoding="utf-8")
    catalog = CATALOG_PATH.read_text(encoding="utf-8")

    # Fix the reported strict TypeScript errors.
    if "definition.title" in tools:
        count = tools.count("definition.title")
        if count != 2:
            fail(f"previewDataTools.ts: expected two definition.title references, found {count}")
        tools = tools.replace("definition.title", "definition.id")
    elif "definition.id} export contains invalid rows" in tools and "definition.id} export contains duplicate record IDs" in tools:
        print("TypeScript title-reference fix already applied")
    else:
        fail("previewDataTools.ts does not match the expected seed-validation source")

    # Add the shared graph import once.
    if "from './workflowGraph'" not in page:
        marker = "} from './moduleCatalog';\n"
        page = replace_once(page, marker, marker + "import { getCoreScreenShortcuts, getRelatedActions, isDuplicateSensitiveHandoff } from './workflowGraph';\n", "workflow graph import")
    elif "isDuplicateSensitiveHandoff" not in page:
        for old_import in (
            "import { getCoreScreenShortcuts, getRelatedActions } from './workflowGraph';",
            "import { getRelatedActions } from './workflowGraph';",
        ):
            if old_import in page:
                page = replace_once(page, old_import, "import { getCoreScreenShortcuts, getRelatedActions, isDuplicateSensitiveHandoff } from './workflowGraph';", "workflow graph import update")
                break
        else:
            fail("workflow graph import exists in an unsupported shape; refusing an unsafe import edit")

    # Replace the hand-maintained, narrow relation function with the shared, tested graph.
    action_start = "function relatedActions(moduleId: string, record: PreviewRecord): RelatedAction[] {"
    values_start = "function relatedValues(sourceModuleId: string, source: PreviewRecord, targetId: string): FormValues {"
    action_replacement = "function relatedActions(moduleId: string, record: PreviewRecord): RelatedAction[] {\n  return getRelatedActions(moduleId, record);\n}\n\n"
    if "return getRelatedActions(moduleId, record);" not in page:
        page = between(page, action_start, values_start, action_replacement, "related action function")

    # Supply a type-aware fallback for the new hand-offs; existing explicit mappings remain authoritative.
    values_start_index = page.find(values_start)
    module_manager_index = page.find("function ModuleManager(", values_start_index)
    if values_start_index < 0 or module_manager_index < 0:
        fail("relatedValues/ModuleManager markers not found")
    values_chunk = page[values_start_index:module_manager_index]
    if "return genericRelatedValues(sourceModuleId, source, targetId);" not in values_chunk:
        marker = "  return {};\n}\n\n"
        count = values_chunk.count(marker)
        if count != 1:
            fail(f"relatedValues fallback: expected one terminal return {{}} block, found {count}")
        values_chunk = values_chunk.replace(marker, "  return genericRelatedValues(sourceModuleId, source, targetId);\n}\n\n", 1)
        page = page[:values_start_index] + generic_values_source() + values_chunk + page[module_manager_index:]
    elif "function genericRelatedValues(" not in page:
        fail("generic related-value call exists without its helper")

    # Preserve a human-readable source reference on every generated downstream draft.
    old_values = "const values = { ...initialValues(target), ...relatedValues(module.id, source, targetId), sourceModuleId: module.id, sourceRecordId: source.id };"
    new_values = "const sourceReferenceField = REFERENCE_FIELDS[module.id];\n    const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;\n    const values = { ...initialValues(target), ...relatedValues(module.id, source, targetId), sourceModuleId: module.id, sourceRecordId: source.id, sourceReference };"
    if old_values in page:
        page = replace_once(page, old_values, new_values, "source reference metadata")
    elif "const sourceReference = sourceReferenceField ? (source[sourceReferenceField] ?? source.id) : source.id;" not in page:
        fail("createRelatedPreview source-value line was not found")

    # Prevent duplicate drafts only for one-to-one conversions; payments and shipments can legitimately repeat.
    duplicate_guard = (
        "    if (isDuplicateSensitiveHandoff(module.id, targetId)) {\n"
        "      const existingRows = await previewDataService.list(previewScope, targetId, target.initial);\n"
        "      const existing = existingRows.find((row) => row.sourceModuleId === module.id && row.sourceRecordId === source.id && !['Cancelled', 'Void', 'Voided', 'Rejected', 'Lost'].includes(row.status));\n"
        "      if (existing) {\n"
        "        const targetReferenceField = REFERENCE_FIELDS[targetId];\n"
        "        const existingReference = targetReferenceField ? (existing[targetReferenceField] ?? existing.id) : existing.id;\n"
        "        toast.error('Related draft already exists', { description: `${target.title} ${existingReference} is already linked to this source. Open the target register to review or edit it instead of creating a duplicate.` });\n"
        "        navigate('/modules/' + targetId);\n"
        "        return;\n"
        "      }\n"
        "    }\n"
    )
    if "if (isDuplicateSensitiveHandoff(module.id, targetId))" not in page:
        page = replace_once(page, "    const sourceReferenceField = REFERENCE_FIELDS[module.id];", duplicate_guard + "    const sourceReferenceField = REFERENCE_FIELDS[module.id];", "one-to-one duplicate protection")

    # Add navigation-only shortcuts into the seven existing core workflow screens.
    # The target is one exact JSX prefix so we do not accidentally alter other action bars.
    ui_old = "<div className=\"phase-modal-actions\">{!module.readOnly && <>{relatedActions(module.id, detail).map((action) => <button key={action.targetId} className=\"button button-secondary\" title={action.description} onClick={() => createRelatedPreview(action.targetId, detail)}><ArrowRight size={15} /> {action.label}</button>)}"
    ui_new = "<div className=\"phase-modal-actions\">{getCoreScreenShortcuts(module.id).map((action) => <button key={action.path} className=\"button button-secondary\" title={action.description} onClick={() => navigate(action.path)}><ArrowUpRight size={15} /> {action.label}</button>)}{!module.readOnly && <>{relatedActions(module.id, detail).map((action) => <button key={action.targetId} className=\"button button-secondary\" title={action.description} onClick={() => createRelatedPreview(action.targetId, detail)}><ArrowRight size={15} /> {action.label}</button>)}"
    if "getCoreScreenShortcuts(module.id).map((action) => <button key={action.path}" not in page:
        page = replace_once(page, ui_old, ui_new, "core screen shortcuts in record details")

    # Automatically add a *preview* activity note after creating a related draft. This is not a secure audit log.
    event_marker = """      const targetRows = await previewDataService.save(previewScope, targetId, linked, target.initial);
      queryClient.setQueryData(['phase-preview', workspace.id, branch.id, targetId], targetRows);
      void queryClient.invalidateQueries({ queryKey: ['phase-preview-reports', workspace.id, branch.id] });
      setStorageMode(previewDataService.getPersistenceMode());
      setDetail(null);
      toast.success('Related draft created', { description: 'Saved in the browser-local preview workspace only. No live module, stock or ledger was changed.' });
      navigate('/modules/' + targetId);"""
    event_replacement = """      const targetRows = await previewDataService.save(previewScope, targetId, linked, target.initial);
      queryClient.setQueryData(['phase-preview', workspace.id, branch.id, targetId], targetRows);
      if (targetId !== 'audit') {
        const auditModule = getModuleDefinition('audit');
        if (auditModule) {
          try {
            const now = new Date().toISOString();
            const targetReferenceField = REFERENCE_FIELDS[targetId];
            const targetReference = targetReferenceField ? (linked[targetReferenceField] ?? linked.id) : linked.id;
            const auditRecord: PreviewRecord = {
              id: 'AUD-LINK-' + Date.now().toString(36).toUpperCase(),
              updatedAt: now,
              status: 'Recorded',
              eventDate: now.slice(0, 10),
              actor: 'Preview workspace user',
              action: 'Related draft created',
              entity: target.title,
              reference: targetReference,
              detail: `${target.title} ${targetReference} was prepared from ${module.title} ${sourceReference}. Preview only; no live posting occurred.`,
              sourceModuleId: module.id,
              sourceRecordId: source.id,
              sourceReference,
            };
            const auditRows = await previewDataService.save(previewScope, 'audit', auditRecord, auditModule.initial);
            queryClient.setQueryData(['phase-preview', workspace.id, branch.id, 'audit'], auditRows);
          } catch (auditError) {
            toast.warning('Related draft saved, but its preview note failed', { description: auditError instanceof Error ? auditError.message : 'The local audit-preview register could not be updated.' });
          }
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['phase-preview-reports', workspace.id, branch.id] });
      setStorageMode(previewDataService.getPersistenceMode());
      setDetail(null);
      toast.success('Related draft created', { description: 'Saved in the browser-local preview workspace only. A local activity note was recorded where storage allowed. No live module, stock or ledger was changed.' });
      navigate('/modules/' + targetId);"""
    if event_marker in page:
        page = replace_once(page, event_marker, event_replacement, "preview activity note")
    elif "const auditRecord: PreviewRecord" not in page:
        fail("createRelatedPreview save block not found")

    # Extend the payment prefill with a payroll run without changing the existing invoice/expense branches.
    old_payment = """    const isExpense = sourceModuleId === 'expenses';
    return {
      paymentNumber: (moneyIn ? 'RCPT-PRE-' : 'PAY-PRE-') + Date.now().toString().slice(-7),
      direction: moneyIn ? 'Money in' : 'Money out',
      partyType: moneyIn ? 'Customer' : isSupplierBill ? 'Supplier' : 'Other',
      partyName: moneyIn ? source.customer ?? '' : isSupplierBill ? source.supplier ?? '' : source.payee ?? '',
      paymentDate: today, method: 'Bank transfer (recorded)', account: 'Main bank account', reference: '',
      amount: isExpense ? source.total ?? source.amount ?? '0' : source.amountDue ?? '0',
      notes: 'Draft created from ' + (source.invoiceNumber ?? source.billNumber ?? source.expenseNumber ?? source.id) + '. Review and allocate manually; no external payment is initiated.',
      status: 'Pending',
    };"""
    new_payment = """    const isExpense = sourceModuleId === 'expenses';
    const isPayroll = sourceModuleId === 'payroll';
    return {
      paymentNumber: (moneyIn ? 'RCPT-PRE-' : 'PAY-PRE-') + Date.now().toString().slice(-7),
      direction: moneyIn ? 'Money in' : 'Money out',
      partyType: moneyIn ? 'Customer' : isSupplierBill ? 'Supplier' : 'Other',
      partyName: moneyIn ? source.customer ?? '' : isSupplierBill ? source.supplier ?? '' : isPayroll ? ('Payroll run ' + (source.payrollReference ?? source.id)) : source.payee ?? '',
      paymentDate: today, method: 'Bank transfer (recorded)', account: 'Main bank account', reference: '',
      amount: isPayroll ? source.netPay ?? '0' : isExpense ? source.total ?? source.amount ?? '0' : source.amountDue ?? '0',
      notes: 'Draft created from ' + (source.invoiceNumber ?? source.billNumber ?? source.expenseNumber ?? source.payrollReference ?? source.id) + '. Review and allocate manually; no external payment is initiated.',
      status: 'Pending',
    };"""
    if old_payment in page:
        page = replace_once(page, old_payment, new_payment, "payroll payment prefill")
    elif "const isPayroll = sourceModuleId === 'payroll';" not in page:
        fail("payment prefill block not found")

    # Make the audit module description accurately reflect generated local preview notes.
    old_description = "description: 'Browse sample operational events to shape the future audit trail and exception review interface.',"
    new_description = "description: 'Browse seeded sample events and browser-local preview workflow notes. This is not a trusted security audit source.',"
    if old_description in catalog:
        catalog = replace_once(catalog, old_description, new_description, "audit module description")
    old_workflow = "workflow: 'A production audit log must be generated by trusted server-side actions and be tamper-resistant. This module is read-only sample data and is not a security audit source.',"
    new_workflow = "workflow: 'Related preview-draft actions can append local activity notes for review and traceability. A production audit log must still be generated by trusted server-side actions and be tamper-resistant; these notes are not a security audit source.',"
    if old_workflow in catalog:
        catalog = replace_once(catalog, old_workflow, new_workflow, "audit module workflow text")

    # Validate all required transformations before writing any file.
    if "definition.title" in tools:
        fail("TypeScript seed error fix did not complete")
    if "from './workflowGraph'" not in page or "return getRelatedActions(moduleId, record);" not in page or "getCoreScreenShortcuts(module.id)" not in page or "isDuplicateSensitiveHandoff" not in page:
        fail("workflow graph import/delegation/core shortcuts/duplicate protection are missing")
    if "function genericRelatedValues(" not in page or "sourceReference," not in page:
        fail("generic mapping or source reference metadata is missing")
    if "AUD-LINK-" not in page:
        fail("preview activity note code is missing")

    PAGE_PATH.write_text(page, encoding="utf-8")
    TOOLS_PATH.write_text(tools, encoding="utf-8")
    CATALOG_PATH.write_text(catalog, encoding="utf-8")
    print("Applied LEXA module workflow completion changes:")
    print(" - corrected the PreviewModuleSeed strict TypeScript error")
    print(" - enabled the shared status-aware workflow graph")
    print(" - added generic related-field mapping and source references")
    print(" - protected one-to-one hand-offs from duplicate target drafts")
    print(" - recorded local preview activity notes for related hand-offs")
    print(" - clarified that activity notes are not a trusted security audit log")

if __name__ == '__main__':
    main()
