import type { ActivityEvent, InboxApproval, InboxMessage, InboxNotification, InboxTask, InboxThread } from '../contracts/collaboration';
import { apiClient } from './apiClient';
const enc = (value: string) => encodeURIComponent(value);
function list<T>(value: unknown, label: string): T[] {
  const result = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items) ? (value as { items: unknown[] }).items : null;
  if (!result) throw new Error(`Backend returned an invalid ${label} collection.`);
  return result as T[];
}
export const apiCollaboration = {
  async threads(workspaceId: string, branchId: string, record?: { type: string; id: string }) { return list<InboxThread>(await apiClient.get(`/workspaces/${enc(workspaceId)}/inbox/threads`, { branchId, recordType: record?.type, recordId: record?.id }), 'inbox thread'); },
  async createThread(workspaceId: string, branchId: string, title: string, participantIds: string[], record?: { type: string; id: string }) { return apiClient.post<{ id: string }>(`/workspaces/${enc(workspaceId)}/inbox/threads`, { branchId, title, kind: record ? 'record' : participantIds.length > 1 ? 'group' : 'direct', participantIds, ...(record ? { recordType: record.type, recordId: record.id } : {}) }, crypto.randomUUID()); },
  async messages(workspaceId: string, threadId: string) { return list<InboxMessage>(await apiClient.get(`/workspaces/${enc(workspaceId)}/inbox/threads/${enc(threadId)}/messages`), 'message'); },
  async sendMessage(workspaceId: string, threadId: string, body: string, attachmentIds: string[] = []) { return apiClient.post<InboxMessage>(`/workspaces/${enc(workspaceId)}/inbox/threads/${enc(threadId)}/messages`, { body, attachmentIds }, crypto.randomUUID()); },
  async uploadInboxAttachment(workspaceId: string, branchId: string, threadId: string, file: File) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
    const signed = await apiClient.post<{attachmentId:string;uploadUrl:string;requiredHeaders:Record<string,string>}>(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/platform/attachments/upload-url`, {fileName:file.name,mimeType:file.type,sizeBytes:file.size,sha256,conversationId:threadId}, crypto.randomUUID());
    const put = await fetch(signed.uploadUrl,{method:'PUT',headers:signed.requiredHeaders,body:file});
    if(!put.ok) throw new Error(`Object upload failed (${put.status}).`);
    await apiClient.post(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/platform/attachments/${enc(signed.attachmentId)}/complete`,{},crypto.randomUUID());
    return signed.attachmentId;
  },
  async attachments(workspaceId:string,branchId:string) { return list<{id:string;original_name:string;mime_type:string;size_bytes:number;status:string;created_at:string}>(await apiClient.get(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/platform/attachments`), 'attachment'); },
  async attachmentDownloadUrl(workspaceId:string,branchId:string,attachmentId:string) { return apiClient.get<{downloadUrl:string}>(`/workspaces/${enc(workspaceId)}/branches/${enc(branchId)}/platform/attachments/${enc(attachmentId)}/download-url`); },
  async reactToMessage(workspaceId: string, threadId: string, messageId: string, emoji: string) { return apiClient.post<{ reactions: InboxMessage['reactions'] }>(`/workspaces/${enc(workspaceId)}/inbox/threads/${enc(threadId)}/messages/${enc(messageId)}/reactions`, { emoji }, crypto.randomUUID()); },
  async markThreadRead(workspaceId: string, threadId: string) { return apiClient.post<void>(`/workspaces/${enc(workspaceId)}/inbox/threads/${enc(threadId)}/read`, {}, crypto.randomUUID()); },
  async tasks(workspaceId: string, branchId: string, status?: string) { return list<InboxTask>(await apiClient.get(`/workspaces/${enc(workspaceId)}/tasks`, { branchId, status }), 'task'); },
  async createTask(workspaceId: string, branchId: string, input: { title: string; description?: string; priority: InboxTask['priority']; dueAt?: string; assigneeId?: string }) { return apiClient.post<InboxTask>(`/workspaces/${enc(workspaceId)}/tasks`, { branchId, ...input }, crypto.randomUUID()); },
  async updateTask(workspaceId: string, taskId: string, status: InboxTask['status']) { return apiClient.patch<InboxTask>(`/workspaces/${enc(workspaceId)}/tasks/${enc(taskId)}`, { status }); },
  async approvals(workspaceId: string, branchId: string) { return list<InboxApproval>(await apiClient.get(`/workspaces/${enc(workspaceId)}/approvals`, { branchId, status: 'pending' }), 'approval'); },
  async decideApproval(workspaceId: string, approvalId: string, decision: 'approve' | 'reject', comment?: string) { return apiClient.post<InboxApproval>(`/workspaces/${enc(workspaceId)}/approvals/${enc(approvalId)}/decision`, { decision, comment }, crypto.randomUUID()); },
  async notifications(workspaceId: string, branchId: string) { return list<InboxNotification>(await apiClient.get(`/workspaces/${enc(workspaceId)}/notifications`, { branchId, limit: 100 }), 'notification'); },
  async markNotificationRead(workspaceId: string, notificationId: string) { return apiClient.post<void>(`/workspaces/${enc(workspaceId)}/notifications/${enc(notificationId)}/read`, {}, crypto.randomUUID()); },
  async markAllNotificationsRead(workspaceId: string) { return apiClient.post<void>(`/workspaces/${enc(workspaceId)}/notifications/read-all`, {}, crypto.randomUUID()); },
  async activity(workspaceId: string, branchId: string) { return list<ActivityEvent>(await apiClient.get(`/workspaces/${enc(workspaceId)}/activity`, { branchId, limit: 100 }), 'activity'); },
};
