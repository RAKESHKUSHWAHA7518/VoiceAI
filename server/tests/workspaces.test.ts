import { Readable, PassThrough } from 'stream';
import axios from 'axios';
import express from 'express';
import request from 'supertest';

const mockFiles = new Map<string, string>();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const privateFile = (file: unknown) => /[\\/]data[\\/](accounts|agents|agent_versions|deployments|conversation_history|workspace_tools|recordings)\.json$/.test(String(file));
  return { ...actual,
    existsSync: (file: unknown) => privateFile(file) ? mockFiles.has(String(file)) : actual.existsSync(file),
    readFileSync: (file: unknown, ...args: unknown[]) => privateFile(file) ? mockFiles.get(String(file)) : actual.readFileSync(file, ...args),
    writeFileSync: (file: unknown, data: string, ...args: unknown[]) => privateFile(file) ? mockFiles.set(String(file), data) : actual.writeFileSync(file, data, ...args),
  };
});

import auth from '../src/routes/auth';
import agents from '../src/routes/agents';
import knowledge from '../src/routes/knowledge';
import { platformAccess } from '../src/middleware/platformAccess';
import { errorHandler } from '../src/middleware/errorHandler';
import { accountForToken } from '../src/services/accounts';
import conversations from '../src/routes/conversations';
import { findConversation, conversationTurn } from '../src/services/conversations';
import { speechSegments } from '../../shared/speechSegments';
import speechRoutes from '../src/routes/speech';
import publicRoutes from '../src/routes/public';
import workspaceTools, { privatePhoneRouter, privateCalendarRouter } from '../src/routes/workspace_tools';
import campaigns from '../src/routes/campaigns';
import handoff from '../src/routes/hitl';
import evals from '../src/routes/evals';

const app = express();
app.use(express.json());
app.use('/api/auth', auth);
app.use('/api/public', publicRoutes);
app.use('/api', platformAccess);
app.use('/api/conversations', conversations);
app.use('/api/conversations', speechRoutes);
app.use('/api/agents', agents);
app.use('/api/knowledge', knowledge);
app.use('/api/workspace-tools', workspaceTools);
app.use('/api/telephony', privatePhoneRouter);
app.use('/api/calendar', privateCalendarRouter);
app.use('/api/campaigns', campaigns);
app.use('/api/hitl', handoff);
app.use('/api/evals', evals);
app.use(errorHandler);
beforeAll(() => { process.env.VOICEAI_LEGACY_DEMO = 'false'; });

async function register(email: string) {
  await request(app).post('/api/auth/signup').send({ name: 'Workspace tester', email, password: 'correct horse battery' }).expect(201);
  const login = await request(app).post('/api/auth/login').send({ email, password: 'correct horse battery' }).expect(200);
  return { cookie: login.headers['set-cookie'][0].split(';')[0], user: login.body.user };
}

test('signs up with hashed passwords and a revocable HttpOnly session', async () => {
  const alice = await register('alice@example.test');
  expect(alice.user.password_hash).toBeUndefined();
  const storage = [...mockFiles.entries()].find(([name]) => name.endsWith('accounts.json'))![1];
  expect(storage).not.toContain('correct horse battery');
  expect(storage).not.toContain(alice.cookie.split('=')[1]);
  expect(accountForToken(alice.cookie.split('=')[1])?.id).toBe(alice.user.id);
  await request(app).get('/api/auth/me').set('Cookie', alice.cookie).expect(200);
  await request(app).post('/api/auth/logout').set('Cookie', alice.cookie).expect(200);
  await request(app).get('/api/auth/me').set('Cookie', alice.cookie).expect(401);
});

test('isolates two users and refuses forged agent ownership', async () => {
  const alice = await register('owner-a@example.test');
  const bob = await register('owner-b@example.test');
  const first = (await request(app).get('/api/agents').set('Cookie', alice.cookie).expect(200)).body.agents;
  const second = (await request(app).get('/api/agents').set('Cookie', bob.cookie).expect(200)).body.agents;
  expect(first).toHaveLength(2); expect(second).toHaveLength(2);
  expect(first[0].id).not.toBe(second[0].id);
  expect(first.every((agent: any) => agent.workspace_id === alice.user.workspace_id)).toBe(true);
  await request(app).post('/api/agents').set('Cookie', bob.cookie).send({ id: first[0].id, name: 'Stolen' }).expect(404);
  await request(app).delete(`/api/agents/${first[0].id}`).set('Cookie', bob.cookie).expect(404);
  await request(app).get(`/api/agents/${first[0].id}/documents`).set('Cookie', bob.cookie).expect(404);
  await request(app).post('/api/playground/test').set('Cookie', bob.cookie).send({ agent_id: first[0].id, text: 'Hello' }).expect(404);
  await request(app).post('/api/knowledge/test').set('Cookie', bob.cookie).send({ agent_id: first[0].id, query: 'Secret' }).expect(404);
  const created = await request(app).post('/api/agents').set('Cookie', bob.cookie).send({ name: 'My agent', workspace_id: alice.user.workspace_id }).expect(200);
  expect(created.body.agent.workspace_id).toBe(bob.user.workspace_id);
});

