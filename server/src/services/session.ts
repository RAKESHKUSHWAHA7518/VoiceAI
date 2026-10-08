import { EventEmitter } from 'events';
import { SessionState, SessionStateType, TurnContext, TurnMetrics } from '../types';
import config from '../config';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionState> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    super();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000); // Every 5 minutes
    this.cleanupInterval.unref();
  }

  createSession(sessionId: string, userId?: string): SessionState {
    const session: SessionState = {
      sessionId,
      userId,
      state: 'idle',
      turnHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };
    this.sessions.set(sessionId, session);
    this.emit('sessionCreated', session);
    return session;
  }

  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  updateSessionState(sessionId: string, state: SessionStateType): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = state;
      session.updatedAt = new Date();
      this.emit('stateChanged', { sessionId, state });
    }
  }

  addTurn(sessionId: string, turn: any): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.turnHistory.push(turn);
      session.updatedAt = new Date();
    }
  }

  getTurnHistory(sessionId: string): any[] {
    const session = this.sessions.get(sessionId);
    return session?.turnHistory || [];
  }

  getPreservedContext(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (session?.turnHistory.length) {
      const lastTurn = session.turnHistory[session.turnHistory.length - 1];
      return lastTurn.preservedContext || '';
    }
    return '';
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.state = 'ended';
      session.updatedAt = new Date();
      this.emit('sessionEnded', session);
    }
  }

  getSessionMetrics(sessionId: string): any {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const turns = session.turnHistory;
    if (turns.length === 0) return null;

    const latencies = turns.map((t: any) => t.e2eMs || 0).filter(v => v > 0);
    const vadLatencies = turns.map((t: any) => t.vadMs || 0).filter(v => v > 0);
    const asrLatencies = turns.map((t: any) => t.asrMs || 0).filter(v => v > 0);
    const ttftLatencies = turns.map((t: any) => t.ttftMs || 0).filter(v => v > 0);
    const ttsLatencies = turns.map((t: any) => t.ttsFirstChunkMs || 0).filter(v => v > 0);

    const percentile = (arr: number[], p: number) => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor(arr.length * p / 100);
      return sorted[Math.min(idx, arr.length - 1)];
    };

    return {
      totalTurns: session.turnHistory.length,
      avgVadMs: session.turnHistory.reduce((a, t: any) => a + (t.vadMs || 0), 0) / (session.turnHistory.length || 1),
      avgAsrMs: session.turnHistory.reduce((a, t: any) => a + (t.asrMs || 0), 0) / (session.turnHistory.length || 1),
      avgTtftMs: session.turnHistory.reduce((a, t: any) => a + (t.ttftMs || 0), 0) / (session.turnHistory.length || 1),
      avgTtsFirstChunkMs: session.turnHistory.reduce((a, t: any) => a + (t.ttsFirstChunkMs || 0), 0) / (session.turnHistory.length || 1),
      avgE2eMs: session.turnHistory.reduce((a, t: any) => a + (t.e2eMs || 0), 0) / (session.turnHistory.length || 1),
      p95E2eMs: percentile(latencies, 95),
      totalInterruptions: session.turnHistory.reduce((a, t: any) => a + (t.interruptionCount || 0), 0),
      toolCallsCount: session.turnHistory.reduce((a, t: any) => a + (t.toolCalls?.length || 0), 0),
      toolSuccessRate: 1.0, // Would need tool success tracking
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.updatedAt.getTime();
      if (age > maxAge && session.state === 'ended') {
        this.sessions.delete(sessionId);
      }
    }
  }

  shutdown(): void {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

function percentile(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(arr.length * p / 100);
  return sorted[Math.min(idx, arr.length - 1)];
}

export const sessionManager = new SessionManager();

export class SessionStateMachine {
  private sessionId: string;
  private state: SessionStateType = 'idle';

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    sessionManager.createSession(sessionId);
  }

  startSession(): void {
    this.state = 'listening';
    sessionManager.updateSessionState(this.sessionId, this.state);
  }

  start_speaking(): void {
    this.state = 'speaking';
    sessionManager.updateSessionState(this.sessionId, this.state);
  }

  interrupt(): void {
    this.state = 'listening';
    sessionManager.updateSessionState(this.sessionId, this.state);
  }

  end_session(): void {
    this.state = 'ended';
    sessionManager.endSession(this.sessionId);
  }

  getState(): SessionStateType {
    return this.state;
  }
}