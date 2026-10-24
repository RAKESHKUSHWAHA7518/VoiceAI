import express from 'express';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mountStudio } from '../src/routes/studio';

describe('same-origin studio hosting', () => {
  let directory: string;
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voiceai-studio-'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<html>VoiceAI studio</html>');
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'assets', 'app.js'), 'console.log("studio");');
  });
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));
  function app() { const server = express(); mountStudio(server, directory); return server; }
  test.each(['/', '/history', '/agents/agent-123', '/widget/deployment-123'])('serves direct browser route %s', async route => {
    const response = await request(app()).get(route).set('Accept', 'text/html').expect(200);
    expect(response.text).toContain('VoiceAI studio');
    expect(response.headers['cache-control']).toBe('no-cache');
  });
  test('serves assets while missing API and asset URLs stay 404', async () => {
    await request(app()).get('/assets/app.js').expect(200);
    for (const url of ['/api/missing', '/health/missing', '/assets/missing.js', '/recordings/missing', '/missing.json']) {
      await request(app()).get(url).set('Accept', 'text/html').expect(404);
    }
    await request(app()).get('/history').set('Accept', 'application/json').expect(404);
  });
});
