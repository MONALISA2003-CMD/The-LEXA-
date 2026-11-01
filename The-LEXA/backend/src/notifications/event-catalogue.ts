export type NotificationChannel = 'in_app' | 'email';

export interface NotificationDefinition {
  title: string;
  body: string;
  audienceRoles: readonly string[];
  entityModule?: string;
  hrefBase?: string;
  emailTemplate: 'business_event';
}

const ADMIN = ['owner', 'owner_administrator', 'administrator', 'admin'];
const MANAGERS = [...ADMIN, 'business_manager', 'manager', 'branch_manager'];
const FINANCE = [...MANAGERS, 'accountant', 'payroll_officer'];
const SALES = [...MANAGERS, 'sales', 'sales_operator', 'cashier'];
const DELIVERY = [...MANAGERS, 'inventory_operator', 'warehouse_operator'];

/** Versioned, intentionally non-PII notification text. Never copy raw event payloads into inbox/email. */
export const NOTIFICATION_CATALOGUE: Readonly<Record<string, NotificationDefinition>> = {
  'sale.completed': { title: 'Sale completed', body: 'A sale was completed. Open the sale to review its details.', audienceRoles: SALES, entityModule: 'sales', hrefBase: '/sales/' , emailTemplate: 'business_event' },
  'sale.payment.received': { title: 'Payment receipt recorded', body: 'A customer payment was recorded. Review the sale and its balance.', audienceRoles: [...new Set([...SALES, ...FINANCE])], entityModule: 'sales', hrefBase: '/sales/', emailTemplate: 'business_event' },
  'sale.payment.direct_receipt_recorded': { title: 'Payment receipt recorded', body: 'A direct customer receipt was recorded. Review the related sale.', audienceRoles: FINANCE, entityModule: 'sales', hrefBase: '/sales/', emailTemplate: 'business_event' },
  'customer_invoice.issued': { title: 'Customer invoice issued', body: 'A customer invoice was issued. Review its due date and outstanding balance.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'customer_invoice.receipt_allocated': { title: 'Invoice receipt allocated', body: 'A customer receipt was allocated to an invoice. Review the receivables register.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'customer.credit.created': { title: 'Customer credit created', body: 'A customer credit balance was created. Review the receivables register.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'customer.credit.changed': { title: 'Customer credit changed', body: 'A customer credit balance changed. Review the receivables register.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'customer.payment.overdue': { title: 'Customer payment overdue', body: 'A customer invoice is overdue. Review the receivables register.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'customer.payment.reminder_due': { title: 'Customer payment reminder due', body: 'A customer payment reminder is due. Review the receivables register.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'sale.return.recorded': { title: 'Refund or reversal recorded', body: 'A sale return or reversal was recorded. Review the sale and its accounting.', audienceRoles: FINANCE, entityModule: 'sales', hrefBase: '/sales/', emailTemplate: 'business_event' },
  'delivery.dispatch.created': { title: 'Delivery assigned', body: 'A delivery was assigned. Review the delivery workflow.', audienceRoles: DELIVERY, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.lifecycle.changed': { title: 'Delivery status changed', body: 'A delivery status changed. Review the delivery workflow.', audienceRoles: DELIVERY, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.picked_up': { title: 'Delivery picked up', body: 'A delivery was picked up. Review the delivery workflow.', audienceRoles: DELIVERY, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.delivered': { title: 'Delivery completed', body: 'A delivery was marked delivered. Review the delivery workflow.', audienceRoles: DELIVERY, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.failed': { title: 'Delivery failed or returned', body: 'A delivery failed or was returned. Review the delivery workflow.', audienceRoles: DELIVERY, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.status_changed': { title: 'Delivery status changed', body: 'A delivery status changed. Review the delivery workflow.', audienceRoles: DELIVERY, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.remittance.allocated': { title: 'Rider remittance allocated', body: 'A rider remittance was allocated to a sale. Review the remittance workflow.', audienceRoles: FINANCE, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'customer.created_from_lead': { title: 'Customer created from lead', body: 'A lead was converted into a customer. Review the customer record.', audienceRoles: SALES, entityModule: 'customers', hrefBase: '/modules/customers', emailTemplate: 'business_event' },
  'delivery.collection.reported': { title: 'Rider collection reported', body: 'A rider collection was reported. Review the remittance workflow.', audienceRoles: FINANCE, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'delivery.remittance.accepted': { title: 'Rider remittance received', body: 'A rider remittance was received or reconciled. Review the remittance workflow.', audienceRoles: FINANCE, entityModule: 'deliveries', hrefBase: '/modules/deliveries', emailTemplate: 'business_event' },
  'import.preview.completed': { title: 'Import validation completed', body: 'An import preview completed. Review validation results before applying it.', audienceRoles: ADMIN, entityModule: 'data-operations', hrefBase: '/data-operations', emailTemplate: 'business_event' },
  'import.approved': { title: 'Import approved', body: 'An import was approved and is ready to apply.', audienceRoles: ADMIN, entityModule: 'data-operations', hrefBase: '/data-operations', emailTemplate: 'business_event' },
  'import.applied': { title: 'Import applied', body: 'An import was applied. Review its results.', audienceRoles: ADMIN, entityModule: 'data-operations', hrefBase: '/data-operations', emailTemplate: 'business_event' },
  'import.failed': { title: 'Import failed', body: 'An import failed. Review the Operations Centre before retrying.', audienceRoles: ADMIN, entityModule: 'data-operations', hrefBase: '/data-operations', emailTemplate: 'business_event' },
  'export.completed': { title: 'Export completed', body: 'An export completed and is ready for authorised download.', audienceRoles: ADMIN, entityModule: 'data-operations', hrefBase: '/data-operations', emailTemplate: 'business_event' },
  'export.failed': { title: 'Export failed', body: 'An export failed. Review the Operations Centre before retrying.', audienceRoles: ADMIN, entityModule: 'data-operations', hrefBase: '/data-operations', emailTemplate: 'business_event' },
  'backup.completed': { title: 'Backup completed', body: 'A backup completed. Review its manifest and retention state.', audienceRoles: ADMIN, entityModule: 'operations', hrefBase: '/business-tools', emailTemplate: 'business_event' },
  'backup.failed': { title: 'Backup failed', body: 'A backup failed. Review the Operations Centre and backup runbook.', audienceRoles: ADMIN, entityModule: 'operations', hrefBase: '/business-tools', emailTemplate: 'business_event' },
  'restore.completed': { title: 'Restore completed', body: 'A restore completed and is awaiting the required recovery review.', audienceRoles: ADMIN, entityModule: 'operations', hrefBase: '/business-tools', emailTemplate: 'business_event' },
  'restore.failed': { title: 'Restore failed', body: 'A restore failed. Keep outbound work paused and review the restore runbook.', audienceRoles: ADMIN, entityModule: 'operations', hrefBase: '/business-tools', emailTemplate: 'business_event' },
  'recurring_invoice.generated': { title: 'Recurring invoice generated', body: 'A recurring invoice occurrence was generated. Review the invoice.', audienceRoles: FINANCE, entityModule: 'sales-invoices', hrefBase: '/modules/sales-invoices', emailTemplate: 'business_event' },
  'recurring_invoice.failed': { title: 'Recurring invoice generation failed', body: 'A recurring invoice could not be generated. Review the schedule and occurrence history.', audienceRoles: FINANCE, entityModule: 'recurring-invoices', hrefBase: '/modules/recurring-invoices', emailTemplate: 'business_event' },
  'attachment.scan.clean': { title: 'Attachment scan completed', body: 'An attachment passed the security scan and is available to authorised users.', audienceRoles: MANAGERS, entityModule: 'inbox', hrefBase: '/inbox', emailTemplate: 'business_event' },
  'attachment.scan.quarantined': { title: 'Attachment quarantined', body: 'An attachment was quarantined by the security scanner. Review it before taking action.', audienceRoles: ADMIN, entityModule: 'inbox', hrefBase: '/inbox', emailTemplate: 'business_event' },
  'attachment.scan.failed': { title: 'Attachment scan failed', body: 'An attachment could not be scanned. It remains unavailable until reviewed.', audienceRoles: ADMIN, entityModule: 'inbox', hrefBase: '/inbox', emailTemplate: 'business_event' },
  'worker.queue.incident': { title: 'Background worker incident', body: 'A background worker or queue incident requires operator attention.', audienceRoles: ADMIN, entityModule: 'operations', hrefBase: '/business-tools', emailTemplate: 'business_event' },
};

export function notificationHref(eventType: string, recordId: unknown): string | undefined {
  const definition = NOTIFICATION_CATALOGUE[eventType];
  if (!definition?.hrefBase) return undefined;
  if (definition.hrefBase.endsWith('/')) {
    const id = typeof recordId === 'string' ? recordId : '';
    return /^[0-9a-f-]{16,64}$/i.test(id) ? `${definition.hrefBase}${encodeURIComponent(id)}` : definition.hrefBase.slice(0, -1);
  }
  return definition.hrefBase;
}

export function isKnownNotificationEvent(eventType: string): boolean {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_CATALOGUE, eventType);
}
