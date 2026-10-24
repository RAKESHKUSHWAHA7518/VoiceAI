#!/usr/bin/env node
// Measures authenticated text-stream processing. This is not an audio latency test.
const { performance } = require('node:perf_hooks');
const base = process.env.API_URL || 'http://127.0.0.1:8000';
const cookie = process.env.AUTH_COOKIE;
const agentId = process.env.AGENT_ID;
const turns = Number(process.env.BENCHMARK_TURNS || 10);
const percentile = (values, percent) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * percent / 100) - 1)] : null;
async function main() {
  if (!cookie || !agentId) throw new Error('Set AUTH_COOKIE and AGENT_ID for a signed-in account. Keep the cookie out of source control.');
  if (!Number.isInteger(turns) || turns < 1 || turns > 100) throw new Error('BENCHMARK_TURNS must be between 1 and 100.');
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  const opened = await fetch(`${base}/api/conversations`, { method: 'POST', headers, body: JSON.stringify({ agent_id: agentId }), signal: AbortSignal.timeout(15000) });
  const session = await opened.json();
  if (!opened.ok) throw new Error(session.error?.message || 'Could not create conversation.');
  const samples = []; let failures = 0;
  try {
    for (let index = 0; index < turns; index++) {
      const start = performance.now(); let first = null; let completed = false;
      try {
        const response = await fetch(`${base}/api/conversations/${session.session_id}/turn`, { method: 'POST', headers, body: JSON.stringify({ text: 'Describe what information you can help me with.' }), signal: AbortSignal.timeout(50000) });
        if (!response.ok || !response.body) throw new Error(`Turn HTTP ${response.status}`);
        const decoder = new TextDecoder(); let buffer = '';
        for await (const bytes of response.body) {
          buffer += decoder.decode(bytes, { stream: true });
          const lines = buffer.split('\n'); buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === 'error') throw new Error(event.code);
            if (event.type === 'delta' && first === null) first = performance.now() - start;
            if (event.type === 'complete') completed = true;
          }
        }
        if (!completed || first === null) throw new Error('Missing response text or completion event');
        samples.push({ first_delta_ms: first, complete_ms: performance.now() - start });
      } catch (error) { failures++; console.error(`Turn ${index + 1} failed: ${error.message}`); }
    }
  } finally { await fetch(`${base}/api/conversations/${session.session_id}`, { method: 'DELETE', headers }).catch(() => {}); }
  console.log(JSON.stringify({ measurement: 'authenticated text stream, not voice latency', runtime_mode: session.runtime_mode, requested_turns: turns, successes: samples.length, failures, failure_rate: failures / turns, first_delta_p50_ms: percentile(samples.map(sample => sample.first_delta_ms), 50), first_delta_p95_ms: percentile(samples.map(sample => sample.first_delta_ms), 95), completion_p95_ms: percentile(samples.map(sample => sample.complete_ms), 95), audible_latency_ms: null, samples }, null, 2));
  if (failures) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
