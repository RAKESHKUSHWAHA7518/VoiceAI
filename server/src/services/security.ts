import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import logger from '../utils/logger';

export type UserRole = 'admin' | 'agent_manager' | 'auditor_qa';

export type Permission =
  | 'manage_agents'
  | 'manage_keys'
  | 'manage_knowledge'
  | 'run_evals'
  | 'view_analytics'
  | 'delete_calls'
  | 'takeover_calls'
  | 'view_audit_logs'
  | 'export_data';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  permissions: Permission[];
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
  encryptedAt: number;
}

export type AuditAction =
  | 'LOGIN'
  | 'AGENT_CREATE'
  | 'AGENT_UPDATE'
  | 'AGENT_DELETE'
  | 'CALL_EXPORT'
  | 'CALL_DELETE'
  | 'KEY_ROTATE'
  | 'KNOWLEDGE_UPLOAD'
  | 'EVAL_RUN'
  | 'CRYPTO_ENCRYPT'
  | 'ROLE_SWITCH';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;
  resource: string;
  details: Record<string, unknown>;
  ipAddress: string;
  status: 'SUCCESS' | 'DENIED' | 'FAILED';
}

export interface VaultKeyRecord {
  id: string;
  provider: string;
  displayName: string;
  maskedKey: string;
  status: 'active' | 'rotated' | 'revoked';
  environment: 'production' | 'staging';
  lastRotated: number;
  version: number;
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'manage_agents',
    'manage_keys',
    'manage_knowledge',
    'run_evals',
    'view_analytics',
    'delete_calls',
    'takeover_calls',
    'view_audit_logs',
    'export_data',
  ],
  agent_manager: [
    'manage_agents',
    'manage_knowledge',
    'run_evals',
    'view_analytics',
    'takeover_calls',
    'view_audit_logs',
  ],
  auditor_qa: [
    'view_analytics',
    'view_audit_logs',
    'export_data',
  ],
};

const DEFAULT_USERS: Record<string, UserAccount> = {
  user_admin: {
    id: 'user_admin',
    name: 'Alex Vance',
    email: 'alex.vance@voiceai.enterprise',
    role: 'admin',
    avatar: '👨‍💼',
    permissions: ROLE_PERMISSIONS.admin,
  },
  user_manager: {
    id: 'user_manager',
    name: 'Sarah Connor',
    email: 'sarah.connor@voiceai.enterprise',
    role: 'agent_manager',
    avatar: '👩‍💻',
    permissions: ROLE_PERMISSIONS.agent_manager,
  },
  user_auditor: {
    id: 'user_auditor',
    name: 'David Miller',
    email: 'david.miller@compliance.audit',
    role: 'auditor_qa',
    avatar: '🕵️',
    permissions: ROLE_PERMISSIONS.auditor_qa,
  },
};

export class EnterpriseSecurityService extends EventEmitter {
  private masterEncryptionKey: Buffer;
  private auditLogs: AuditLogEntry[] = [];
  private vaultKeys: Map<string, VaultKeyRecord> = new Map();
  private currentUser: UserAccount = DEFAULT_USERS.user_admin;

  constructor() {
    super();
    // 256-bit key (32 bytes) for AES-256-GCM
    const envKey = process.env.ENCRYPTION_MASTER_KEY;
    if (envKey && envKey.length >= 64) {
      this.masterEncryptionKey = Buffer.from(envKey.slice(0, 64), 'hex');
    } else {
      this.masterEncryptionKey = crypto.createHash('sha256').update('voiceai_soc2_hipaa_master_secret_2026').digest();
    }

    this.initVaultKeys();
    this.seedAuditLogs();
  }

  private initVaultKeys(): void {
    const initialKeys: VaultKeyRecord[] = [
      {
        id: 'key_openai_prod',
        provider: 'openai',
        displayName: 'OpenAI GPT-4o Production Key',
        maskedKey: 'sk-proj-****841a',
        status: 'active',
        environment: 'production',
        lastRotated: Date.now() - 14 * 24 * 3600 * 1000,
        version: 3,
      },
      {
        id: 'key_deepgram_prod',
        provider: 'deepgram',
        displayName: 'Deepgram Nova-2 Streaming ASR',
        maskedKey: 'dg-prod-****920b',
        status: 'active',
        environment: 'production',
        lastRotated: Date.now() - 7 * 24 * 3600 * 1000,
        version: 2,
      },
      {
        id: 'key_cartesia_prod',
        provider: 'cartesia',
        displayName: 'Cartesia Sonic TTS WebSocket Key',
        maskedKey: 'cart-live-****401e',
        status: 'active',
        environment: 'production',
        lastRotated: Date.now() - 30 * 24 * 3600 * 1000,
        version: 4,
      },
      {
        id: 'key_twilio_prod',
        provider: 'twilio',
        displayName: 'Twilio Media Streams Account Token',
        maskedKey: 'SK_twil_****773c',
        status: 'active',
        environment: 'production',
        lastRotated: Date.now() - 3 * 24 * 3600 * 1000,
        version: 1,
      },
      {
        id: 'key_elevenlabs_prod',
        provider: 'elevenlabs',
        displayName: 'ElevenLabs Multilingual Turbo v2.5',
        maskedKey: 'el-prod-****190a',
        status: 'active',
        environment: 'production',
        lastRotated: Date.now() - 21 * 24 * 3600 * 1000,
        version: 2,
      },
    ];

    for (const k of initialKeys) {
      this.vaultKeys.set(k.id, k);
    }
  }

