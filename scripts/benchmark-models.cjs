#!/usr/bin/env node
// Synthetic provider-only benchmark. Does not measure microphone, retrieval or audio.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { percentile } = require('./latency-report.cjs');

async function main() {
  const models = (process.env.BENCHMARK_MODELS || '').split(',').map(value => value.trim()).filter(Boolean);
  const repeats = Number(process.env.BENCHMARK_REPEATS || 2);
  if (!process.argv.includes('--live')) {
    console.log('Offline: no provider calls made. Build the backend, set BENCHMARK_MODELS=gemini/<enabled-model> (up to 3), then add --live to spend provider credits.');
    return;
  }
  if (!models.length || models.length > 3 || models.some(value => !/^(gemini|groq|openai)\/[A-Za-z0-9._:-]+$/.test(value))) throw Error('Specify 1–3 supported provider/model IDs.');
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw Error('BENCHMARK_REPEATS must be 1–3.');
  require('dotenv').config({ quiet: true });
  const { OpenAILLM } = require('../dist/server/src/services/llm.js');
  const { voiceRequestProfile } = require('../dist/server/src/services/voice_profile.js');
  const providers = {
    gemini: { key: process.env.GEMINI_API_KEY, url: 'https://generativelanguage.googleapis.com/v1beta/openai' },
    groq: { key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1' },
    openai: { key: process.env.OPENAI_API_KEY, url: undefined },
  };
  for (const id of models) if (!providers[id.split('/')[0]].key) throw Error('Missing server key for one of the selected providers.');
  const history = Array.from({ length: 10 }, (_, i) => [
    { role: 'user', content: `Support question ${i + 1}: How can I check my order?` },
    { role: 'assistant', content: 'Use your order number and the email address associated with the purchase. Ask support if the order status is unclear.' },
  ]).flat();
  const prompts = ['What information do you need to check an order?', 'Can you confirm my refund was issued without checking my account?'];
  const samples = [];
  for (const id of models) for (let run = 0; run < repeats; run++) for (const prompt of prompts) {
    // Alternate order to reduce a systematic baseline-first warmup advantage.
    for (const fast of run % 2 ? [true, false] : [false, true]) {
      const slash = id.indexOf('/'); const provider = providers[id.slice(0, slash)];
      const profile = voiceRequestProfile(history, fast);
      const llm = new OpenAILLM(provider.key, id.slice(slash + 1), 0.3, 512, provider.url);
      llm.setSystemPrompt('You are a customer support assistant. Never invent an order or refund status. ' + profile.instruction);
      const start = performance.now(); let first = null; let answer = '';
      try {
        for await (const chunk of llm.streamChat(profile.messages, prompt, undefined, undefined, AbortSignal.timeout(30000))) {
          if (chunk.content) { first ??= performance.now() - start; answer += chunk.content; }
        }
        if (!answer.trim()) throw Error('EMPTY_RESPONSE');
        samples.push({ model: id, profile: fast ? 'fast' : 'baseline', run, prompt, first_text_ms: first, complete_ms: performance.now() - start, context_chars: profile.chars, context_messages: profile.messages.length, answer, status: 'ok' });
      } catch (error) {
        // Store bounded classifications only; never serialize provider responses/credentials.
        const code = String(error?.message || 'ERROR');
        samples.push({ model: id, profile: fast ? 'fast' : 'baseline', run, prompt, status: 'error', error: /^PROVIDER_[A-Z_]+$|^EMPTY_RESPONSE$/.test(code) ? code : 'REQUEST_FAILED' });
      }
    }
  }
  const summary = models.flatMap(model => ['baseline', 'fast'].map(profile => {
    const rows = samples.filter(value => value.model === model && value.profile === profile);
    const good = rows.filter(value => value.status === 'ok');
    return { model, profile, successes: good.length, failures: rows.length - good.length, first_text_p50_ms: percentile(good.map(value => value.first_text_ms), 50), first_text_p95_ms: good.length >= 20 ? percentile(good.map(value => value.first_text_ms), 95) : null, p95_note: good.length < 20 ? 'Insufficient samples for a meaningful p95' : undefined };
  }));
  const output = path.resolve('.qa/model-latency.json'); fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ timestamp: new Date().toISOString(), scope: 'Synthetic text-only provider benchmark; manually review answers. Not a voice latency or tool-correctness benchmark.', samples, summary }, null, 2));
  console.log(JSON.stringify({ report: output, summary }, null, 2));
  if (samples.some(value => value.status === 'error')) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
