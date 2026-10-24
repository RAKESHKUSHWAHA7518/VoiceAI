(() => {
  'use strict';
  const script = document.currentScript;
  if (!script) return;
  const source = new URL(script.src);
  const deployment = source.searchParams.get('deployment');
  if (!deployment || !/^[a-f0-9-]{36}$/.test(deployment)) return;
  if (document.querySelector(`[data-voiceai-deployment="${deployment}"]`)) return;
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = 'Talk to our agent';
  button.dataset.voiceaiDeployment = deployment;
  button.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483000;background:#6654d9;color:white;border:0;border-radius:28px;padding:16px 22px;font:600 14px system-ui;cursor:pointer;box-shadow:0 6px 25px #0003';
  button.setAttribute('aria-expanded', 'false');
  let frame = null; let starting = false;
  const receive = async event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== source.origin || event.data?.type !== 'voiceai:ready' || starting) return;
    starting = true;
    try {
      const response = await fetch(`${source.origin}/api/public/deployments/${deployment}/sessions`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'This widget is unavailable.');
      frame?.contentWindow?.postMessage({ type: 'voiceai:session', deployment, session: result }, source.origin);
    } catch (error) { frame?.contentWindow?.postMessage({ type: 'voiceai:error', message: error.message || 'Could not connect.' }, source.origin); }
  };
  window.addEventListener('message', receive);
  button.addEventListener('click', () => {
    if (frame) { frame.remove(); frame = null; starting = false; button.textContent = 'Talk to our agent'; button.setAttribute('aria-expanded', 'false'); return; }
    frame = document.createElement('iframe'); frame.title = 'VoiceAI agent conversation';
    frame.allow = 'microphone; autoplay';
    frame.src = `${source.origin}/widget/${deployment}?parentOrigin=${encodeURIComponent(location.origin)}`;
    frame.style.cssText = 'position:fixed;right:24px;bottom:88px;width:min(390px,calc(100vw - 32px));height:min(580px,calc(100dvh - 120px));border:1px solid #ddd;border-radius:18px;z-index:2147483000;background:white;box-shadow:0 15px 65px #0003';
    document.body.appendChild(frame); button.textContent = 'Close conversation'; button.setAttribute('aria-expanded', 'true');
  });
  document.body.appendChild(button);
  script.addEventListener('voiceai:dispose', () => { window.removeEventListener('message', receive); frame?.remove(); button.remove(); });
})();

