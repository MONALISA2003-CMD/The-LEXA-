import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowRight, Link2, MessageCircle, Plus, Users } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiCollaboration } from '../../data/remote/apiCollaboration';
import { apiModuleGraph, isModuleId } from '../../data/remote/apiModuleGraph';

/** Contextual discussion, relationship graph and event timeline for a business record. */
export function RecordConversationPanel({ recordType, recordId, recordTitle }: { recordType: string; recordId: string; recordTitle: string }) {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const moduleRecord = isModuleId(recordType);
  const threadsQuery = useQuery({
    queryKey: ['record-conversations', workspace.id, branch.id, recordType, recordId],
    queryFn: () => apiCollaboration.threads(workspace.id, branch.id, { type: recordType, id: recordId }),
    enabled: isApiProvider && Boolean(recordId),
    staleTime: 20_000,
    refetchInterval: isApiProvider ? 30_000 : false,
  });
  const linked = useMemo(() => (threadsQuery.data ?? []).filter((thread) => thread.recordType === recordType && thread.recordId === recordId), [threadsQuery.data, recordType, recordId]);
  const linksQuery = useQuery({
    queryKey: ['module-record-links', workspace.id, branch.id, recordType, recordId],
    queryFn: () => apiModuleGraph.links({ workspaceId: workspace.id, branchId: branch.id }, recordType, recordId),
    enabled: isApiProvider && moduleRecord && Boolean(recordId),
    staleTime: 10_000,
    refetchInterval: isApiProvider && moduleRecord ? 30_000 : false,
  });
  const eventsQuery = useQuery({
    queryKey: ['module-record-events', workspace.id, branch.id, recordType, recordId],
    queryFn: () => apiModuleGraph.events({ workspaceId: workspace.id, branchId: branch.id }, recordType, recordId, 12),
    enabled: isApiProvider && moduleRecord && Boolean(recordId),
    staleTime: 10_000,
    refetchInterval: isApiProvider && moduleRecord ? 30_000 : false,
  });

  function startConversation() {
    const params = new URLSearchParams({ tab: 'messages', recordType, recordId, recordTitle });
    navigate(`/inbox?${params.toString()}`);
  }
  function openThread(threadId: string) {
    const params = new URLSearchParams({ tab: 'messages', threadId });
    navigate(`/inbox?${params.toString()}`);
  }
  function openLinkedModule(moduleId: string) {
    navigate(`/modules/${encodeURIComponent(moduleId)}`);
  }

  return <>
    <section className="record-conversation-panel" aria-label="Record conversations">
      <div className="record-conversation-heading"><span><MessageCircle size={16}/></span><div><strong>Conversation & collaboration</strong><small>Discuss this record with authorised teammates without losing its context.</small></div><button type="button" className="button button-secondary button-small" onClick={startConversation} disabled={!isApiProvider}><Plus size={13}/> Start discussion</button></div>
      {!isApiProvider ? <p className="record-conversation-state">Record discussions require the backend collaboration service. No local or sample conversations are shown.</p> : threadsQuery.isLoading ? <p className="record-conversation-state">Checking linked conversations…</p> : threadsQuery.isError ? <div className="record-conversation-state" role="status">Could not load record conversations. <button type="button" className="text-link" onClick={() => void threadsQuery.refetch()}>Retry</button></div> : linked.length === 0 ? <p className="record-conversation-state">No conversations are linked to this record yet.</p> : <div className="record-conversation-list">{linked.map((thread) => <button type="button" key={thread.id} className="record-conversation-row" onClick={() => openThread(thread.id)}><span className="record-conversation-avatar"><Users size={15}/></span><span className="record-conversation-copy"><strong>{thread.title}</strong><small>{thread.lastMessage || 'No messages yet'}{thread.lastMessageAt ? ` · ${new Date(thread.lastMessageAt).toLocaleString()}` : ''}</small></span>{thread.unreadCount > 0 && <span className="record-conversation-unread">{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</span>}<ArrowRight size={14}/></button>)}</div>}
    </section>

    {moduleRecord && <section className="record-conversation-panel record-module-graph" aria-label="Connected module records and activity">
      <div className="record-conversation-heading"><span><Link2 size={16}/></span><div><strong>Connected business records</strong><small>Verified links between this record and other LEXA modules.</small></div><span className="record-graph-count">{linksQuery.data?.length ?? 0}</span></div>
      {!isApiProvider ? <p className="record-conversation-state">Module relationships are available in connected backend mode.</p> : linksQuery.isLoading ? <p className="record-conversation-state">Loading connected records…</p> : linksQuery.isError ? <div className="record-conversation-state" role="status">Could not load linked records. <button type="button" className="text-link" onClick={() => void linksQuery.refetch()}>Retry</button></div> : (linksQuery.data?.length ?? 0) === 0 ? <p className="record-conversation-state">No linked records yet. Use a related workflow action to create a connected record.</p> : <div className="record-conversation-list">{linksQuery.data!.map((link) => <button type="button" key={link.id} className="record-conversation-row" onClick={() => openLinkedModule(link.relatedModuleId)}><span className="record-conversation-avatar"><Link2 size={15}/></span><span className="record-conversation-copy"><strong>{link.relatedTitle || link.relatedRecordId}</strong><small>{link.direction === 'outgoing' ? 'Created from this record' : 'Linked from another module'} · {link.relatedModuleId} · {link.relationType.replace(/_/g, ' ')}</small></span><ArrowRight size={14}/></button>)}</div>}
      <div className="record-graph-activity-heading"><Activity size={14}/><strong>Recent module activity</strong></div>
      {eventsQuery.isLoading ? <p className="record-conversation-state">Loading activity…</p> : eventsQuery.isError ? <p className="record-conversation-state">Activity is temporarily unavailable.</p> : (eventsQuery.data?.length ?? 0) === 0 ? <p className="record-conversation-state">No activity has been recorded yet.</p> : <div className="record-graph-event-list">{eventsQuery.data!.map((event) => <div className="record-graph-event" key={event.id}><span className="record-graph-event-dot"/><div><strong>{event.eventType.replace(/[._]/g, ' ')}</strong><small>{new Date(event.createdAt).toLocaleString()} · {event.outboxStatus}</small></div></div>)}</div>}
    </section>}
  </>;
}
