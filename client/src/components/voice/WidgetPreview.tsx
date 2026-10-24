import { useEffect } from 'react';
export function WidgetPreview() {
  const deployment = window.location.pathname.split('/').pop();
  useEffect(() => {
    const script = document.createElement('script'); script.src = `/widget.js?deployment=${deployment}`; script.defer = true; document.body.appendChild(script);
    return () => { script.dispatchEvent(new Event('voiceai:dispose')); script.remove(); };
  }, [deployment]);
  return <main style={{ minHeight: '100dvh', background: '#f3f5f8', color: '#1a2d24', colorScheme: 'light', padding: 'clamp(28px,8vw,110px)', fontFamily: 'system-ui,sans-serif' }}><span style={{ letterSpacing: 2, fontSize: 12 }}>YOUR WEBSITE PREVIEW</span><h1 style={{ fontSize: 'clamp(32px,5vw,60px)', maxWidth: 700, lineHeight: 1.15, margin: '24px 0' }}>Meet your agent,<br />on a real page.</h1><p style={{ fontSize: 18, lineHeight: 1.8, maxWidth: 600 }}>Click <strong>Talk to our agent</strong> in the bottom-right corner. Open the microphone to speak, or type a question. Your agent replies in the widget.</p><p style={{ lineHeight: 1.8, margin: '22px 0', maxWidth: 600 }}>This is a local preview of the website widget. Browser speech needs Chrome or Edge. Your private workspace is not visible to widget visitors.</p><a href="/agents" style={{ color: '#285b40' }}>Back to your agent studio →</a></main>;
}
