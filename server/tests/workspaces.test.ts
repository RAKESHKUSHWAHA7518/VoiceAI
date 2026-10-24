import axios from 'axios';
import express from 'express';
import request from 'supertest';

const mockFiles = new Map<string, string>();
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const privateFile = (file: unknown) => /[\\/]data[\\/](accounts|agents|agent_versions|deployments|conversation_history|workspace_tools)\.json$/.test(String(file));
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
 const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: Buffer.from('RIFF-test-audio') });
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
  await request(app).post('/api/conversations/' + session.session_id + '/speak').set('Cookie', other.cookie).send({ text: agent.greeting }).expect(404);
  await request(app).delete('/api/conversations/' + session.session_id).set('Cookie', owner.cookie).expect(200);
 } finally { post.mockRestore(); process.env.VOICEAI_SPEECH_MODE = old.mode || 'browser'; config.apiKeys.deepgram = old.deepgram; config.apiKeys.cartesia = old.cartesia; }
});
