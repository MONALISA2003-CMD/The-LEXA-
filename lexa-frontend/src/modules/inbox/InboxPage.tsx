import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, ArrowLeft, ArrowRight, Bell, Check, CheckCheck, Clock3, Inbox, MessageCircle, Send, ShieldCheck, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '../../app/WorkspaceContext';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiCollaboration } from '../../data/remote/apiCollaboration';
import type { InboxTab, InboxTask, InboxThread } from '../../data/contracts/collaboration';
import { StandardDataTable, type DataTableColumn } from '../../components/tables/StandardDataTable';
import { moduleAccentForPath } from '../../domain/shared/moduleAccents';

const tabs: Array<{ id: InboxTab; label: string; icon: typeof Inbox }> = [
  { id: 'messages', label: 'Messages', icon: MessageCircle }, { id: 'tasks', label: 'Tasks', icon: Check },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck }, { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'activity', label: 'Activity', icon: Activity },
];
function statusLabel(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function dateText(value?: string | null) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'No due date'; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }

export default function InboxPage() {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const inboxParams = new URLSearchParams(location.search);
  const requestedTab = inboxParams.get('tab') as InboxTab | null;
  const requestedThreadId = inboxParams.get('threadId') ?? '';
  const requestedRecordType = inboxParams.get('recordType') ?? '';
  const requestedRecordId = inboxParams.get('recordId') ?? '';
  const requestedRecordTitle = inboxParams.get('recordTitle') ?? '';
  const [tab, setTab] = useState<InboxTab>(tabs.some((item) => item.id === requestedTab) ? requestedTab as InboxTab : 'messages');
  const [threadId, setThreadId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('open');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarMonthOffset, setCalendarMonthOffset] = useState(0);
  const [approvalComment, setApprovalComment] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadParticipants, setNewThreadParticipants] = useState('');
  const [newThreadRecordType, setNewThreadRecordType] = useState('');
  const [newThreadRecordId, setNewThreadRecordId] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<InboxTask['priority']>('normal');
  const [newTaskDueAt, setNewTaskDueAt] = useState('');
  useEffect(() => {
    setTab(tabs.some((item) => item.id === requestedTab) ? requestedTab as InboxTab : 'messages');
    if (requestedThreadId) setThreadId(requestedThreadId);
    if (requestedRecordType && requestedRecordId) {
      setNewThreadRecordType(requestedRecordType);
      setNewThreadRecordId(requestedRecordId);
      setNewThreadTitle((current) => current || `Discussion: ${requestedRecordTitle || requestedRecordType}`);
      setShowNewThread(true);
    }
  }, [location.search, requestedTab, requestedThreadId, requestedRecordType, requestedRecordId, requestedRecordTitle]);
  const localOnly = !isApiProvider;
  const threadsQuery = useQuery({ queryKey: ['inbox-threads', workspace.id, branch.id], queryFn: () => apiCollaboration.threads(workspace.id, branch.id), enabled: isApiProvider && tab === 'messages', staleTime: 20_000, refetchInterval: isApiProvider && tab === 'messages' ? 20_000 : false });
  const threads = threadsQuery.data ?? [];
  const selectedThread: InboxThread | null = threadId ? threads.find((item) => item.id === threadId) ?? null : threads[0] ?? null;
  const messagesQuery = useQuery({ queryKey: ['inbox-messages', workspace.id, selectedThread?.id], queryFn: () => apiCollaboration.messages(workspace.id, selectedThread!.id), enabled: isApiProvider && tab === 'messages' && Boolean(selectedThread?.id), staleTime: 10_000, refetchInterval: isApiProvider && tab === 'messages' ? 15_000 : false });
  const tasksQuery = useQuery({ queryKey: ['inbox-tasks', workspace.id, branch.id, taskStatusFilter], queryFn: () => apiCollaboration.tasks(workspace.id, branch.id, taskStatusFilter === 'all' ? undefined : taskStatusFilter), enabled: isApiProvider && tab === 'tasks' });
  const approvalsQuery = useQuery({ queryKey: ['inbox-approvals', workspace.id, branch.id], queryFn: () => apiCollaboration.approvals(workspace.id, branch.id), enabled: isApiProvider && tab === 'approvals' });
  const notificationsQuery = useQuery({ queryKey: ['inbox-notifications', workspace.id, branch.id], queryFn: () => apiCollaboration.notifications(workspace.id, branch.id), enabled: isApiProvider && tab === 'notifications' });
  const activityQuery = useQuery({ queryKey: ['inbox-activity', workspace.id, branch.id], queryFn: () => apiCollaboration.activity(workspace.id, branch.id), enabled: isApiProvider && tab === 'activity' });

  useEffect(() => {
    if (selectedThread && selectedThread.id !== threadId) { setThreadId(selectedThread.id); setMessageSearch(''); setMessageBody(''); }
  }, [selectedThread, threadId]);
  useEffect(() => {
    if (!isApiProvider || !selectedThread || !selectedThread.unreadCount) return;
    void apiCollaboration.markThreadRead(workspace.id, selectedThread.id).then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ['inbox-threads', workspace.id, branch.id] }), queryClient.invalidateQueries({ queryKey: ['record-conversations', workspace.id, branch.id] })])).catch(() => undefined);
  }, [workspace.id, branch.id, selectedThread?.id, selectedThread?.unreadCount, queryClient]);
  const unreadCount = useMemo(() => (notificationsQuery.data ?? []).filter((item) => !item.readAt).length, [notificationsQuery.data]);
  const visibleMessages = useMemo(() => { const needle = messageSearch.trim().toLocaleLowerCase(); return (messagesQuery.data ?? []).filter((item) => !needle || `${item.body} ${item.senderName}`.toLocaleLowerCase().includes(needle)); }, [messagesQuery.data, messageSearch]);
  const calendarModel = useMemo(() => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const keyFor = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const taskMap = new Map<string, InboxTask[]>();
    for (const task of tasksQuery.data ?? []) {
      if (!task.dueAt) continue;
      const key = keyFor(new Date(task.dueAt));
      const bucket = taskMap.get(key) ?? []; bucket.push(task); taskMap.set(key, bucket);
    }
    return { month: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), cells: [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => ({ date: index + 1, key: keyFor(new Date(first.getFullYear(), first.getMonth(), index + 1)), tasks: taskMap.get(keyFor(new Date(first.getFullYear(), first.getMonth(), index + 1))) ?? [] }))] };
  }, [tasksQuery.data, calendarMonthOffset]);


  const sendMutation = useMutation({ mutationFn: (input: { body: string }) => apiCollaboration.sendMessage(workspace.id, selectedThread!.id, input.body), onSuccess: async () => { setMessageBody(''); await Promise.all([queryClient.invalidateQueries({ queryKey: ['inbox-messages', workspace.id, selectedThread?.id] }), queryClient.invalidateQueries({ queryKey: ['inbox-threads', workspace.id, branch.id] })]); }, onError: (error) => toast.error('Message not sent', { description: errorText(error) }) });
  const taskMutation = useMutation({ mutationFn: ({ taskId, status }: { taskId: string; status: InboxTask['status'] }) => apiCollaboration.updateTask(workspace.id, taskId, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox-tasks', workspace.id, branch.id] }), onError: (error) => toast.error('Task was not updated', { description: errorText(error) }) });

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = messageBody.trim();
    if (!body || !selectedThread) return;
    try { await sendMutation.mutateAsync({ body }); }
    catch { /* The mutation reports the server error through its onError handler. */ }
  }
  async function reactToMessage(messageId: string, emoji: string) {
    if (!selectedThread) return;
    try {
      await apiCollaboration.reactToMessage(workspace.id, selectedThread.id, messageId, emoji);
      await queryClient.invalidateQueries({ queryKey: ['inbox-messages', workspace.id, selectedThread.id] });
    } catch (error) { toast.error('Could not update reaction', { description: errorText(error) }); }
  }

  async function createConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const participants = newThreadParticipants.split(',').map((value) => value.trim()).filter(Boolean);
    if (!newThreadTitle.trim() || !participants.length) { toast.error('Enter a conversation title and at least one participant ID'); return; }
    if (Boolean(newThreadRecordType.trim()) !== Boolean(newThreadRecordId.trim())) { toast.error('To link a record, provide both its type and its record ID.'); return; }
    try {
      const record = newThreadRecordType.trim() && newThreadRecordId.trim() ? { type: newThreadRecordType.trim(), id: newThreadRecordId.trim() } : undefined;
      const created = await apiCollaboration.createThread(workspace.id, branch.id, newThreadTitle.trim(), participants, record);
      setNewThreadTitle(''); setNewThreadParticipants(''); setNewThreadRecordType(''); setNewThreadRecordId(''); setShowNewThread(false); setThreadId(created.id);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['inbox-threads', workspace.id, branch.id] }), queryClient.invalidateQueries({ queryKey: ['record-conversations', workspace.id, branch.id] })]);
      navigate(`/inbox?tab=messages&threadId=${encodeURIComponent(created.id)}`, { replace: true });
      toast.success(record ? 'Record conversation created' : 'Conversation created');
    } catch (error) { toast.error('Could not create conversation', { description: errorText(error) }); }
  }
  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const description = newTaskDescription.trim();
      const dueAt = newTaskDueAt ? new Date(`${newTaskDueAt}T23:59:00`).toISOString() : undefined;
      const assigneeId = newTaskAssignee.trim();
      await apiCollaboration.createTask(workspace.id, branch.id, {
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        ...(description ? { description } : {}),
        ...(dueAt ? { dueAt } : {}),
        ...(assigneeId ? { assigneeId } : {}),
      });
      setNewTaskTitle(''); setNewTaskDescription(''); setNewTaskAssignee(''); setNewTaskDueAt(''); setNewTaskPriority('normal'); setShowNewTask(false);
      await queryClient.invalidateQueries({ queryKey: ['inbox-tasks', workspace.id, branch.id] });
      toast.success('Task created');
    } catch (error) { toast.error('Task was not created', { description: errorText(error) }); }
  }

  async function decideApproval(approvalId: string, decision: 'approve' | 'reject') {
    setBusyId(approvalId);
    try { await apiCollaboration.decideApproval(workspace.id, approvalId, decision, approvalComment[approvalId]); toast.success(decision === 'approve' ? 'Approval recorded' : 'Request rejected'); await queryClient.invalidateQueries({ queryKey: ['inbox-approvals', workspace.id, branch.id] }); }
    catch (error) { toast.error('Could not record the decision', { description: errorText(error) }); }
    finally { setBusyId(''); }
  }
  async function markNotificationRead(id: string) {
    try { await apiCollaboration.markNotificationRead(workspace.id, id); await Promise.all([queryClient.invalidateQueries({ queryKey: ['inbox-notifications', workspace.id, branch.id] }), queryClient.invalidateQueries({ queryKey: ['notifications-summary', workspace.id, branch.id] })]); }
    catch (error) { toast.error('Notification was not updated', { description: errorText(error) }); }
  }
  async function markAllRead() {
    try { await apiCollaboration.markAllNotificationsRead(workspace.id); await Promise.all([queryClient.invalidateQueries({ queryKey: ['inbox-notifications', workspace.id, branch.id] }), queryClient.invalidateQueries({ queryKey: ['notifications-summary', workspace.id, branch.id] })]); toast.success('Notifications marked as read'); }
    catch (error) { toast.error('Could not mark notifications as read', { description: errorText(error) }); }
  }

  const taskColumns: DataTableColumn<InboxTask>[] = [
    { key: 'title', header: 'Task', cell: (row) => <span className="inbox-task-title"><strong>{row.title}</strong><small>{row.description || 'No description provided'}</small></span>, sortValue: (row) => row.title },
    { key: 'assignee', header: 'Assigned to', cell: (row) => row.assigneeName || 'Unassigned', sortValue: (row) => row.assigneeName ?? '' },
    { key: 'dueAt', header: 'Due', cell: (row) => dateText(row.dueAt), sortValue: (row) => row.dueAt ?? '' },
    { key: 'priority', header: 'Priority', cell: (row) => <span className={`inbox-priority inbox-priority-${row.priority}`}>{statusLabel(row.priority)}</span>, sortValue: (row) => row.priority },
    { key: 'status', header: 'Status / action', cell: (row) => <select aria-label={`Update task ${row.title}`} value={row.status} disabled={taskMutation.isPending} onChange={(event) => taskMutation.mutate({ taskId: row.id, status: event.target.value as InboxTask['status'] })}>{(['open', 'in_progress', 'blocked', 'done', 'cancelled'] as const).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>, sortValue: (row) => row.status },
  ];

  const activeQuery = tab === 'messages' ? threadsQuery : tab === 'tasks' ? tasksQuery : tab === 'approvals' ? approvalsQuery : tab === 'notifications' ? notificationsQuery : activityQuery;
  const queryError = activeQuery.isError ? errorText(activeQuery.error) : '';

  return <div className="page-stack inbox-page" data-module-accent={moduleAccentForPath('/inbox')}>
    <div className="page-heading-row"><div><div className="eyebrow eyebrow-blue">WORKSPACE COLLABORATION</div><h2>Inbox & work queue</h2><p>Messages, notifications, assigned tasks, approval requests and the business activity trail.</p></div><button className="inbox-heading-count" onClick={() => { setTab('notifications'); navigate('/inbox?tab=notifications', { replace: true }); }}><Inbox size={17}/><span>{notificationsQuery.data ? `${unreadCount} unread notifications` : 'Open notification centre'}</span></button></div>
    {localOnly && <div className="overview-service-note"><MessageCircle size={18}/><div><strong>Collaboration backend required</strong><span>Chat, notifications, tasks and approvals are not simulated or stored as fake records. Configure the server API to enable this workspace.</span></div></div>}
    <nav className="inbox-tabs" aria-label="Inbox sections">{tabs.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={tab === item.id ? 'inbox-tab inbox-tab-active' : 'inbox-tab'} onClick={() => { setTab(item.id); navigate(item.id === 'messages' ? '/inbox' : `/inbox?tab=${item.id}`, { replace: true }); }}><Icon size={16}/>{item.label}{item.id === 'notifications' && unreadCount > 0 && <span>{unreadCount}</span>}</button>; })}</nav>
    {queryError && <div className="inline-error" role="alert"><strong>Could not load {tab}.</strong><span>{queryError}</span><button className="button button-secondary button-small" onClick={() => void activeQuery.refetch()}>Retry</button></div>}
    {tab === 'messages' && <div className="inbox-messages-layout"><section className="section-card inbox-threads-panel"><div className="inbox-panel-heading"><div><h3>Conversations</h3><p>Direct, group and record discussions</p></div><button className="button button-secondary button-small" disabled={!isApiProvider} onClick={() => setShowNewThread((value) => !value)}>New chat</button></div>{showNewThread && <form className="inbox-inline-form" onSubmit={(event) => void createConversation(event)}><label className="field-label">Conversation title<input required maxLength={120} value={newThreadTitle} onChange={(event) => setNewThreadTitle(event.target.value)} placeholder="Conversation title" /></label><label className="field-label">Participant IDs<input required value={newThreadParticipants} onChange={(event) => setNewThreadParticipants(event.target.value)} placeholder="user-id-1, user-id-2" /><small>Use backend user IDs separated by commas. The server must validate membership and permissions.</small></label><label className="field-label">Link to a record (optional)<select value={newThreadRecordType} onChange={(event) => setNewThreadRecordType(event.target.value)}><option value="">No linked record</option>{[['customer','Customer'],['product','Product'],['sale','Sale / receipt'],['sales-order','Sales order'],['sales-invoice','Sales invoice'],['supplier','Supplier'],['purchase-order','Purchase order'],['purchase-invoice','Supplier invoice'],['delivery','Delivery'],['expense','Expense']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>{newThreadRecordType && <label className="field-label">Record ID<input value={newThreadRecordId} onChange={(event) => setNewThreadRecordId(event.target.value)} maxLength={160} required placeholder="Paste the record ID" /><small>The backend must verify that every participant can access the linked record.</small></label>}<div><button className="button button-primary button-small" disabled={!isApiProvider} type="submit">Create chat</button><button className="button button-secondary button-small" type="button" onClick={() => setShowNewThread(false)}>Cancel</button></div></form>}{threadsQuery.isLoading ? <div className="loading-state">Loading conversations…</div> : threads.length === 0 ? <EmptyInbox icon={<MessageCircle size={23}/>} title="No conversations yet" detail="Conversations will appear here when the backend creates or assigns them. LEXA will not invent sample users or messages."/> : <div className="inbox-thread-list">{threads.map((thread) => <button key={thread.id} className={`inbox-thread ${selectedThread?.id === thread.id ? 'inbox-thread-selected' : ''}`} onClick={() => setThreadId(thread.id)}><span className="inbox-thread-avatar">{thread.kind === 'group' ? <Users size={17}/> : <MessageCircle size={17}/>}</span><span className="inbox-thread-copy"><strong>{thread.title}</strong><small>{thread.lastMessage || (thread.kind === 'record' ? 'Record conversation' : 'No messages yet')}</small><em>{thread.lastMessageAt ? dateText(thread.lastMessageAt) : 'New conversation'}</em></span>{thread.unreadCount > 0 && <b>{thread.unreadCount}</b>}</button>)}</div>}</section>
      <section className="section-card inbox-chat-panel">{!selectedThread ? <EmptyInbox icon={<MessageCircle size={23}/>} title="Select a conversation" detail="Choose a conversation from the list to read and reply."/> : <><div className="inbox-chat-heading"><div className="inbox-thread-avatar"><MessageCircle size={18}/></div><div><h3>{selectedThread.title}</h3><p>{selectedThread.kind === 'record' ? 'Record-linked discussion' : selectedThread.participants?.join(', ') || statusLabel(selectedThread.kind)}{selectedThread.recordHref && <> · <button onClick={() => navigate(selectedThread.recordHref!)}>Open linked record</button></>}</p></div></div><label className="inbox-message-search"><MessageCircle size={14}/><input aria-label="Search messages in this conversation" value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Search messages in this conversation…"/></label><div className="inbox-message-scroll">{messagesQuery.isLoading ? <div className="loading-state">Loading messages…</div> : !(messagesQuery.data ?? []).length ? <EmptyInbox icon={<MessageCircle size={22}/>} title="No messages in this conversation" detail="Send the first message when the conversation is ready."/> : !visibleMessages.length ? <EmptyInbox icon={<MessageCircle size={22}/>} title="No matching messages" detail="Try another word or clear the message search."/> : visibleMessages.map((message) => <article className="inbox-message" key={message.id}><div className="inbox-message-meta"><strong>{message.senderName}</strong><time>{dateText(message.sentAt)}</time></div><p>{message.body}</p><div className="inbox-message-reactions">{(message.reactions ?? []).map((reaction) => <button type="button" key={reaction.emoji} className={reaction.reactedByMe ? 'inbox-reaction inbox-reaction-active' : 'inbox-reaction'} onClick={() => void reactToMessage(message.id, reaction.emoji)} aria-label={`React ${reaction.emoji}, ${reaction.count} reactions`}>{reaction.emoji} {reaction.count}</button>)}{['👍','✅','👀'].map((emoji) => <button type="button" key={emoji} className="inbox-reaction inbox-reaction-add" onClick={() => void reactToMessage(message.id, emoji)} aria-label={`React with ${emoji}`}>{emoji}+</button>)}</div></article>)}</div><form className="inbox-composer" onSubmit={(event) => void submitMessage(event)}><label className="sr-only" htmlFor="inbox-message-text">Write a message</label><textarea id="inbox-message-text" rows={2} maxLength={10000} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="Write a message…" disabled={!isApiProvider || sendMutation.isPending}/><div className="inbox-composer-tools"><button className="button button-primary" type="submit" disabled={!isApiProvider || sendMutation.isPending || !messageBody.trim()}><Send size={15}/>{sendMutation.isPending ? 'Sending…' : 'Send'}</button></div><small>Message attachments are unavailable until private server-side file storage is implemented. Do not paste passwords, payment credentials or other secrets into messages.</small></form></>}</section></div>}
    {tab === 'tasks' && <section className="section-card inbox-data-panel"><div className="inbox-panel-heading"><div><h3>Tasks & follow-ups</h3><p>Work assigned to people with due dates and priorities</p></div><div className="inbox-view-switch"><button type="button" className={taskViewMode === 'list' ? 'active' : ''} onClick={() => setTaskViewMode('list')}>List</button><button type="button" className={taskViewMode === 'calendar' ? 'active' : ''} onClick={() => setTaskViewMode('calendar')}>Calendar</button></div><button className="button button-secondary button-small" disabled={!isApiProvider} onClick={() => setShowNewTask((value) => !value)}>New task</button><label className="inbox-filter"><span>Status</span><select value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option><option value="all">All tasks</option></select></label></div>{showNewTask && <form className="inbox-new-task-form" onSubmit={(event) => void createTask(event)}><label className="field-label">Task title<input required maxLength={200} value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Describe the work to complete" /></label><label className="field-label">Description<textarea rows={2} maxLength={3000} value={newTaskDescription} onChange={(event) => setNewTaskDescription(event.target.value)} placeholder="Context and expected outcome" /></label><label className="field-label">Assignee ID (optional)<input value={newTaskAssignee} onChange={(event) => setNewTaskAssignee(event.target.value)} placeholder="Backend user ID" /></label><label className="field-label">Priority<select value={newTaskPriority} onChange={(event) => setNewTaskPriority(event.target.value as InboxTask['priority'])}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="field-label">Due date<input type="date" value={newTaskDueAt} onChange={(event) => setNewTaskDueAt(event.target.value)} /></label><div><button type="submit" className="button button-primary button-small" disabled={!isApiProvider}>Create task</button><button type="button" className="button button-secondary button-small" onClick={() => setShowNewTask(false)}>Cancel</button></div></form>}{tasksQuery.isLoading ? <div className="loading-state">Loading tasks…</div> : taskViewMode === 'list' ? <StandardDataTable rows={tasksQuery.data ?? []} columns={taskColumns} emptyTitle="No tasks in this view" emptyDescription="Tasks will appear when assigned or created in the backend." searchPlaceholder="Search task title, assignee or status…" rowLabel="tasks"/> : <div className="inbox-calendar"><div className="inbox-calendar-heading"><button type="button" className="icon-button" aria-label="Previous month" onClick={() => setCalendarMonthOffset((value) => value - 1)}><ArrowLeft size={14}/></button><CalendarMonthIcon/><strong>{calendarModel.month}</strong><button type="button" className="icon-button" aria-label="Next month" onClick={() => setCalendarMonthOffset((value) => value + 1)}><ArrowRight size={14}/></button><span>Due dates from backend tasks</span></div><div className="inbox-calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day}>{day}</span>)}</div><div className="inbox-calendar-grid">{calendarModel.cells.map((cell, index) => cell ? <div key={cell.key} className={`inbox-calendar-day ${cell.tasks.length ? 'has-tasks' : ''}`}><strong>{cell.date}</strong>{cell.tasks.slice(0, 3).map((task) => <span key={task.id} title={task.title}>{task.title}</span>)}{cell.tasks.length > 3 && <small>+{cell.tasks.length - 3} more</small>}</div> : <div key={`blank-${index}`} className="inbox-calendar-blank" aria-hidden="true"/> )}</div><p className="inbox-calendar-note">The calendar shows due dates returned by the task service for the current month. Create a task with a due date to see it here.</p></div>}</section>}
    {tab === 'approvals' && <section className="section-card inbox-data-panel"><div className="inbox-panel-heading"><div><h3>Approval queue</h3><p>Requests awaiting an authorised decision</p></div><ShieldCheck size={18}/></div>{approvalsQuery.isLoading ? <div className="loading-state">Loading approval requests…</div> : !(approvalsQuery.data ?? []).length ? <EmptyInbox icon={<ShieldCheck size={23}/>} title="No pending approvals" detail="Pending requests will appear here when they are assigned to your account or role."/> : <div className="inbox-approval-list">{approvalsQuery.data?.map((approval) => <article className="inbox-approval-card" key={approval.id}><div className="inbox-approval-icon"><ShieldCheck size={18}/></div><div className="inbox-approval-copy"><div className="inbox-approval-meta"><span>REQUESTED BY {approval.requestedBy}</span><time>{dateText(approval.requestedAt)}</time></div><h3>{approval.title}</h3><p>{approval.description || 'No additional details supplied.'}</p>{approval.href && <button className="text-link" onClick={() => navigate(approval.href!)}>Review record <ArrowRight size={14}/></button>}<label className="field-label">Decision note (optional)<textarea rows={2} value={approvalComment[approval.id] ?? ''} onChange={(event) => setApprovalComment((current) => ({ ...current, [approval.id]: event.target.value }))} maxLength={2000}/></label><div className="inbox-approval-actions"><button className="button button-primary" disabled={busyId === approval.id} onClick={() => void decideApproval(approval.id, 'approve')}><Check size={15}/> Approve</button><button className="button button-danger" disabled={busyId === approval.id} onClick={() => void decideApproval(approval.id, 'reject')}><X size={15}/> Reject</button></div></div></article>)}</div>}</section>}
    {tab === 'notifications' && <section className="section-card inbox-data-panel"><div className="inbox-panel-heading"><div><h3>Notification centre</h3><p>Business events, mentions, reminders and alerts</p></div><button className="button button-secondary button-small" disabled={!isApiProvider || unreadCount === 0} onClick={() => void markAllRead()}><CheckCheck size={14}/> Mark all read</button></div>{notificationsQuery.isLoading ? <div className="loading-state">Loading notifications…</div> : !(notificationsQuery.data ?? []).length ? <EmptyInbox icon={<Bell size={23}/>} title="No notifications available" detail="Alerts will appear here when the backend publishes business events. No placeholder alerts are generated."/> : <div className="inbox-notification-list">{notificationsQuery.data?.map((item) => <article className={`inbox-notification ${item.readAt ? 'inbox-notification-read' : ''}`} key={item.id}><span className="inbox-notification-icon"><Bell size={17}/></span><div><div className="inbox-notification-heading"><strong>{item.title}</strong><time>{dateText(item.createdAt)}</time></div><p>{item.body}</p><div className="inbox-notification-actions">{item.href && <button className="text-link" onClick={() => navigate(item.href!)}>Open item <ArrowRight size={13}/></button>}{!item.readAt && <button className="text-link" onClick={() => void markNotificationRead(item.id)}>Mark read <Check size={13}/></button>}</div></div>{!item.readAt && <span className="inbox-unread-dot"/>}</article>)}</div>}</section>}
    {tab === 'activity' && <section className="section-card inbox-data-panel"><div className="inbox-panel-heading"><div><h3>Activity and audit trail</h3><p>Server-attributed events and business record changes</p></div><Activity size={18}/></div>{activityQuery.isLoading ? <div className="loading-state">Loading activity…</div> : <StandardDataTable rows={(activityQuery.data ?? []).map((item) => ({ ...item, summary: item.summary || item.kind }))} columns={[{ key: 'summary', header: 'Activity', cell: (item) => <span className="inbox-task-title"><strong>{item.summary}</strong><small>{item.actorName || 'System event'}</small></span>, sortValue: (item) => item.summary }, { key: 'kind', header: 'Type', cell: (item) => statusLabel(item.kind), sortValue: (item) => item.kind }, { key: 'occurredAt', header: 'When', cell: (item) => dateText(item.occurredAt), sortValue: (item) => item.occurredAt }, { key: 'target', header: 'Record', cell: (item) => item.href ? <button className="text-link" onClick={() => navigate(item.href!)}>Open <ArrowRight size={12}/></button> : '—' }]} emptyTitle="No activity in this scope" emptyDescription="Server-attributed changes will appear here when recorded." searchPlaceholder="Search activity…" rowLabel="events"/>}</section>}
    <div className="inbox-security-note"><ShieldCheck size={16}/><span>Actions are sent to the configured backend. Access control and audit attribution must be enforced server-side; the frontend does not grant permissions by hiding a button alone.</span></div>
  </div>;
}

function CalendarMonthIcon() { return <Clock3 size={16}/>; }
function EmptyInbox({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="inbox-empty-state"><span>{icon}</span><strong>{title}</strong><p>{detail}</p></div>;
}
