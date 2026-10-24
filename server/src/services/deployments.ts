import { dataPath } from '../config/storage';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { MongoRecordModel } from '../models/base';
import { agentSchema, AgentRecord } from '../models/agent.model';
import { PersistentStore } from './database';
import { EventEmitter } from 'events';
export const deploymentEvents = new EventEmitter();

const versionSchema = z.object({ id: z.string(), agent_id: z.string(), workspace_id: z.string(), created_at: z.number(), snapshot: agentSchema });
const deploymentSchema = z.object({ id: z.string(), agent_id: z.string(), workspace_id: z.string(), version_id: z.string(), runtime_mode: z.enum(['demo', 'live']).optional(), allowed_origins: z.array(z.string()).min(1).max(10), active: z.boolean(), created_at: z.number() });
type Version = z.infer<typeof versionSchema>;
type Deployment = z.infer<typeof deploymentSchema>;
const versionFile = dataPath('agent_versions.json');
const deploymentFile = dataPath('deployments.json');
let versions: Version[] = fs.existsSync(versionFile) ? z.array(versionSchema).parse(JSON.parse(fs.readFileSync(versionFile, 'utf8'))) : [];
let deployments: Deployment[] = fs.existsSync(deploymentFile) ? z.array(deploymentSchema).parse(JSON.parse(fs.readFileSync(deploymentFile, 'utf8'))) : [];
const versionStore = new PersistentStore(new MongoRecordModel<Version>('agent_versions', versionSchema), versionFile, () => versions, records => { versions = records; });
const deploymentStore = new PersistentStore(new MongoRecordModel<Deployment>('deployments', deploymentSchema), deploymentFile, () => deployments, records => { deployments = records; });
let pending: Promise<unknown> = Promise.resolve();
function edit<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation); pending = result.catch(() => undefined); return result;
}
export function publishAgent(agent: AgentRecord, workspace: string) {
  const snapshot = structuredClone(agent);
  return edit(async () => {
    const version: Version = { id: crypto.randomUUID(), agent_id: snapshot.id, workspace_id: workspace, created_at: Date.now(), snapshot };
    versions.push(version);
    try { await versionStore.save(); return structuredClone(version); } catch (error) { versions = versions.filter(value => value.id !== version.id); throw error; }
  });
}
export function listAgentDeployments(agent: string, workspace: string) { return { versions: versions.filter(version => version.agent_id === agent && version.workspace_id === workspace), deployments: deployments.filter(value => value.agent_id === agent && value.workspace_id === workspace) }; }
export function createDeployment(agent: string, workspace: string, input: unknown) {
  const data = z.object({ version_id: z.string(), runtime_mode: z.enum(['demo', 'live']).default('demo'), allowed_origins: z.array(z.string().url()).min(1).max(10) }).parse(input);
  const origins = data.allowed_origins.map(value => {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('INVALID_ORIGIN');
    return url.origin;
  });
  return edit(async () => {
    if (!versions.some(version => version.id === data.version_id && version.agent_id === agent && version.workspace_id === workspace)) throw new Error('VERSION_NOT_FOUND');
    if (data.runtime_mode === 'live' && process.env.VOICEAI_PUBLIC_LIVE !== 'true') throw new Error('PUBLIC_LIVE_DISABLED');
    const deployment: Deployment = { id: crypto.randomUUID(), agent_id: agent, workspace_id: workspace, version_id: data.version_id, runtime_mode: data.runtime_mode, allowed_origins: [...new Set(origins)], active: true, created_at: Date.now() };
    deployments.push(deployment);
    try { await deploymentStore.save(); return structuredClone(deployment); } catch (error) { deployments = deployments.filter(value => value.id !== deployment.id); throw error; }
  });
}
export function disableDeployment(id: string, agent: string, workspace: string) {
  return edit(async () => {
    const deployment = deployments.find(value => value.id === id && value.agent_id === agent && value.workspace_id === workspace);
    if (!deployment) return false;
    const previous = deployment.active; deployment.active = false;
    try { await deploymentStore.save(); deploymentEvents.emit('disabled', id); return true; } catch (error) { deployment.active = previous; throw error; }
  });
}
export function resolveDeployment(id: string, origin?: string) {
  const deployment = deployments.find(value => value.id === id && value.active && (!origin || value.allowed_origins.includes(origin)));
  if (!deployment) return undefined;
  const version = versions.find(value => value.id === deployment.version_id);
  return version ? { deployment, version } : undefined;
}
export function disableAgentDeployments(agent: string, workspace: string) {
  return edit(async () => {
    const previous = structuredClone(deployments);
    for (const deployment of deployments) if (deployment.agent_id === agent && deployment.workspace_id === workspace) deployment.active = false;
    try { await deploymentStore.save(); for (const deployment of deployments) if (deployment.agent_id === agent && deployment.workspace_id === workspace) deploymentEvents.emit('disabled', deployment.id); } catch (error) { deployments = previous; throw error; }
  });
}
