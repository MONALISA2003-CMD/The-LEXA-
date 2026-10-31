export type InboxTab = 'messages' | 'tasks' | 'approvals' | 'notifications' | 'activity';
export interface InboxThread { id: string; title: string; kind: 'direct' | 'group' | 'record'; lastMessage?: string; lastMessageAt?: string; unreadCount: number; participants?: string[]; recordHref?: string; recordType?: string; recordId?: string; }
export interface InboxMessage { id: string; threadId: string; body: string; senderId: string; senderName: string; sentAt: string; attachmentIds?: string[]; editedAt?: string; reactions?: Array<{ emoji: string; count: number; reactedByMe?: boolean }>; }
export interface InboxTask { id: string; title: string; description?: string; status: 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled'; priority: 'low' | 'normal' | 'high' | 'urgent'; dueAt?: string; assigneeName?: string; href?: string; }
export interface InboxApproval { id: string; title: string; description?: string; requestedBy: string; requestedAt: string; status: 'pending' | 'approved' | 'rejected'; href?: string; }
export interface InboxNotification { id: string; title: string; body: string; kind: string; createdAt: string; readAt?: string | null; href?: string; }
export interface ActivityEvent { id: string; kind: string; summary: string; actorName?: string; occurredAt: string; href?: string; }
