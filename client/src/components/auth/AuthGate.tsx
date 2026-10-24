import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import './auth.css';
import { LiveVoiceCallModal } from '../voice/LiveVoiceCallModal';
import { IconMic } from '../common/Icons';

interface User { id: string; name: string; email: string; workspace_id: string }
const AuthContext = createContext<{ user: User | null; logout: () => Promise<void> }>({ user: null, logout: async () => {} });
export const useAccount = () => useContext(AuthContext);
export const WORKSPACE_PAGES = new Set(['agents', 'knowledge', 'playground', 'analytics', 'campaigns', 'telephony', 'evals', 'hitl', 'monitor', 'inspector', 'reports', 'calendar', 'features']);
const demoAgent = { id: 'public-demo', name: 'Maya', role: 'Browser voice demo', avatar: '🎧', voice_id: 'browser', llm_model: 'demo', llm_temperature: .3, system_prompt: '', assigned_tools: [], greeting: 'Hello! Say hello to try your microphone.' };

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { signal: controller.signal }).then(async response => {
      if (response.ok) setUser((await response.json()).user);
      else if (response.status !== 401) setError('The server is unavailable. Please try again.');
    }).catch(err => { if (err.name !== 'AbortError') setError('Cannot reach the server. Check your connection.'); }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);
  const logout = async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok || response.status === 401) { setUser(null); setPassword(''); setMode('login'); setError(''); }
    else throw new Error('Could not sign out. Please try again.');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'signup') {
        const response = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'Could not create your account.');
      }
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Could not sign in.');
      setUser(result.user); setPassword('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  };
  if (checking) return <main className="auth-shell"><p role="status">Opening your workspace…</p></main>;
  if (user) return <AuthContext.Provider value={{ user, logout }}><div key={user.id}>{children}</div></AuthContext.Provider>;
  return <main className="auth-shell">
    <section className="auth-intro"><span className="auth-brand">VoiceAI studio</span><h1>Your next conversation starts here.</h1><p>Build a voice agent, give it knowledge and test how it responds. Your agents live in your own workspace.</p><button className="auth-voice-demo" onClick={() => setDemoOpen(true)}><IconMic size={24} /><span><strong>Try a voice conversation</strong><small>No account needed · Click, speak and hear a reply</small></span></button><div className="auth-example"><strong>Start with two example agents</strong><p>Customer support and travel concierge. Make them yours, or create an agent from scratch.</p></div></section>
    <section className="auth-card" aria-labelledby="auth-title"><p className="auth-eyebrow">YOUR WORKSPACE</p><h2 id="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p>{mode === 'signup' ? 'Start building with your own private agent library.' : 'Sign in to continue building your agents.'}</p>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Your name<input autoComplete="name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>}
        <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={10} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-help" /></label>
        <small id="password-help">Use at least 10 characters.</small>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      </form>
      <button className="auth-mode" type="button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </section>
    <LiveVoiceCallModal isOpen={demoOpen} onClose={() => setDemoOpen(false)} agent={demoAgent} demo />
  </main>;
}
