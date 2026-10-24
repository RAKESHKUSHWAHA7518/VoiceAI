import { Link } from 'react-router-dom';
const features = [
  ['Accounts and two starter agents', 'Available', '/agents', 'Private ownership, sign-in and saved agents.'],
  ['Create, edit and delete agents', 'Available', '/agents', 'Three-step builder and preserved configuration fields.'],
  ['Voice library and language selection', 'Available', '/agents', 'Preset selection; current spoken output uses browser voices.'],
  ['Knowledge uploads and retrieval', 'Available', '/knowledge', 'Documents belong to your agent and workspace.'],
  ['Text playground and demo/live modes', 'Available', '/playground', 'Demo is free; live generation requires configured credentials.'],
  ['Continuous conversation and interruption', 'Browser acceptance pending', '/playground', 'Start once; real Chrome/Edge microphone testing remains pending.'],
  ['Publish versions and website widget', 'Local preview available', '/agents', 'Allowed domains, scoped visitor tokens and revocation. Public hosting remains separate.'],
  ['Conversation history and export', 'Available', '/history', 'Private saved transcripts; export from analytics or inspector.'],
  ['Analytics and session monitoring', 'Available', '/analytics', 'Actual saved counts and server sessions; no fabricated audio timing.'],
  ['Campaigns and CSV leads', 'Workspace simulation', '/campaigns', 'Create, import, start/pause/reset, dispositions and delete. Does not call contacts. Demo state resets after server restart.'],
  ['Phone registry, reassignment and dialpad', 'Workspace simulation', '/telephony', 'Saved private number registry; outbound/inbound and DTMF are demonstrations. No carrier request.'],
  ['Evaluations and scorecards', 'Workspace simulation', '/evals', 'Original test suites and example scorecards. Not a live evaluation of model quality. State resets after server restart.'],
  ['Human handoff and copilot', 'Workspace simulation', '/hitl', 'Whisper, takeover, handback and transfer state changes. No human audio bridge. State resets after server restart.'],
  ['Appointments and calendar', 'Available', '/calendar', 'Manual private bookings, conflict checks and cancellation. Agent-driven booking is not connected.'],
  ['Inspector and mock tools', 'Available', '/inspector', 'Saved JSON fixtures, mock execution and private transcript inspection.'],
  ['External webhook tools and live tool execution', 'Integration pending', '/inspector', 'Legacy source retained. Requires scoped permissions and runtime integration.'],
  ['Role, vault and encryption showcase', 'Legacy source retained', '/inspector', 'Old demonstrations are not production identity, key management or compliance evidence.'],
  ['Voice cloning and provider audio', 'Integration pending', '/agents', 'Legacy implementation retained; no sample recording upload or provider activation.'],
  ['Session rewind and streaming audio waterfall', 'Legacy source retained', '/inspector', 'Legacy simulator retained; not connected to private browser conversations.'],
  ['SIP, carrier calls and external telemetry', 'Integration pending', '/telephony', 'Requires separate provider setup and real-call validation. No purchase or cloud audio upload was made.'],
];
export function FeatureRegister() {
  return <section className="conversation-history-page"><div className="workflow-page-heading"><div><span className="workflow-eyebrow">FEATURE PRESERVATION</span><h2>All platform features</h2><p>Previous workflows are tracked here alongside the current voice studio. Nothing listed here should be silently removed when another feature changes.</p></div></div><div className="feature-grid">{features.map(([name, status, href, note]) => <article className="restored-card" key={name}><span className="history-mode">{status}</span><h3>{name}</h3><p>{note}</p><Link to={href}>Open workspace →</Link></article>)}</div></section>;
}