  private seedAuditLogs(): void {
    const baseTime = Date.now();
    this.auditLogs = [
      {
        id: 'audit_init_01',
        timestamp: baseTime - 48 * 3600 * 1000,
        actorId: 'user_admin',
        actorName: 'Alex Vance',
        actorRole: 'admin',
        action: 'LOGIN',
        resource: 'system/auth',
        details: { mfa_method: 'hardware_token', ip: '192.168.1.100' },
        ipAddress: '192.168.1.100',
        status: 'SUCCESS',
      },
      {
        id: 'audit_init_02',
        timestamp: baseTime - 36 * 3600 * 1000,
        actorId: 'user_manager',
        actorName: 'Sarah Connor',
        actorRole: 'agent_manager',
        action: 'AGENT_CREATE',
        resource: 'agents/agent_support',
        details: { agent_name: 'Maya', role: 'Customer Support Lead' },
        ipAddress: '10.0.4.15',
        status: 'SUCCESS',
      },
      {
        id: 'audit_init_03',
        timestamp: baseTime - 24 * 3600 * 1000,
        actorId: 'user_manager',
        actorName: 'Sarah Connor',
        actorRole: 'agent_manager',
        action: 'KNOWLEDGE_UPLOAD',
        resource: 'knowledge/doc_refund_policy',
        details: { filename: 'refund_policy_v2.pdf', chunks_indexed: 12 },
        ipAddress: '10.0.4.15',
        status: 'SUCCESS',
      },
      {
        id: 'audit_init_04',
        timestamp: baseTime - 12 * 3600 * 1000,
        actorId: 'user_admin',
        actorName: 'Alex Vance',
        actorRole: 'admin',
        action: 'KEY_ROTATE',
        resource: 'vault/key_twilio_prod',
        details: { provider: 'twilio', version: 1 },
        ipAddress: '192.168.1.100',
        status: 'SUCCESS',
      },
      {
        id: 'audit_init_05',
        timestamp: baseTime - 3 * 3600 * 1000,
        actorId: 'user_auditor',
        actorName: 'David Miller',
        actorRole: 'auditor_qa',
        action: 'CALL_EXPORT',
        resource: 'analytics/calls_weekly_export',
        details: { exported_records: 128, format: 'json_redacted' },
        ipAddress: '172.16.0.42',
        status: 'SUCCESS',
      },
    ];
  }

  // ==========================================
  // 1. RBAC & Access Control
  // ==========================================

  getUser(userId: string): UserAccount | undefined {
    return DEFAULT_USERS[userId];
  }

  getAllUsers(): UserAccount[] {
    return Object.values(DEFAULT_USERS);
  }

  getCurrentUser(): UserAccount {
    return this.currentUser;
  }

  switchUser(userId: string): UserAccount {
    const user = DEFAULT_USERS[userId];
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const previous = this.currentUser;
    this.currentUser = user;

    this.logAudit({
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      action: 'ROLE_SWITCH',
      resource: `user/${user.id}`,
      details: { previousRole: previous.role, newRole: user.role },
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return user;
  }

  hasPermission(role: UserRole, permission: Permission): boolean {
    const allowed = ROLE_PERMISSIONS[role] || [];
    return allowed.includes(permission);
  }

  requirePermission(role: UserRole, permission: Permission): void {
    if (!this.hasPermission(role, permission)) {
      throw new Error(`Forbidden: Role '${role}' lacks required permission '${permission}'`);
    }
  }

  // ==========================================
  // 2. AES-256-GCM Audio & Data Encryption
  // ==========================================

  encrypt(plaintext: Buffer | string): EncryptedPayload {
    const iv = crypto.randomBytes(12); // 96-bit IV standard for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterEncryptionKey, iv);

    const bufferData = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
    const ciphertext = Buffer.concat([cipher.update(bufferData), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      algorithm: 'aes-256-gcm',
      encryptedAt: Date.now(),
    };
  }

  decrypt(payload: EncryptedPayload): Buffer {
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterEncryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  }

  // ==========================================
  // 3. Immutable Audit Logging (SOC2 / HIPAA)
  // ==========================================

  logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const newRecord: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      ...entry,
    };

    // Immutable prepend
    this.auditLogs.unshift(newRecord);
    this.emit('auditLogged', newRecord);

    logger.info(`[SecurityAudit] ${newRecord.actorRole} ${newRecord.action} on ${newRecord.resource} -> ${newRecord.status}`);
    return newRecord;
  }

  getAuditLogs(filter?: { role?: UserRole; action?: AuditAction; limit?: number }): AuditLogEntry[] {
    let result = [...this.auditLogs];
    if (filter?.role) {
      result = result.filter(e => e.actorRole === filter.role);
    }
    if (filter?.action) {
      result = result.filter(e => e.action === filter.action);
    }
    if (filter?.limit) {
      result = result.slice(0, filter.limit);
    }
    return result;
  }

  // ==========================================
  // 4. Secret Key Vault
  // ==========================================

  getVaultKeys(): VaultKeyRecord[] {
    return Array.from(this.vaultKeys.values());
  }

  rotateVaultKey(keyId: string, actor: UserAccount): VaultKeyRecord {
    this.requirePermission(actor.role, 'manage_keys');

    const record = this.vaultKeys.get(keyId);
    if (!record) {
      throw new Error(`Vault key ${keyId} not found`);
    }

    const randHex = crypto.randomBytes(4).toString('hex');
    record.maskedKey = `${record.provider.slice(0, 4)}-prod-****${randHex.slice(0, 4)}`;
    record.lastRotated = Date.now();
    record.version += 1;
    record.status = 'active';

    this.logAudit({
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'KEY_ROTATE',
      resource: `vault/${keyId}`,
      details: { provider: record.provider, newVersion: record.version },
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return record;
  }
}

export const securityService = new EnterpriseSecurityService();
