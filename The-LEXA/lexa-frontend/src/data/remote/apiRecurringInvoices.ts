import { apiClient } from './apiClient';
const enc=(value:string)=>encodeURIComponent(value);
export type RecurringInvoiceLineTemplate={description:string;productId?:string;quantity:number;unitPriceMinor:number;discountMinor?:number;taxCodeId?:string};
export interface RecurringInvoiceSchedule {
  id:string;customer_record_id:string;customer_name_snapshot:string;currency:string;line_templates:RecurringInvoiceLineTemplate[];
  frequency:string;interval_count:number;interval_unit?:string|null;start_date:string;end_date?:string|null;maximum_occurrences?:number|null;
  due_days:number;issue_mode:'draft'|'auto_issue';schedule_timezone:string;run_at_local_time:string;next_run_date:string;next_run_at:string;
  occurrence_count:number;status:'active'|'paused'|'completed'|'cancelled'|'needs_attention';last_error_summary?:string|null;failed_occurrences?:number;notification_user_ids?:string[];
}
export interface RecurringInvoiceOccurrence {id:string;occurrence_key:string;scheduled_local_date:string;status:string;invoice_id?:string|null;invoice_number?:string|null;error_summary?:string|null;snapshot?:unknown;generated_at?:string|null;}
const root=(workspaceId:string,branchId:string)=>`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/recurring-invoices`;
export const apiRecurringInvoices={
  list: (workspaceId:string,branchId:string,status?:string)=>apiClient.get<RecurringInvoiceSchedule[]>(root(workspaceId,branchId),{status}),
  create: (workspaceId:string,branchId:string,input:unknown)=>apiClient.post<RecurringInvoiceSchedule>(root(workspaceId,branchId),input,crypto.randomUUID()),
  update: (workspaceId:string,branchId:string,scheduleId:string,input:unknown)=>apiClient.patch<{id:string;updated:boolean;issueMode:string}>(`${root(workspaceId,branchId)}/${enc(scheduleId)}`,input),
  preview: (workspaceId:string,branchId:string,scheduleId:string)=>apiClient.get<any>(`${root(workspaceId,branchId)}/${enc(scheduleId)}/preview`),
  occurrences: (workspaceId:string,branchId:string,scheduleId:string)=>apiClient.get<RecurringInvoiceOccurrence[]>(`${root(workspaceId,branchId)}/${enc(scheduleId)}/occurrences`),
  pause: (workspaceId:string,branchId:string,scheduleId:string)=>apiClient.post(`${root(workspaceId,branchId)}/${enc(scheduleId)}/pause`,{},crypto.randomUUID()),
  resume: (workspaceId:string,branchId:string,scheduleId:string)=>apiClient.post(`${root(workspaceId,branchId)}/${enc(scheduleId)}/resume`,{},crypto.randomUUID()),
  cancel: (workspaceId:string,branchId:string,scheduleId:string)=>apiClient.post(`${root(workspaceId,branchId)}/${enc(scheduleId)}/cancel`,{},crypto.randomUUID()),
  retry: (workspaceId:string,branchId:string,scheduleId:string,occurrenceId:string)=>apiClient.post(`${root(workspaceId,branchId)}/${enc(scheduleId)}/occurrences/${enc(occurrenceId)}/retry`,{},crypto.randomUUID()),
};
