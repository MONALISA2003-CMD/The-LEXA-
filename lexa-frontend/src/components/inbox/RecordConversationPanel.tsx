import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageCircle, Plus, Users } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { isApiProvider } from '../../data/remote/runtimeConfig';
import { apiCollaboration } from '../../data/remote/apiCollaboration';

/** Contextual entry point for authorised discussions linked to a business record. */
export function RecordConversationPanel({ recordType, recordId, recordTitle }: { recordType: string; recordId: string; recordTitle: string }) {
  const { workspace, branch } = useWorkspace();
  const navigate = useNavigate();
  const threadsQuery = useQuery({
    queryKey: ['record-conversations', workspace.id, branch.id, recordType, recordId],
    queryFn: () => apiCollaboration.threads(workspace.id, branch.id, { type: recordType, id: recordId }),
    enabled: isApiProvider && Boolean(recordId),
    staleTime: 20_000,
    refetchInterval: isApiProvider ? 30_000 : false,
  });
  const linked = useMemo(() => (threadsQuery.data ?? []).filter((thread) => thread.recordType === recordType && thread.recordId === recordId), [threadsQuery.data, recordType, recordId]);
  function startConversation() {
    const params = new URLSearchParams({ tab: 'messages', recordType, recordId, recordTitle });
    navigate(`/inbox?${params.toString()}`);
  }
  function openThread(threadId: string) {
    const params = new URLSearchParams({ tab: 'messages', threadId });
    navigate(`/inbox?${params.toString()}`);
  }

  return <section className="record-conversation-panel" aria-label="Record conversations">
    <div className="record-conversation-heading"><span><MessageCircle size={16}/></span><div><strong>Conversation & collaboration</strong><small>Discuss this record with authorised teammates without losing its context.</small></div><button type="button" className="button button-secondary button-small" onClick={startConversation} disabled={!isApiProvider}><Plus size={13}/> Start discussion</button></div>
    {!isApiProvider ? <p className="record-conversation-state">Record discussions require the backend collaboration service. No local or sample conversations are shown.</p> : threadsQuery.isLoading ? <p className="record-conversation-state">Checking linked conversations…</p> : threadsQuery.isError ? <div className="record-conversation-state" role="status">Could not load record conversations. <button type="button" className="text-link" onClick={() => void threadsQuery.refetch()}>Retry</button></div> : linked.length === 0 ? <p className="record-conversation-state">No conversations are linked to this record yet.</p> : <div className="record-conversation-list">{linked.map((thread) => <button type="button" key={thread.id} className="record-conversation-row" onClick={() => openThread(thread.id)}><span className="record-conversation-avatar"><Users size={15}/></span><span className="record-conversation-copy"><strong>{thread.title}</strong><small>{thread.lastMessage || 'No messages yet'}{thread.lastMessageAt ? ` · ${new Date(thread.lastMessageAt).toLocaleString()}` : ''}</small></span>{thread.unreadCount > 0 && <span className="record-conversation-unread">{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</span>}<ArrowRight size={14}/></button>)}</div>}
  </section>;
}
