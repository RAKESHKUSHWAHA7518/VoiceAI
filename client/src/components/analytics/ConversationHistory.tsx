import { useCallback, useEffect, useRef, useState } from 'react';
import { StudioIcon } from '../common/StudioIcon';
interface Summary { id: string; agent_id: string; agent_name: string; started_at: number; updated_at: number; status: string; runtime_mode: string; message_count: number; preview: string; processing_ms: number | null }
interface Detail extends Summary { channel?: string; origin?: string; recording?: { status: string; duration?: number; bytes?: number; expires_at: number } | null; configuration?: Record<string, unknown>; sources?: Array<{ doc_id: string; title: string }>; turn_outcomes?: Array<{ id: string; input: string; output: string; status: string }>;  tool_events?: Array<{ name: string; status: string; result: string }>; messages: Array<{ role: string; text: string; timestamp: number }> }
export function ConversationHistory() {
  const [records, setRecords] = useState<Summary[]>([]); const [selected, setSelected] = useState<Detail | null>(null);
  const [listError, setListError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState(''); const [deleting, setDeleting] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(); const listBody = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [error, setError] = useState(''); const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [query, setQuery] = useState(''); const [reload, setReload] = useState(0);
  const [pagination, setPagination] = useState({ page: 1, page_size: 10, total: 0, total_pages: 1 });
  const [stats, setStats] = useState({ conversation_count: 0, message_count: 0 });
  const detailRequest = useRef<AbortController>();
  const clearDetail = useCallback(() => { detailRequest.current?.abort(); setSelected(null); setActiveId(null); setDetailLoading(false); }, []);
  useEffect(() => { if (filter.trim() === query) return; const timer = setTimeout(() => { setQuery(filter.trim()); setPage(1); clearDetail(); }, 300); return () => clearTimeout(timer); }, [filter, query, clearDetail]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setListError(false);
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), q: query });
    void fetch('/api/conversations/history?' + params, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load conversation history.'); const data = await response.json();
      if (controller.signal.aborted) return; setRecords(data.conversations); setPagination(data.pagination); setStats(data.stats); if (data.pagination.page !== page) setPage(data.pagination.page);
    }).catch(err => { if (!controller.signal.aborted) { setRecords([]); setListError(true); clearDetail(); setError(err instanceof Error ? err.message : 'History is unavailable.'); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, pageSize, query, reload, clearDetail]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  useEffect(() => { if (listBody.current) listBody.current.scrollTop = 0; }, [page, pageSize, query]);
  const open = async (id: string) => {
    detailRequest.current?.abort(); const controller = new AbortController(); detailRequest.current = controller; setActiveId(id); setSelected(null); setDetailLoading(true); setError('');
    try { const response = await fetch(`/api/conversations/history/${id}`, { signal: controller.signal }); if (!response.ok) throw new Error('Could not open this transcript.'); const data = await response.json(); if (!controller.signal.aborted) setSelected(data.conversation); }
    catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Could not load transcript.'); }
    finally { if (!controller.signal.aborted) setDetailLoading(false); }
  };
  const visible = records;
  const changePage = (next: number) => { clearDetail(); setPage(next); };
  const shortId = (id: string) => id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
  const copyId = async (id: string) => {
    clearTimeout(copyTimer.current);
    try { await navigator.clipboard.writeText(id); setCopyNotice('Conversation ID copied'); }
    catch { setCopyNotice('Copy unavailable. Select the full ID in conversation details.'); }
    copyTimer.current = setTimeout(() => setCopyNotice(''), 3500);
  };
  const removeAudio = async () => {
    if (!selected || deleting) return;
    const id = selected.id; const request = detailRequest.current; setDeleting(true);
    try { const response = await fetch(`/api/conversations/history/${id}/recording`, { method: 'DELETE' }); if (!response.ok) throw new Error('Could not delete recording.'); if (!request?.signal.aborted && detailRequest.current === request) await open(id); }
    catch (err) { if (!request?.signal.aborted && detailRequest.current === request) setError(err instanceof Error ? err.message : 'Deletion failed.'); }
    finally { setDeleting(false); }
  };
  return <section className="conversation-history-page history-redesigned">
    <header className="history-page-heading">
      <div><span className="workflow-eyebrow">CONVERSATION LOG</span><h2>Conversation history</h2><p>Every conversation. One place to listen, read and learn.</p></div>
      <button className="btn btn-secondary" onClick={() => setReload(value => value + 1)} disabled={loading}>Refresh history</button>
    </header>
    <div className="history-stats">
      <div><span className="history-stat-icon"><StudioIcon name="voice" size={19} /></span><section><strong>{stats.conversation_count}</strong><span>Saved conversations</span></section></div>
      <div><span className="history-stat-icon"><StudioIcon name="book" size={19} /></span><section><strong>{stats.message_count}</strong><span>Messages exchanged</span></section></div>
      <div><span className="history-stat-icon private"><StudioIcon name="check" size={19} /></span><section><strong className="history-private-title">Private workspace</strong><span>Only your workspace can access this history</span></section></div>
    </div>
    {error && <p role="alert" className="workflow-error">{error}</p>}
    <div className="history-toolbar">
      <label className="history-search"><StudioIcon name="search" size={18} /><span className="sr-only">Search conversations</span><input className="form-input" maxLength={200} value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search conversations, agents or messages…" /></label>
      <span className="history-copy-notice" role="status" aria-live="polite">{copyNotice}</span>
    </div>
    <nav className="history-pagination" aria-label="Conversation history pages">
      <div className="history-pagination-summary" role="status">{loading ? 'Loading conversations…' : listError ? 'History unavailable · Retry to load results' : pagination.total ? `Showing ${(pagination.page - 1) * pagination.page_size + 1}–${Math.min(pagination.page * pagination.page_size, pagination.total)} of ${pagination.total} conversations` : '0 conversations'}</div>
      <div className="history-pagination-controls"><label>Rows<select aria-label="Conversations per page" value={pageSize} disabled={loading} onChange={event => { clearDetail(); setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        <div className="history-page-buttons"><button className="btn btn-secondary" disabled={loading || listError || page <= 1} onClick={() => changePage(page - 1)}>Previous</button><span>{listError ? `Requested page ${page}` : <>Page <strong>{pagination.page}</strong> of {pagination.total_pages}</>}</span><button className="btn btn-secondary" disabled={loading || listError || page >= pagination.total_pages} onClick={() => changePage(page + 1)}>Next</button></div>
      </div>
    </nav>
    <div className="history-layout">
      <section className="history-list" aria-label="Saved conversations">
        <header className="history-list-heading"><h3>Conversations</h3><span>Newest activity first</span></header>
        <div className="history-list-body" ref={listBody}>
          {loading ? <div className="history-empty" role="status">Loading conversations…</div> : listError ? <div className="history-empty"><h3>Could not load conversations</h3><p>Retry this page or change your search.</p><button className="btn btn-secondary" onClick={() => setReload(value => value + 1)}>Retry</button></div> : !visible.length ? <div className="history-empty"><StudioIcon name="search" size={26} /><h3>{query ? 'No conversations found' : 'Your first conversation starts here'}</h3><p>{query ? 'Try another agent name, conversation ID or phrase.' : 'Test an agent to see its conversation here.'}</p>{query ? <button className="btn btn-secondary" onClick={() => setFilter('')}>Clear search</button> : <a href="/agents" className="btn btn-primary">Open agents</a>}</div> : visible.map(record => <article key={record.id} className={`history-entry ${activeId === record.id ? 'is-selected' : ''}`}>
            <button className="history-entry-main" aria-pressed={activeId === record.id} onClick={() => void open(record.id)}>
              <span className="history-entry-heading"><span className="history-entry-avatar">{record.agent_name.slice(0, 1)}</span><strong>{record.agent_name}</strong><span className={`history-mode ${record.runtime_mode}`}>{record.runtime_mode === 'demo' ? 'Demo' : 'Live'}</span></span>
              <span className={`history-entry-preview ${record.preview ? '' : 'is-empty'}`}>{record.preview || 'No caller message yet'}</span>
            </button>
            <div className="history-entry-footer"><time dateTime={new Date(record.started_at).toISOString()}>{new Date(record.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(record.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time><span>{record.message_count} {record.message_count === 1 ? 'message' : 'messages'}</span><button className="history-id-copy" title={record.id} aria-label={`Copy conversation ID ${record.id}`} onClick={() => void copyId(record.id)}><code>{shortId(record.id)}</code><StudioIcon name="copy" size={13} /></button></div>
          </article>)}
        </div>
      </section>
      <section className="history-detail" aria-label="Saved transcript">
        {selected && !detailLoading && <header className="history-detail-heading"><div className="history-detail-agent"><span className="history-entry-avatar">{selected.agent_name.slice(0, 1)}</span><div><h3>{selected.agent_name}</h3><p>{new Date(selected.started_at).toLocaleString()}</p></div></div><span className={`history-mode ${selected.runtime_mode}`}>{selected.runtime_mode === 'demo' ? 'Demo preview' : 'Live model'}</span></header>}
        <div className="history-detail-body" key={selected?.id || 'empty'}>
          {detailLoading ? <div className="history-empty" role="status"><StudioIcon name="book" size={28} /><h3>Opening conversation…</h3></div> : !selected ? <div className="history-empty history-detail-empty"><span className="history-empty-icon"><StudioIcon name="book" size={30} /></span><span className="workflow-eyebrow">THE FULL PICTURE</span><h3>A conversation worth revisiting</h3><p>Select a conversation to read the transcript, listen to available audio and review what your agent did.</p><div className="history-empty-features"><span><StudioIcon name="book" size={15} />Transcript</span><span><StudioIcon name="voice" size={15} />Audio</span><span><StudioIcon name="sliders" size={15} />Tool activity</span></div></div> : <>
            <div className="history-detail-context"><span>Conversation</span><button className="history-id-copy" aria-label="Copy conversation ID" title={selected.id} onClick={() => void copyId(selected.id)}><code>{shortId(selected.id)}</code><StudioIcon name="copy" size={14} /></button>{selected.channel && <span className="history-channel">{selected.channel === 'widget' ? 'Website widget' : 'Playground'}</span>}</div>
            {selected.recording?.status === 'ready' ? <section className="history-audio" aria-label="Conversation recording"><div className="history-audio-heading"><StudioIcon name="voice" size={19} /><div><h4>Conversation audio</h4><p>{Math.round(selected.recording.duration || 0)} seconds · Private recording</p></div></div><audio key={selected.id} controls preload="none" src={`/api/conversations/history/${selected.id}/recording`} /><div className="history-audio-actions"><span>Retained for 30 days</span><a href={`/api/conversations/history/${selected.id}/recording`} download={`conversation-${selected.id}`}>Download audio</a><button disabled={deleting} onClick={() => void removeAudio()}>{deleting ? 'Deleting…' : 'Delete audio'}</button></div></section> : <p className="history-audio-note"><StudioIcon name="voice" size={16} />{selected.recording ? `Audio: ${selected.recording.status.replace(/_/g, ' ')}${selected.recording.status === 'pending' ? ' — not uploaded yet' : ''}` : 'Transcript only · No audio was saved for this conversation.'}</p>}
            <div className="history-transcript-title"><h4>Transcript</h4><span>{selected.messages.length} {selected.messages.length === 1 ? 'message' : 'messages'}</span></div>
            <div className="history-messages">{selected.messages.map((message, index) => <div className={`voice-message ${message.role}`} key={index}><div className="history-message-label"><strong>{message.role === 'user' ? 'You' : selected.agent_name}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></div><p>{message.text}</p></div>)}</div>
            {selected.turn_outcomes?.filter(turn => turn.status !== 'completed').map(turn => <div className="workflow-error" key={turn.id}><strong>{turn.status === 'interrupted' ? 'Interrupted turn' : 'Failed turn'}</strong><p>{turn.input}</p><p>{turn.output || 'No completed answer.'}</p></div>)}
            {selected.sources && selected.sources.length > 0 && <details className="history-inspect"><summary>Knowledge sources used</summary><p>{selected.sources.map(source => source.title).join(', ')}</p></details>}
            {selected.tool_events?.map((event, index) => <details className="history-inspect" key={index}><summary>Tool: {event.name} · {event.status}</summary><pre>{event.result}</pre></details>)}
            <details className="history-inspect"><summary>Conversation details</summary><dl><dt>Conversation ID</dt><dd>{selected.id}</dd><dt>Agent ID</dt><dd>{selected.agent_id}</dd><dt>Status</dt><dd>{selected.status}</dd>{selected.channel && <><dt>Channel</dt><dd>{selected.channel}</dd></>}{selected.origin && <><dt>Website</dt><dd>{selected.origin}</dd></>}</dl></details>
            {selected.configuration && <details className="history-inspect"><summary>Agent configuration used for this conversation</summary><pre>{JSON.stringify(selected.configuration, null, 2)}</pre></details>}
            <p className="history-private-note"><StudioIcon name="check" size={13} />Private to your workspace</p>
          </>}
        </div>
      </section>
    </div>
  </section>;
}
