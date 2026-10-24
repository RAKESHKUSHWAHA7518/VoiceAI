import express from 'express';
import request from 'supertest';

let mockAgentFile: string | undefined;
let mockWriteFailure = false;
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const isAgents = (file: unknown) => /[\\/]data[\\/]agents\.json$/.test(String(file));
  return {
    ...actual,
    existsSync: (file: unknown) => isAgents(file) ? mockAgentFile !== undefined : actual.existsSync(file),
    readFileSync: (file: unknown, ...args: unknown[]) => isAgents(file) ? mockAgentFile : actual.readFileSync(file, ...args),
    writeFileSync: (file: unknown, data: string, ...args: unknown[]) => {
      if (!isAgents(file)) return actual.writeFileSync(file, data, ...args);
      if (mockWriteFailure) throw new Error('Storage unavailable');
      mockAgentFile = data;
    },
  };
});

function loadApp() {
  let router: any;
  let errorHandler: any;
  jest.isolateModules(() => {
    router = require('../src/routes/agents').default;
    errorHandler = require('../src/middleware/errorHandler').errorHandler;
  });
  const app = express();
  app.use(express.json());
  app.use('/agents', router);
  app.use(errorHandler);
  return app;
}

beforeEach(() => { mockAgentFile = undefined; mockWriteFailure = false; });

test('starts with two templates and restores a created agent after reload', async () => {
  let app = loadApp();
  expect((await request(app).get('/agents')).body.agents).toHaveLength(2);
  const created = await request(app).post('/agents').send({ name: 'Hindi support', languages_supported: ['hi', 'en'], default_language: 'hi', auto_switch_language: false });
  expect(created.status).toBe(200);
  expect(created.body.agent.assigned_tools).toEqual([]);
  app = loadApp();
  const records = (await request(app).get('/agents')).body.agents;
  expect(records.find((agent: any) => agent.id === created.body.agent.id)).toMatchObject({ name: 'Hindi support', default_language: 'hi', auto_switch_language: false });
});

test('does not resurrect templates after every agent is deleted', async () => {
  const app = loadApp();
  const records = (await request(app).get('/agents')).body.agents;
  for (const agent of records) await request(app).delete(`/agents/${agent.id}`).expect(200);
  expect((await request(loadApp()).get('/agents')).body.agents).toEqual([]);
});

test('rejects invalid configuration without changing stored agents', async () => {
  const app = loadApp();
  await request(app).post('/agents').send({ name: 'Bad settings', llm_temperature: 10 }).expect(400);
  expect((await request(app).get('/agents')).body.agents).toHaveLength(2);
  expect(mockAgentFile).toBeUndefined();
});

test('rolls back a failed save and accepts the next valid edit', async () => {
  const app = loadApp();
  mockWriteFailure = true;
  await request(app).post('/agents').send({ name: 'Failed agent' }).expect(500);
  expect((await request(app).get('/agents')).body.agents).toHaveLength(2);
  mockWriteFailure = false;
  await request(app).post('/agents').send({ name: 'Saved agent' }).expect(200);
  expect((await request(loadApp()).get('/agents')).body.agents).toHaveLength(3);
});
