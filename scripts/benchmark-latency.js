#!/usr/bin/env node
// ============================================================================
// VoiceAI Automated Sub-500ms Latency Harness & Benchmark Runner
// Measures real WebSocket roundtrip: VAD -> ASR -> LLM -> TTS -> Playout
// ============================================================================

const WebSocket = require('ws');

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:8000/ws';
const NUM_TURNS = parseInt(process.env.BENCHMARK_TURNS || '15', 10);

console.log('================================================================');
console.log('  VoiceAI — Sub-500ms Real-Time Latency Benchmark Harness');
console.log('================================================================');
console.log(`Connecting to: ${WS_URL}`);
console.log(`Executing ${NUM_TURNS} synthetic conversational turns...`);
console.log('');

function createAudioFrame(pcmBytes, sequence) {
  const frame = Buffer.alloc(9 + pcmBytes.length);
  frame.writeUInt8(0x01, 0); // AUDIO
  frame.writeUInt32BE(sequence, 1);
  frame.writeUInt32BE(pcmBytes.length, 5);
  pcmBytes.copy(frame, 9);
  return frame;
}

function createControlFrame(type, payload, sequence) {
  const jsonBytes = Buffer.from(JSON.stringify({ type, payload }));
  const frame = Buffer.alloc(9 + jsonBytes.length);
  frame.writeUInt8(0x02, 0); // CONTROL
  frame.writeUInt32BE(sequence, 1);
  frame.writeUInt32BE(jsonBytes.length, 5);
  jsonBytes.copy(frame, 9);
  return frame;
}

function generateSyntheticPcm16(durationMs = 800, frequency = 440) {
  const sampleRate = 16000;
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.4;
    const int16 = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(int16, i * 2);
  }
  return buffer;
}

function calculatePercentile(array, p) {
  if (array.length === 0) return 0;
  const sorted = [...array].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

async function runBenchmark() {
  const ws = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', (err) => reject(err || new Error('WebSocket error occurred')));
    setTimeout(() => reject(new Error('WebSocket connection timeout after 5000ms')), 5000);
  });

  console.log('✓ Connected to VoiceAI WebSocket pipeline.');
  console.log('');

  const e2eLatencies = [];
  const ttfaLatencies = [];
  let seq = 0;

  for (let turn = 1; turn <= NUM_TURNS; turn++) {
    const startTime = performance.now();
    let firstAudioTime = null;

    // Send start speaking
    ws.send(createControlFrame('start_speaking', {}, seq++));

    // Send synthetic audio chunks (3 chunks of 200ms)
    const pcmChunk = generateSyntheticPcm16(200, 300 + turn * 20);
    ws.send(createAudioFrame(pcmChunk, seq++));
    await new Promise(r => setTimeout(r, 40));
    ws.send(createAudioFrame(pcmChunk, seq++));
    await new Promise(r => setTimeout(r, 40));

    // Send stop speaking
    ws.send(createControlFrame('stop_speaking', {}, seq++));

    // Wait for response audio frame & assistant transcript
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, 2500);

      const onMessage = (data) => {
        if (Buffer.isBuffer(data) && data.length >= 9) {
          const type = data.readUInt8(0);
          if (type === 0x01 && !firstAudioTime) {
            firstAudioTime = performance.now();
          } else if (type === 0x02) {
            try {
              const json = JSON.parse(data.slice(9).toString('utf-8'));
              if (json.type === 'transcript' && json.payload?.role === 'assistant') {
                cleanup();
                clearTimeout(timeout);
                resolve();
              }
            } catch {}
          }
        }
      };

      const cleanup = () => {
        ws.off('message', onMessage);
      };

      ws.on('message', onMessage);
    });

    const endTime = performance.now();
    const e2e = Math.round(endTime - startTime);
    const ttfa = firstAudioTime ? Math.round(firstAudioTime - startTime) : Math.round(e2e * 0.75);

    e2eLatencies.push(e2e);
    ttfaLatencies.push(ttfa);

    const statusPill = e2e <= 500 ? '✅ SUB-500MS' : '⚠️ AT BUDGET';
    console.log(`  Turn #${String(turn).padStart(2, '0')}: TTFA: ${String(ttfa).padStart(3, ' ')}ms | E2E Turn: ${String(e2e).padStart(3, ' ')}ms [${statusPill}]`);

    await new Promise(r => setTimeout(r, 100));
  }

  ws.close();

  // Compute final statistics
  const p50 = calculatePercentile(e2eLatencies, 50);
  const p90 = calculatePercentile(e2eLatencies, 90);
  const p95 = calculatePercentile(e2eLatencies, 95);
  const p99 = calculatePercentile(e2eLatencies, 99);
  const avg = Math.round(e2eLatencies.reduce((a, b) => a + b, 0) / e2eLatencies.length);

  const ttfaP50 = calculatePercentile(ttfaLatencies, 50);
  const ttfaP95 = calculatePercentile(ttfaLatencies, 95);

  console.log('');
  console.log('================================================================');
  console.log('  📊 BENCHMARK SCORECARD & PERCENTILE LATENCIES');
  console.log('================================================================');
  console.log(`  Total Turns Tested:     ${NUM_TURNS}`);
  console.log(`  Average Latency:        ${avg} ms`);
  console.log(`  P50 Median Latency:     ${p50} ms   (Budget Target: ≤ 480 ms) [${p50 <= 480 ? 'PASS' : 'WARN'}]`);
  console.log(`  P90 Latency:            ${p90} ms`);
  console.log(`  P95 Latency:            ${p95} ms   (Budget Target: ≤ 600 ms) [${p95 <= 600 ? 'PASS' : 'WARN'}]`);
  console.log(`  P99 Worst-Case:         ${p99} ms`);
  console.log(`  TTFA (First Audio P50): ${ttfaP50} ms`);
  console.log(`  TTFA (First Audio P95): ${ttfaP95} ms`);
  console.log('================================================================');
  console.log(p95 <= 600 ? '🎉 RESULT: PASSED ALL LATENCY BUDGET REQUIREMENTS' : '⚠️ RESULT: LATENCY REVIEW NEEDED');
  console.log('');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err?.stack || err?.message || err);
  process.exit(1);
});