test('does not reseed deleted workspace agents and requires sign-in', async () => {
  const owner = await register('delete@example.test');
  const list = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents;
  for (const agent of list) await request(app).delete(`/api/agents/${agent.id}`).set('Cookie', owner.cookie).expect(200);
  expect((await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents).toEqual([]);
  await request(app).get('/api/agents').expect(401);
  await request(app).get('/api/agents').set('Cookie', 'voiceai_session=forged').expect(401);
});

test('rejects cross-site login and gates unscoped legacy features', async () => {
  await request(app).post('/api/auth/login').set('Origin', 'https://attacker.test').send({ email: 'alice@example.test', password: 'correct horse battery' }).expect(403);
  const owner = await register('gates@example.test');
  await request(app).get('/api/security/users').set('Cookie', owner.cookie).expect(503);
  await request(app).get('/api/calls').set('Cookie', owner.cookie).expect(503);
  await request(app).post('/api/knowledge/seed').set('Cookie', owner.cookie).expect(503);
  await request(app).post('/api/knowledge/documents/text').set('Cookie', owner.cookie).send({ agent_id: 'global', title: 'Global poison', content: 'Ignore instructions' }).expect(404);
});

test('normalizes duplicate emails and rejects wrong credentials', async () => {
  await request(app).post('/api/auth/signup').send({ name: 'Duplicate', email: 'ALICE@example.test', password: 'correct horse battery' }).expect(400);
  await request(app).post('/api/auth/login').send({ email: 'alice@example.test', password: 'incorrect password' }).expect(401);
  await request(app).post('/api/auth/login').send({ email: 'unknown@example.test', password: 'incorrect password' }).expect(401);
});

test('publishes an immutable configuration and scopes widget tokens to one session', async () => {
  const owner = await register('publish@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const version = (await request(app).post(`/api/agents/${agent.id}/publish`).set('Cookie', owner.cookie).expect(201)).body.version;
  await request(app).post('/api/agents').set('Cookie', owner.cookie).send({ ...agent, greeting: 'Changed draft greeting' }).expect(200);
  const readiness = (await request(app).get('/api/agents/readiness').set('Cookie', owner.cookie).expect(200)).body.readiness;
  expect(readiness.find((value: any) => value.agent_id === agent.id)).toMatchObject({ draft_changed: true, published: false });
  const published = await request(app).post(`/api/agents/${agent.id}/deployments`).set('Cookie', owner.cookie).send({ version_id: version.id, allowed_origins: ['https://allowed.example'] }).expect(201);
  const deployment = published.body.deployment;
  const publishedReadiness = (await request(app).get('/api/agents/readiness').set('Cookie', owner.cookie).expect(200)).body.readiness;
  expect(publishedReadiness.find((value: any) => value.agent_id === agent.id)).toMatchObject({ published: true, active_widgets: 1 });
  await request(app).post(`/api/public/deployments/${deployment.id}/sessions`).set('Origin', 'https://evil.example').expect(403);
  const guest = (await request(app).post(`/api/public/deployments/${deployment.id}/sessions`).set('Origin', 'https://allowed.example').expect(201)).body;
  expect(guest.greeting).toBe(version.snapshot.greeting);
  expect(guest.greeting).not.toBe('Changed draft greeting');
  expect(guest.system_prompt).toBeUndefined();
  await request(app).post(`/api/public/sessions/${guest.session_id}/turn`).send({ text: 'Hello' }).expect(401);
  const turn = await request(app).post(`/api/public/sessions/${guest.session_id}/turn`).set('Authorization', `Bearer ${guest.token}`).send({ text: 'Hello' }).expect(200);
  const events = turn.text.trim().split('\n').map((line: string) => JSON.parse(line));
  expect(events.at(-1)).toMatchObject({ type: 'complete', runtime_mode: 'demo' });
  const other = (await request(app).post(`/api/public/deployments/${deployment.id}/sessions`).set('Origin', 'https://allowed.example').expect(201)).body;
  await request(app).post(`/api/public/sessions/${other.session_id}/turn`).set('Authorization', `Bearer ${guest.token}`).send({ text: 'Hello' }).expect(401);
  await request(app).delete(`/api/agents/${agent.id}/deployments/${deployment.id}`).set('Cookie', owner.cookie).expect(200);
  await request(app).post(`/api/public/sessions/${guest.session_id}/turn`).set('Authorization', `Bearer ${guest.token}`).send({ text: 'Hello' }).expect(401);
});

test('denies cross-workspace conversation access and unsafe widget origins', async () => {
  const owner = await register('session-owner@example.test');
  const other = await register('session-other@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const session = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({ agent_id: agent.id }).expect(201)).body;
  await request(app).post(`/api/conversations/${session.session_id}/turn`).set('Cookie', other.cookie).send({ text: 'Private' }).expect(404);
  const version = (await request(app).post(`/api/agents/${agent.id}/publish`).set('Cookie', owner.cookie).expect(201)).body.version;
  await request(app).post(`/api/agents/${agent.id}/deployments`).set('Cookie', owner.cookie).send({ version_id: version.id, allowed_origins: ['http://unsafe.example'] }).expect(400);
  await request(app).post(`/api/agents/${agent.id}/deployments`).set('Cookie', owner.cookie).send({ version_id: version.id, allowed_origins: ['https://safe.example/path'] }).expect(400);
  await request(app).post(`/api/agents/${agent.id}/deployments`).set('Cookie', other.cookie).send({ version_id: version.id, allowed_origins: ['https://safe.example'] }).expect(404);
  await request(app).delete(`/api/conversations/${session.session_id}`).set('Cookie', owner.cookie).expect(200);
  await request(app).post(`/api/conversations/${session.session_id}/turn`).set('Cookie', owner.cookie).send({ text: 'Expired' }).expect(404);
});

test('saves private transcripts and keeps history isolated between accounts', async () => {
  const owner = await register('history-owner@example.test');
  const other = await register('history-other@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const session = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({ agent_id: agent.id }).expect(201)).body;
  await request(app).post(`/api/conversations/${session.session_id}/turn`).set('Cookie', owner.cookie).send({ text: 'Hello history' }).expect(200);
  const list = (await request(app).get('/api/conversations/history').set('Cookie', owner.cookie).expect(200)).body.conversations;
  expect(list).toHaveLength(1);
  expect(list[0].preview).toBe('Hello history');
  const detail = (await request(app).get(`/api/conversations/history/${session.session_id}`).set('Cookie', owner.cookie).expect(200)).body.conversation;
  expect(detail.configuration.id).toBe(agent.id);
  expect(detail.turn_outcomes[0]).toMatchObject({ status: 'completed', input: 'Hello history' });
  expect(detail.messages.some((message: any) => message.text === 'Hello history')).toBe(true);
  await request(app).get(`/api/conversations/history/${session.session_id}`).set('Cookie', other.cookie).expect(404);
  expect((await request(app).get('/api/conversations/history').set('Cookie', other.cookie)).body.conversations).toEqual([]);
  await request(app).get('/api/conversations/history').expect(401);
});

test('provides an account-free demo with a scoped guest token', async () => {
  const guest = (await request(app).post('/api/public/demo').expect(201)).body;
  expect(guest.runtime_mode).toBe('demo');
  const turn = await request(app).post(`/api/public/sessions/${guest.session_id}/turn`).set('Authorization', `Bearer ${guest.token}`).send({ text: 'Hello' }).expect(200);
  expect(turn.text).toContain('complete');
  await request(app).post(`/api/public/sessions/${guest.session_id}/turn`).send({ text: 'Hello' }).expect(401);
});

test('restored showcase workflows keep created records within their workspace', async () => {
  const owner = await register('restored-owner@example.test');
  const other = await register('restored-other@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const campaign = (await request(app).post('/api/campaigns').set('Cookie', owner.cookie).send({ name: 'Private campaign', agent_id: agent.id, contacts: [] }).expect(201)).body.campaign;
  await request(app).get(`/api/campaigns/${campaign.id}`).set('Cookie', other.cookie).expect(404);
  await request(app).post('/api/campaigns').set('Cookie', other.cookie).send({ name: 'Forged owner', agent_id: agent.id }).expect(404);
  const call = (await request(app).post('/api/hitl/calls').set('Cookie', owner.cookie).send({ agent_id: agent.id, agent_name: agent.name, caller_name: 'Private sample' }).expect(201)).body.call;
  await request(app).get(`/api/hitl/calls/${call.id}`).set('Cookie', other.cookie).expect(404);
  const suite = (await request(app).get('/api/evals/suites').set('Cookie', owner.cookie).expect(200)).body.suites[0];
  const run = (await request(app).post('/api/evals/run').set('Cookie', owner.cookie).send({ agent_id: agent.id, suite_id: suite.id }).expect(201)).body.run;
  await request(app).get(`/api/evals/runs/${run.id}`).set('Cookie', other.cookie).expect(404);
});

test('phone registry and mock tools persist privately without external execution', async () => {
  const owner = await register('tools-owner@example.test');
  const other = await register('tools-other@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const number = (await request(app).post('/api/telephony/numbers').set('Cookie', owner.cookie).send({ phone_number: '+15550101010', agent_id: agent.id, friendly_name: 'Private test line' }).expect(201)).body.number;
  expect((await request(app).get('/api/telephony/numbers').set('Cookie', other.cookie)).body.numbers).toEqual([]);
  await request(app).put(`/api/telephony/numbers/${number.id}`).set('Cookie', other.cookie).send({ status: 'active' }).expect(404);
  const tool = (await request(app).post('/api/workspace-tools').set('Cookie', owner.cookie).send({ kind: 'tool', name: 'Fixture', agent_id: agent.id, value: '{"ok":true}' }).expect(201)).body.record;
  const result = (await request(app).post(`/api/workspace-tools/${tool.id}/test`).set('Cookie', owner.cookie).expect(200)).body;
  expect(result).toMatchObject({ result: { ok: true }, external_request: false });
  await request(app).post(`/api/workspace-tools/${tool.id}/test`).set('Cookie', other.cookie).expect(404);
  await request(app).post('/api/workspace-tools').set('Cookie', owner.cookie).send({ kind: 'tool', name: 'Bad JSON', agent_id: agent.id, value: '{' }).expect(400);
  const outbound = (await request(app).post('/api/telephony/outbound').set('Cookie', owner.cookie).send({ agent_id: agent.id, to_phone_number: '+15550101010' }).expect(200)).body;
  expect(outbound.mode).toBe('simulation'); expect(outbound.call_sid).toMatch(/^DEMO_/);
});

test('calendar prevents same-workspace double bookings and isolates cancellation', async () => {
  const owner = await register('calendar-owner@example.test');
  const other = await register('calendar-other@example.test');
  const body = { customer_name: 'Local tester', date: 'tomorrow', time: '09:00 AM' };
  const appointment = (await request(app).post('/api/calendar/book').set('Cookie', owner.cookie).send(body).expect(201)).body.appointment;
  await request(app).post('/api/calendar/book').set('Cookie', owner.cookie).send(body).expect(409);
  await request(app).post('/api/calendar/book').set('Cookie', other.cookie).send(body).expect(201);
  await request(app).delete(`/api/calendar/appointments/${appointment.id}`).set('Cookie', other.cookie).expect(404);
  const monitor = (await request(app).get('/api/workspace-tools/monitor').set('Cookie', owner.cookie).expect(200)).body;
  expect(monitor.audio_metrics_available).toBe(false);
  await request(app).get('/api/workspace-tools/monitor').expect(401);
});

test('a credential lockout never prevents an authenticated logout', async () => {
  const owner = await register('logout-limit@example.test');
  const mainApp = require('../src/app').default;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await request(mainApp).post('/api/auth/login').send({ email: 'missing-limit@example.test', password: 'incorrect password' });
    expect([401, 429]).toContain(response.status);
  }
  await request(mainApp).post('/api/auth/login').send({ email: 'missing-limit@example.test', password: 'incorrect password' }).expect(429);
  await request(mainApp).post('/api/auth/logout').set('Cookie', owner.cookie).expect(200);
  await request(mainApp).get('/api/auth/me').set('Cookie', owner.cookie).expect(401);
});


test('failed provider turns retain tested configuration and outcome in private history', async () => {
 const owner = await register('failed-turn-owner@example.test');
 const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const config = require('../src/config').default; const previousKey = config.apiKeys.openai;
 process.env.VOICEAI_RUNTIME_MODE = 'live'; config.apiKeys.openai = '';
 try {
  const session = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({ agent_id: agent.id }).expect(201)).body;
  const reply = await request(app).post('/api/conversations/' + session.session_id + '/turn').set('Cookie', owner.cookie).send({ text: 'Provider failure test' }).expect(200);
  expect(reply.text).toContain('PROVIDER_NOT_CONFIGURED');
  const detail = (await request(app).get('/api/conversations/history/' + session.session_id).set('Cookie', owner.cookie).expect(200)).body.conversation;
  expect(detail.configuration.id).toBe(agent.id); expect(detail.turn_outcomes[0]).toMatchObject({ input: 'Provider failure test', status: 'error' });
  await request(app).delete('/api/conversations/' + session.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { process.env.VOICEAI_RUNTIME_MODE = 'demo'; config.apiKeys.openai = previousKey; }
});

test('cloud speech stays private, validates reply text and never returns provider keys', async () => {
 const owner = await register('cloud-speech-owner@example.test'); const other = await register('cloud-speech-other@example.test');
 const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const config = require('../src/config').default; const old = { mode: process.env.VOICEAI_SPEECH_MODE, deepgram: config.apiKeys.deepgram, cartesia: config.apiKeys.cartesia };
 process.env.VOICEAI_SPEECH_MODE = 'cloud'; config.apiKeys.deepgram = 'secret-deepgram'; config.apiKeys.cartesia = 'secret-cartesia';
 const post = jest.spyOn(axios, 'post').mockImplementation(async () => ({ data: Readable.from([Buffer.from('RIFF-test-audio')]) }));
 try {
  const session = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({ agent_id: agent.id }).expect(201)).body;
  expect(session.speech_output).toBe('cloud');
  await request(app).post('/api/conversations/' + session.session_id + '/speech-ticket').expect(401);
  await request(app).post('/api/conversations/' + session.session_id + '/speech-ticket').set('Cookie', other.cookie).expect(404);
  const ticket = (await request(app).post('/api/conversations/' + session.session_id + '/speech-ticket').set('Cookie', owner.cookie).expect(200)).body;
  expect(ticket.ticket).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(ticket)).not.toContain('secret-deepgram');
  await request(app).post('/api/conversations/' + session.session_id + '/speak').set('Cookie', owner.cookie).send({ text: 'arbitrary' }).expect(400);
  expect(post).not.toHaveBeenCalled();
  await request(app).post('/api/conversations/' + session.session_id + '/speak').set('Cookie', owner.cookie).send({ text: agent.greeting }).expect(200).expect('Content-Type', /audio\/wav/);
  expect(post.mock.calls[0][1]).toMatchObject({ transcript: agent.greeting, voice: agent.voice_id });
  const upstream = new PassThrough(); let firstBeforeEnd = false;
  post.mockImplementationOnce(async () => { setTimeout(() => upstream.write(Buffer.from([0, 0, 0, 1])), 30); return { data: upstream }; });
  const safety = setTimeout(() => upstream.destroy(new Error('Test stream did not drain')), 3000);
  try {
   await request(app).post('/api/conversations/' + session.session_id + '/speak').set('Cookie', owner.cookie).send({ text: agent.greeting, audio_format: 'pcm' })
    .buffer(true).parse((response, callback) => {
     const chunks: Buffer[] = [];
     response.on('data', chunk => { firstBeforeEnd = !upstream.writableEnded; chunks.push(chunk); upstream.end(); });
     response.on('end', () => callback(null, Buffer.concat(chunks))); response.on('error', callback);
    }).expect(200).expect('Content-Type', /audio\/pcm/);
   expect(firstBeforeEnd).toBe(true);
  } finally { clearTimeout(safety); upstream.destroy(); }
  await request(app).post('/api/conversations/' + session.session_id + '/speak').set('Cookie', other.cookie).send({ text: agent.greeting }).expect(404);
  await request(app).delete('/api/conversations/' + session.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { post.mockRestore(); process.env.VOICEAI_SPEECH_MODE = old.mode || 'browser'; config.apiKeys.deepgram = old.deepgram; config.apiKeys.cartesia = old.cartesia; }
});

test('voice timing belongs to a completed turn, is private and survives later history saves', async () => {
 const owner = await register('timing-owner@example.test'); const other = await register('timing-other@example.test');
 const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const opened = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({ agent_id: agent.id })).body;
 const url = '/api/conversations/' + opened.session_id;
 const reply = await request(app).post(url + '/turn').set('Cookie', owner.cookie).send({ text: 'Hello' }).expect(200);
 const complete = reply.text.trim().split('\n').map((line: string) => JSON.parse(line)).find((event: any) => event.type === 'complete');
 const timing = { turn_id: complete.turn_id, first_audio_ms: 800, audio_clock: 'scheduled_pcm' };
 await request(app).post(url + '/timing').set('Cookie', other.cookie).send(timing).expect(404);
 await request(app).post(url + '/timing').set('Cookie', owner.cookie).send({ ...timing, first_audio_ms: -1 }).expect(400);
 await request(app).post(url + '/timing').set('Cookie', owner.cookie).send(timing).expect(200);
 await request(app).post(url + '/timing').set('Cookie', owner.cookie).send({ ...timing, first_audio_ms: 2 }).expect(200);
 await request(app).post(url + '/turn').set('Cookie', owner.cookie).send({ text: 'Who are you?' }).expect(200);
 const history = (await request(app).get('/api/conversations/history/' + opened.session_id).set('Cookie', owner.cookie)).body.conversation;
 expect(history.voice_timings).toEqual([timing]);
 await request(app).delete(url).set('Cookie', owner.cookie);
});

test('demo widgets work independently of private live mode; live publishing remains opt-in', async () => {
 const owner = await register('widget-mode-owner@example.test'); const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const before = { runtime: process.env.VOICEAI_RUNTIME_MODE, public: process.env.VOICEAI_PUBLIC_LIVE };
 process.env.VOICEAI_RUNTIME_MODE = 'live'; process.env.VOICEAI_PUBLIC_LIVE = 'false';
 try {
  const version = (await request(app).post('/api/agents/' + agent.id + '/publish').set('Cookie', owner.cookie).expect(201)).body.version;
  const input = { version_id: version.id, allowed_origins: ['https://widget.example'] };
  await request(app).post('/api/agents/' + agent.id + '/deployments').set('Cookie', owner.cookie).send({ ...input, runtime_mode: 'live' }).expect(409);
  const deployment = (await request(app).post('/api/agents/' + agent.id + '/deployments').set('Cookie', owner.cookie).send(input).expect(201)).body.deployment;
  expect(deployment.runtime_mode).toBe('demo');
  const session = (await request(app).post('/api/public/deployments/' + deployment.id + '/sessions').set('Origin', 'https://widget.example').expect(201)).body;
  expect(session.runtime_mode).toBe('demo');
  const turn = await request(app).post('/api/public/sessions/' + session.session_id + '/turn').set('Authorization', 'Bearer ' + session.token).send({ text: 'Hello' }).expect(200);
  expect(turn.text).toContain('"runtime_mode":"demo"');
  process.env.VOICEAI_PUBLIC_LIVE = 'true';
  const live = (await request(app).post('/api/agents/' + agent.id + '/deployments').set('Cookie', owner.cookie).send({ ...input, runtime_mode: 'live' }).expect(201)).body.deployment;
  const liveSession = (await request(app).post('/api/public/deployments/' + live.id + '/sessions').set('Origin', 'https://widget.example').expect(201)).body;
  expect(liveSession.runtime_mode).toBe('live');
  process.env.VOICEAI_PUBLIC_LIVE = 'false';
  await request(app).post('/api/public/sessions/' + liveSession.session_id + '/turn').set('Authorization', 'Bearer ' + liveSession.token).send({ text: 'Hello' }).expect(503);
  process.env.VOICEAI_PUBLIC_LIVE = 'true';
  await request(app).delete('/api/public/sessions/' + liveSession.session_id).set('Authorization', 'Bearer ' + liveSession.token).expect(200);
  process.env.VOICEAI_PUBLIC_LIVE = 'false';
  await request(app).delete('/api/public/sessions/' + session.session_id).set('Authorization', 'Bearer ' + session.token).expect(200);
 } finally { process.env.VOICEAI_RUNTIME_MODE = before.runtime || 'demo'; process.env.VOICEAI_PUBLIC_LIVE = before.public || 'false'; }
});
test('saved replies above 2000 characters can be spoken in authorized bounded segments', async () => {
 const owner = await register('speech-chunks-owner@example.test'); const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const config = require('../src/config').default; const before = { mode: process.env.VOICEAI_SPEECH_MODE, cartesia: config.apiKeys.cartesia };
 process.env.VOICEAI_SPEECH_MODE = 'cloud'; config.apiKeys.cartesia = 'fake';
 const post = jest.spyOn(axios, 'post').mockImplementation(async () => ({ data: Readable.from([Buffer.from('RIFF-audio')]) }));
 try {
  const opened = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({ agent_id: agent.id }).expect(201)).body;
  const text = 'A longer spoken reply. '.repeat(140); findConversation(owner.user.workspace_id, opened.session_id)!.history.push({ role: 'assistant', content: text });
  const chunks = speechSegments(text);
  for (let index = 0; index < chunks.length; index++) await request(app).post('/api/conversations/' + opened.session_id + '/speak').set('Cookie', owner.cookie).send({ text, chunk_index: index }).expect(200);
  expect(post.mock.calls.map(call => (call[1] as any).transcript)).toEqual(chunks);
  await request(app).post('/api/conversations/' + opened.session_id + '/speak').set('Cookie', owner.cookie).send({ text, chunk_index: 999 }).expect(400);
  await request(app).delete('/api/conversations/' + opened.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { post.mockRestore(); process.env.VOICEAI_SPEECH_MODE = before.mode || 'browser'; config.apiKeys.cartesia = before.cartesia; }
});

test('widget transcripts belong to the owner and expose conversation and deployment identifiers', async () => {
 const owner = await register('history-widget-owner@example.test'); const other = await register('history-widget-other@example.test');
 const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const version = (await request(app).post('/api/agents/' + agent.id + '/publish').set('Cookie', owner.cookie)).body.version;
 const deployment = (await request(app).post('/api/agents/' + agent.id + '/deployments').set('Cookie', owner.cookie).send({version_id: version.id, allowed_origins: ['https://history-widget.example']})).body.deployment;
 const opened = (await request(app).post('/api/public/deployments/' + deployment.id + '/sessions').set('Origin', 'https://history-widget.example').expect(201)).body;
 expect(opened.speech_output).toBe('browser');
 const base = '/api/conversations/history/' + opened.session_id;
 const initial = (await request(app).get(base).set('Cookie', owner.cookie).expect(200)).body.conversation;
 expect(initial).toMatchObject({id: opened.session_id, agent_id: agent.id, deployment_id: deployment.id, version_id: version.id, channel: 'widget', origin: 'https://history-widget.example'});
 await request(app).get(base).set('Cookie', other.cookie).expect(404);
 await request(app).get(base).set('Authorization', 'Bearer ' + opened.token).expect(401);
 await request(app).post('/api/public/sessions/' + opened.session_id + '/turn').set('Authorization', 'Bearer ' + opened.token).send({text: 'Saved widget question'}).expect(200);
 const detail = (await request(app).get(base).set('Cookie', owner.cookie)).body.conversation;
 expect(detail.messages.some((value: any) => value.text === 'Saved widget question')).toBe(true);
 await request(app).delete('/api/public/sessions/' + opened.session_id).set('Authorization', 'Bearer ' + opened.token).expect(200);
});

test('recordings require notice and ownership, reject invalid files, keep playback private and delete audio', async () => {
 const media = require('../src/services/cloudinary_media');
 const ready = jest.spyOn(media, 'cloudinaryReady').mockReturnValue(true);
 const upload = jest.spyOn(media, 'uploadMedia').mockResolvedValue({public_id: 'private-test-asset', format: 'webm', bytes: 100, duration: 2, resource_type: 'video'});
 const download = jest.spyOn(media, 'mediaDownload').mockReturnValue('https://example.test/private-test');
 const destroy = jest.spyOn(media, 'deleteMedia').mockResolvedValue(undefined);
 const get = jest.spyOn(axios, 'get').mockResolvedValue({data: Buffer.from('private-audio'), headers: {'content-type': 'audio/webm'}});
 try {
  const owner = await register('recording-owner@example.test'); const other = await register('recording-other@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const opened = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({agent_id: agent.id}).expect(201)).body;
  const url = '/api/conversations/' + opened.session_id + '/recording'; const history = '/api/conversations/history/' + opened.session_id;
  await request(app).post(url + '/start').send({notice_version: 'recording-v1'}).expect(401);
  await request(app).post(url + '/start').set('Cookie', other.cookie).send({notice_version: 'recording-v1'}).expect(404);
  await request(app).post(url + '/start').set('Cookie', owner.cookie).send({}).expect(400);
  await request(app).post(url + '/start').set('Cookie', owner.cookie).send({notice_version: 'recording-v1'}).expect(201);
  await request(app).post(url + '/start').set('Cookie', owner.cookie).send({notice_version: 'recording-v1'}).expect(409);
  await request(app).post(url).set('Cookie', owner.cookie).set('Content-Type', 'audio/webm').send(Buffer.from('invalid-audio')).expect(400);
  expect(upload).not.toHaveBeenCalled();
  const bytes = Buffer.alloc(100); Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes);
  await request(app).post(url).set('Cookie', other.cookie).set('Content-Type', 'audio/webm').send(bytes).expect(404);
  upload.mockRejectedValueOnce(new Error('Provider unavailable'));
  await request(app).post(url).set('Cookie', owner.cookie).set('Content-Type', 'audio/webm').send(bytes).expect(502);
  expect((await request(app).get(history).set('Cookie', owner.cookie)).body.conversation.recording.status).toBe('failed');
  expect(destroy).toHaveBeenCalled(); destroy.mockClear();
  await request(app).post(url).set('Cookie', owner.cookie).set('Content-Type', 'audio/webm').send(bytes).expect(201);
  const detail = (await request(app).get(history).set('Cookie', owner.cookie)).body.conversation;
  expect(detail.recording).toMatchObject({status: 'ready', duration: 2}); expect(JSON.stringify(detail)).not.toContain('private-test-asset');
  await request(app).get(history + '/recording').set('Cookie', other.cookie).expect(404);
  await request(app).get(history + '/recording').expect(401);
  await request(app).get(history + '/recording').set('Cookie', owner.cookie).expect(200).expect('Cache-Control', 'private, no-store');
  await request(app).delete(history + '/recording').set('Cookie', other.cookie).expect(200);
  expect(destroy).not.toHaveBeenCalled();
  await request(app).delete(history + '/recording').set('Cookie', owner.cookie).expect(200);
  expect(destroy).toHaveBeenCalledWith('private-test-asset');
  await request(app).get(history + '/recording').set('Cookie', owner.cookie).expect(404);
  await request(app).get(history).set('Cookie', owner.cookie).expect(200);
  await request(app).delete('/api/conversations/' + opened.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { ready.mockRestore(); upload.mockRestore(); download.mockRestore(); destroy.mockRestore(); get.mockRestore(); }
});

test('metadata-save and deletion failures retain the asset for durable cleanup and retry', async () => {
 const media = require('../src/services/cloudinary_media'); const metadata = require('../src/services/recordings');
 const ready = jest.spyOn(media, 'cloudinaryReady').mockReturnValue(true);
 const upload = jest.spyOn(media, 'uploadMedia').mockResolvedValue({public_id: 'needs-cleanup-asset', format: 'webm', bytes: 100, duration: 2, resource_type: 'video'});
 const destroy = jest.spyOn(media, 'deleteMedia').mockRejectedValue(new Error('Cloudinary unavailable'));
 const originalSave = metadata.saveRecording;
 let failed = false;
 const save = jest.spyOn(metadata, 'saveRecording').mockImplementation(async (value: any) => { if (value.status === 'ready' && !failed) { failed = true; throw new Error('Metadata disk unavailable'); } return originalSave(value); });
 try {
  const owner = await register('cleanup-recording-owner@example.test');
  const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
  const opened = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({agent_id: agent.id}).expect(201)).body;
  const workspace = findConversation((await request(app).get('/api/platform').set('Cookie', owner.cookie)).body.workspace_id, opened.session_id)!.workspace_id;
  const url = '/api/conversations/' + opened.session_id + '/recording';
  await request(app).post(url + '/start').set('Cookie', owner.cookie).send({notice_version: 'recording-v1'}).expect(201);
  const bytes = Buffer.alloc(100); Buffer.from([0x1a,0x45,0xdf,0xa3]).copy(bytes);
  await request(app).post(url).set('Cookie', owner.cookie).set('Content-Type', 'audio/webm').send(bytes).expect(502);
  expect(metadata.recordingFor(workspace, opened.session_id)).toMatchObject({status: 'cleanup_pending', public_id: 'needs-cleanup-asset', bytes: 100});
  expect(metadata.recordingUsage(workspace)).toBe(100);
  expect([...mockFiles.entries()].find(([path]) => path.endsWith('recordings.json'))?.[1]).toContain('needs-cleanup-asset');
  await request(app).get('/api/conversations/history/' + opened.session_id + '/recording').set('Cookie', owner.cookie).expect(404);
  // Upload retries cannot overwrite an asset whose deletion is still pending.
  await request(app).post(url).set('Cookie', owner.cookie).set('Content-Type', 'audio/webm').send(bytes).expect(502);
  expect(upload).toHaveBeenCalledTimes(1);
  destroy.mockResolvedValue(undefined); await metadata.cleanupRecordings();
  expect(destroy).toHaveBeenLastCalledWith('needs-cleanup-asset');
  expect(metadata.recordingFor(workspace, opened.session_id)).toMatchObject({status: 'failed'});
  expect(metadata.recordingFor(workspace, opened.session_id).public_id).toBeUndefined(); expect(metadata.recordingUsage(workspace)).toBe(0);
  await request(app).post(url).set('Cookie', owner.cookie).set('Content-Type', 'audio/webm').send(bytes).expect(201);
  await request(app).delete('/api/conversations/history/' + opened.session_id + '/recording').set('Cookie', owner.cookie).expect(200);
  await request(app).delete('/api/conversations/' + opened.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { ready.mockRestore(); upload.mockRestore(); destroy.mockRestore(); save.mockRestore(); }
});

test('history pagination is bounded, searches all pages and keeps totals workspace-private', async () => {
 const owner = await register('pagination-owner@example.test'); const other = await register('pagination-other@example.test');
 const workspace = (await request(app).get('/api/platform').set('Cookie', owner.cookie)).body.workspace_id;
 const otherWorkspace = (await request(app).get('/api/platform').set('Cookie', other.cookie)).body.workspace_id;
 const {saveConversationRecord} = require('../src/services/conversation_history');
 for(let index = 0; index < 23; index++) await saveConversationRecord({id: 'pagination-' + String(index).padStart(2, '0'), workspace_id: workspace, agent_id: 'pagination-agent', agent_name: 'Page Agent', started_at: index, updated_at: index, status: 'ended', runtime_mode: 'demo', processing_ms: null, messages: [{role: 'user', text: 'Question ' + index, timestamp: index}, {role: 'assistant', text: index === 5 ? 'Hidden assistant search needle' : 'Answer', timestamp: index}]});
 await saveConversationRecord({id: 'other-pagination', workspace_id: otherWorkspace, agent_id: 'other-agent', agent_name: 'Other', started_at: 100, updated_at: 100, status: 'ended', runtime_mode: 'demo', processing_ms: null, messages: []});
 const first = (await request(app).get('/api/conversations/history').set('Cookie', owner.cookie).expect(200)).body;
 expect(first.conversations).toHaveLength(10); expect(first.pagination).toEqual({page: 1, page_size: 10, total: 23, total_pages: 3}); expect(first.stats).toEqual({conversation_count: 23, message_count: 46});
 expect(first.conversations[0].id).toBe('pagination-22'); expect(first.conversations[0].messages).toBeUndefined();
 const second = (await request(app).get('/api/conversations/history?page=2').set('Cookie', owner.cookie).expect(200)).body;
 expect(second.conversations).toHaveLength(10); expect(second.conversations.some((value: any) => first.conversations.some((item: any) => item.id === value.id))).toBe(false);
 const last = (await request(app).get('/api/conversations/history?page=999').set('Cookie', owner.cookie).expect(200)).body;
 expect(last.pagination.page).toBe(3); expect(last.conversations).toHaveLength(3);
 const found = (await request(app).get('/api/conversations/history?q=hidden%20assistant%20search%20needle&page=3').set('Cookie', owner.cookie).expect(200)).body;
 expect(found.pagination).toMatchObject({page: 1, total: 1, total_pages: 1}); expect(found.conversations[0].id).toBe('pagination-05'); expect(found.stats.conversation_count).toBe(23);
 const larger = (await request(app).get('/api/conversations/history?page_size=25').set('Cookie', owner.cookie)).body; expect(larger.conversations).toHaveLength(23);
 const empty = (await request(app).get('/api/conversations/history?q=hidden').set('Cookie', other.cookie)).body; expect(empty.conversations).toEqual([]); expect(empty.pagination.total).toBe(0); expect(empty.stats.conversation_count).toBe(1);
 for (const query of ['page=0','page=-1','page=1.5','page_size=51','page_size=0','page=oops']) await request(app).get('/api/conversations/history?' + query).set('Cookie', owner.cookie).expect(400);
});

test('registered streaming speech is available before turn completion and rejects stale or foreign segments', async () => {
 const owner = await register('stream-speech-owner@example.test'); const other = await register('stream-speech-other@example.test');
 const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const config = require('../src/config').default; const old = {mode: process.env.VOICEAI_SPEECH_MODE, cartesia: config.apiKeys.cartesia};
 process.env.VOICEAI_SPEECH_MODE = 'cloud'; config.apiKeys.cartesia = 'test-cartesia';
 const post = jest.spyOn(axios, 'post').mockImplementation(async () => ({ data: Readable.from([Buffer.from('RIFF-stream-test')]) }));
 let iterator: ReturnType<typeof conversationTurn> | undefined; const abort = new AbortController();
 try {
  const opened = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({agent_id: agent.id}).expect(201)).body;
  const session = findConversation(owner.user.workspace_id, opened.session_id)!;
  // Locate using the persisted account, matching other workspace tests.
  expect(session).toBeDefined();
  iterator = conversationTurn(session, 'Hello', abort);
  let segment: any;
  for (let i = 0; i < 100; i++) { const event = await iterator.next(); if (event.value?.type === 'speech') { segment = event.value; break; } }
  expect(segment).toBeDefined(); expect(session.history).toHaveLength(0);
  const url = '/api/conversations/' + opened.session_id + '/speak';
  const body = {turn_id: segment.turn_id, segment_index: segment.segment_index};
  await request(app).post(url).set('Cookie', owner.cookie).send({...body, turn_id: 'foreign'}).expect(400);
  await request(app).post(url).set('Cookie', other.cookie).send(body).expect(404);
  await request(app).post(url).set('Cookie', owner.cookie).send(body).expect(200);
  expect(post.mock.calls[0][1]).toMatchObject({transcript: segment.text});
  abort.abort(); await iterator.return(undefined as never);
  await request(app).post(url).set('Cookie', owner.cookie).send(body).expect(400);
  await request(app).delete('/api/conversations/' + opened.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { abort.abort(); await iterator?.return(undefined as never); post.mockRestore(); process.env.VOICEAI_SPEECH_MODE = old.mode; config.apiKeys.cartesia = old.cartesia; }
});

test('end_call saves its goodbye and tool event before the client closes the session', async () => {
 const owner = await register('end-call-owner@example.test');
 const agent = (await request(app).get('/api/agents').set('Cookie', owner.cookie)).body.agents[0];
 const opened = (await request(app).post('/api/conversations').set('Cookie', owner.cookie).send({agent_id: agent.id}).expect(201)).body;
 const base = '/api/conversations/' + opened.session_id;
 const ordinary = await request(app).post(base + '/turn').set('Cookie', owner.cookie).send({text: 'I am done with the payment'}).expect(200);
 expect(ordinary.text.trim().split('\n').map((line: string) => JSON.parse(line)).find((event: any) => event.type === 'complete').end_call).toBe(false);
 const ended = await request(app).post(base + '/turn').set('Cookie', owner.cookie).send({text: 'Please end the call'}).expect(200);
 const events = ended.text.trim().split('\n').map((line: string) => JSON.parse(line));
 expect(events.find((event: any) => event.type === 'tool_result')).toMatchObject({name: 'end_call', status: 'completed'});
 expect(events.find((event: any) => event.type === 'complete')).toMatchObject({end_call: true, output: expect.stringContaining('Goodbye')});
 expect(findConversation(owner.user.workspace_id, opened.session_id)).toBeDefined();
 const history = (await request(app).get('/api/conversations/history/' + opened.session_id).set('Cookie', owner.cookie).expect(200)).body.conversation;
 expect(history.messages.at(-1).text).toContain('Goodbye'); expect(history.tool_events.at(-1).name).toBe('end_call');
 await request(app).delete(base).set('Cookie', owner.cookie).expect(200);
 expect(findConversation(owner.user.workspace_id, opened.session_id)).toBeUndefined();
});
