import { dataPath } from '../config/storage';
import crypto from 'crypto';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { MongoRecordModel } from '../models/base';
import { PersistentStore } from './database';
import { AuthenticationError, ValidationError } from '../types';

const derive = promisify(crypto.scrypt);
const sessionSchema = z.object({ hash: z.string(), expires_at: z.number() });
const accountSchema = z.object({
  id: z.string(), workspace_id: z.string(), name: z.string(), email: z.string().email(),
  password_hash: z.string(), salt: z.string(), sessions: z.array(sessionSchema), created_at: z.number(),
  agents_initialized: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;
export const AccountModel = new MongoRecordModel<Account>('accounts', accountSchema, [
  { key: { 'value.email': 1 }, unique: true, name: 'account_email' },
]);
const file = dataPath('accounts.json');
let accounts: Account[] = fs.existsSync(file) ? z.array(accountSchema).parse(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
const store = new PersistentStore(AccountModel, file, () => accounts, records => { accounts = records; });
let pending: Promise<unknown> = Promise.resolve();
async function update<T>(fn: () => T): Promise<T> {
  const operation = pending.then(async () => {
    const previous = structuredClone(accounts);
    try { const result = fn(); await store.save(); return result; }
    catch (error) { accounts = previous; throw error; }
  });
  pending = operation.catch(() => undefined);
  return operation;
}
export function publicAccount(account: Account) {
  return { id: account.id, name: account.name, email: account.email, workspace_id: account.workspace_id };
}
const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const credentials = z.object({ email: z.string().trim().email().max(254).transform(value => value.toLowerCase()), password: z.string().min(10).max(128) });
export async function signUp(input: unknown) {
  const data = credentials.extend({ name: z.string().trim().min(1).max(120) }).parse(input);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await derive(data.password, salt, 64) as Buffer).toString('hex');
  return update(() => {
    if (accounts.some(account => account.email === data.email)) throw new ValidationError('Unable to create an account with this email. Try signing in.');
    const account: Account = { id: crypto.randomUUID(), workspace_id: crypto.randomUUID(), name: data.name, email: data.email, password_hash: hash, salt, sessions: [], created_at: Date.now(), agents_initialized: false };
    accounts.push(account);
    return publicAccount(account);
  });
}
export async function signIn(input: unknown) {
  const data = credentials.parse(input);
  const account = accounts.find(value => value.email === data.email);
  // Perform the same expensive derivation even when the email is unknown.
  const calculated = await derive(data.password, account?.salt || '00000000000000000000000000000000', 64) as Buffer;
  if (!account || !crypto.timingSafeEqual(calculated, Buffer.from(account.password_hash, 'hex'))) throw new AuthenticationError('Email or password is incorrect');
  const token = crypto.randomBytes(32).toString('hex');
  await update(() => {
    const current = accounts.find(value => value.id === account.id)!;
    current.sessions = current.sessions.filter(session => session.expires_at > Date.now()).slice(-4);
    current.sessions.push({ hash: tokenHash(token), expires_at: Date.now() + 7 * 86400000 });
  });
  return { user: publicAccount(account), token };
}
export function workspaceNeedsTemplates(id: string) { return accounts.some(account => account.workspace_id === id && !account.agents_initialized); }
export async function markWorkspaceInitialized(id: string) {
  await update(() => { const account = accounts.find(value => value.workspace_id === id); if (account) account.agents_initialized = true; });
}
export function accountForToken(token?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  const hash = tokenHash(token);
  return accounts.find(account => account.sessions.some(session => session.hash === hash && session.expires_at > Date.now()));
}
export async function signOut(token: string) {
  const hash = tokenHash(token);
  await update(() => { for (const account of accounts) account.sessions = account.sessions.filter(session => session.hash !== hash); });
}
