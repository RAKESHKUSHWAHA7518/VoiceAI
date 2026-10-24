import { useEffect, useRef, useState } from 'react';
import type { Agent } from '../../types';
interface Deployment { runtime_mode?: 'demo' | 'live'; id: string; version_id: string; active: boolean; allowed_origins: string[] }
export function DeploymentPanel({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [publicLive, setPublicLive] = useState(false); const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [deployments, setDeployments] = useState<Deployment[]>([]); const [origins, setOrigins] = useState('');
  const [includePreview, setIncludePreview] = useState(true); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [published, setPublished] = useState(false); const [copyStatus, setCopyStatus] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const load = async () => { const response = await fetch(`/api/agents/${agent.id}/deployments`); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || 'Could not load publishing settings.'); setDeployments(result.deployments); setPublicLive(result.public_live_enabled === true); };
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); void load().catch(err => setError(err.message)); return () => previous?.focus(); }, [agent.id]);
  const publish = async () => {
    setBusy(true); setError('');
    try {
      const allowed = origins.split(/[\n,]/).map(value => value.trim()).filter(Boolean); if (includePreview) allowed.push(window.location.origin);
      if (!allowed.length) throw new Error('Add your website address or enable the local preview.');
      const response = await fetch(`/api/agents/${agent.id}/publish`, { method: 'POST' }); const version = await response.json(); if (!response.ok) throw new Error(version.error?.message || 'Could not save a published version.');
      const deployed = await fetch(`/api/agents/${agent.id}/deployments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version_id: version.version.id, runtime_mode: mode, allowed_origins: [...new Set(allowed)] }) }); const result = await deployed.json(); if (!deployed.ok) throw new Error(result.error?.message || 'Could not create the widget.');
      await load(); setPublished(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Publishing failed.'); }
    finally { setBusy(false); }
  };
  return <div className="modal-overlay workflow-overlay"><div className="publish-shell" role="dialog" aria-modal="true" aria-labelledby="deploy-title" ref={dialog} onKeyDown={event => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input,a[href]') || []); const first = controls[0], last = controls[controls.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}>
    <header className="workflow-header"><div><span className="workflow-eyebrow">PUBLISH YOUR AGENT</span><h2 id="deploy-title">Put {agent.name} on your website</h2><p>Save a version, try the widget, then copy one line into your website.</p></div><button className="workflow-close" aria-label="Close publishing" disabled={busy} onClick={onClose}>×</button></header>
    <div className="publish-body"><div className="publish-steps"><div className={!published ? 'is-current' : ''}><b>1</b>Choose a website</div><div className={!published ? 'is-current' : ''}><b>2</b>Publish a version</div><div className={published ? 'is-current' : ''}><b>3</b>Preview and embed</div></div>
      <p>A published version keeps these saved agent instructions. You can edit the draft later without changing the existing widget. Knowledge documents stay linked to the agent.</p>
<label className="publish-field-label" htmlFor="widget-runtime">Widget response mode</label><select id="widget-runtime" className="form-select" value={mode} onChange={event => setMode(event.target.value as 'demo' | 'live')}><option value="demo">Free demo preview — no model credits</option><option value="live" disabled={!publicLive}>Live AI — uses provider credits{!publicLive ? ' (server access disabled)' : ''}</option></select>{!publicLive && <p className="feature-notice">Public live AI is disabled to protect provider credits. Demo widgets still work. To offer live answers, explicitly enable public live access on your server first.</p>}
      <label className="publish-field-label" htmlFor="allowed-origins">Where will the widget appear?</label><textarea id="allowed-origins" className="form-input" rows={2} value={origins} onChange={event => setOrigins(event.target.value)} placeholder={'https://your-website.com\nhttps://www.your-website.com'} /><small>Use your website's address without a page path. Add each address on a new line.</small>
      <label className="voice-auto"><input type="checkbox" checked={includePreview} onChange={event => setIncludePreview(event.target.checked)} /> Also allow a preview on this device ({window.location.origin})</label>
      <div className="publish-guide"><strong>Just testing? You don't need a website yet.</strong><p>Leave the address blank, keep local preview enabled, and click Publish agent. Then choose Open widget preview to test the chat and microphone.</p><p>To share with other people later, host this app on a public HTTPS address first. A 127.0.0.1 link only works on this computer.</p></div>
      {error && <p className="workflow-error" role="alert">{error}</p>}
      {published && <p className="publish-success" role="status">Your {mode === 'demo' ? 'demo preview' : 'live AI'} widget is published. Open its preview below, or copy its embed code.</p>}
      <button className="btn btn-primary" disabled={busy || (!includePreview && !origins.trim())} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish agent'}</button>
      {deployments.map(deployment => {
        const code = `<script src="${window.location.origin}/widget.js?deployment=${deployment.id}" defer></script>`;
        return <section key={deployment.id} className="published-widget"><h3>{deployment.active ? 'Active website widget' : 'Disabled widget'}</h3><p>{deployment.runtime_mode === 'live' ? 'Live AI · uses provider credits' : 'Free demo preview'} · Allowed websites: {deployment.allowed_origins.join(', ')}</p>
          {deployment.active && deployment.allowed_origins.includes(window.location.origin) && <div className="publish-actions"><a className="btn btn-primary" href={`/preview/${deployment.id}`} target="_blank" rel="noreferrer">Open widget preview ↗</a></div>}
          <label className="publish-field-label">Website embed code<textarea className="form-input" readOnly rows={3} value={code} onFocus={event => event.target.select()} /></label><small>Paste this before the closing &lt;/body&gt; tag, or into your website builder's custom code block.</small>
          <div className="publish-actions"><button className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopyStatus('Embed code copied.'); } catch { setCopyStatus('Select the code above and copy it manually.'); } }}>Copy embed code</button><button className="btn btn-secondary" disabled={!deployment.active || busy} onClick={async () => { setBusy(true); setError(''); try { const response = await fetch(`/api/agents/${agent.id}/deployments/${deployment.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Could not disable widget.'); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'Disable failed.'); } finally { setBusy(false); } }}>Disable widget</button></div>
        </section>;
      })}{copyStatus && <p role="status">{copyStatus}</p>}
      <details className="editor-advanced"><summary>Preview limits</summary><p>Each guest preview lasts ten minutes and supports ten messages. Demo session limits reset when the server restarts. External actions are disabled.</p></details>
    </div>
    <footer className="workflow-footer"><p>Publishing here creates an app version and widget. Public website hosting is a separate step.</p><button className="btn btn-secondary" disabled={busy} onClick={onClose}>Done</button></footer>
  </div></div>;
}
