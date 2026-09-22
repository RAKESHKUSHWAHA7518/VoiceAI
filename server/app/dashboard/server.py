from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from server.app.telemetry import get_metrics_collector, TurnMetrics
from server.app.config import settings


@dataclass
class DashboardState:
    """State for live dashboard."""
    active_connections: set[WebSocket] = field(default_factory=set)
    current_session_id: Optional[str] = None
    current_turn_id: Optional[str] = None
    audio_buffer_user: list[float] = field(default_factory=list)
    audio_buffer_agent: list[float] = field(default_factory=list)
    barge_in_events: list[dict] = field(default_factory=list)
    transcript_history: list[dict] = field(default_factory=list)
    tool_calls: list[dict] = field(default_factory=list)
    
    # Playground state
    playground_config: dict = field(default_factory=lambda: {
        "voice_id": settings.tts_voice_id or "a0e99841-438c-4a64-b679-ae501e7d6091",
        "vad_threshold": settings.vad_threshold,
        "vad_sos_debounce_ms": settings.vad_sos_debounce_ms,
        "vad_eos_timeout_ms": settings.vad_eos_timeout_ms,
        "system_prompt": """You are a helpful voice assistant. Speak naturally in short, conversational sentences. 
Avoid markdown, emojis, or special formatting. Spell out numbers (e.g., "twenty-five" not "25").
Keep responses concise and spoken-language appropriate. Use contractions and natural fillers.""",
        "llm_model": settings.llm_model,
        "llm_temperature": settings.llm_temperature,
    })
    playground_test_active: bool = False
    playground_test_results: list[dict] = field(default_factory=list)


class DashboardServer:
    """Real-time monitoring dashboard with WebSocket push."""
    
    def __init__(self):
        self.app = FastAPI(title="VoiceAI Dashboard", version="1.0.0")
        self.state = DashboardState()
        self.metrics_collector = get_metrics_collector()
        
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        self._setup_routes()
    
    def _setup_routes(self) -> None:
        @self.app.get("/")
        async def root():
            return HTMLResponse(DASHBOARD_HTML)
        
        @self.app.get("/api/health")
        async def health():
            return {"status": "ok", "connections": len(self.state.active_connections)}
        
        @self.app.get("/api/metrics/percentiles")
        async def percentiles(window: int = 1000):
            return await self.metrics_collector.get_percentiles(window)
        
        @self.app.get("/api/metrics/recent")
        async def recent_turns(limit: int = 100):
            return await self.metrics_collector.get_recent_turns(limit)
        
        @self.app.get("/api/state")
        async def get_state():
            return {
                "session_id": self.state.current_session_id,
                "turn_id": self.state.current_turn_id,
                "transcript_count": len(self.state.transcript_history),
                "barge_in_count": len(self.state.barge_in_events),
                "tool_calls_count": len(self.state.tool_calls),
            }
        
        # Playground endpoints
        @self.app.get("/api/playground/config")
        async def get_playground_config():
            return self.state.playground_config
        
        @self.app.post("/api/playground/config")
        async def update_playground_config(data: dict):
            self.state.playground_config.update(data)
            await self._broadcast({"type": "playground_config", "config": self.state.playground_config})
            return {"ok": True, "config": self.state.playground_config}
        
        @self.app.post("/api/playground/test")
        async def run_playground_test(data: dict):
            """Run a test conversation with current playground config."""
            test_id = f"test_{int(time.time() * 1000)}"
            test_input = data.get("text", "Hello, how are you?")
            
            self.state.playground_test_active = True
            test_result = {
                "test_id": test_id,
                "timestamp": time.time(),
                "input": test_input,
                "config_snapshot": self.state.playground_config.copy(),
                "status": "running",
            }
            self.state.playground_test_results.append(test_result)
            await self._broadcast({"type": "playground_test_start", "test": test_result})
            
            # Simulate test execution (in real implementation, would connect to main pipeline)
            await asyncio.sleep(0.5)
            
            # Update result
            test_result["status"] = "completed"
            test_result["latency_ms"] = 450
            test_result["output"] = "I'm doing well, thank you for asking!"
            await self._broadcast({"type": "playground_test_complete", "test": test_result})
            self.state.playground_test_active = False
            
            return {"ok": True, "test": test_result}
        
        @self.app.get("/api/playground/history")
        async def get_playground_history(limit: int = 50):
            return self.state.playground_test_results[-limit:]
        
        @self.app.get("/api/health")
        async def health():
            return {"status": "ok", "connections": len(self.state.active_connections)}
        
        @self.app.get("/api/metrics/percentiles")
        async def percentiles(window: int = 1000):
            return await self.metrics_collector.get_percentiles(window)
        
        @self.app.get("/api/metrics/recent")
        async def recent_turns(limit: int = 100):
            return await self.metrics_collector.get_recent_turns(limit)
        
        @self.app.get("/api/state")
        async def get_state():
            return {
                "session_id": self.state.current_session_id,
                "turn_id": self.state.current_turn_id,
                "transcript_count": len(self.state.transcript_history),
                "barge_in_count": len(self.state.barge_in_events),
                "tool_calls_count": len(self.state.tool_calls),
            }
        
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            await websocket.accept()
            self.state.active_connections.add(websocket)
            try:
                # Send initial state
                await websocket.send_json({
                    "type": "init",
                    "state": {
                        "session_id": self.state.current_session_id,
                        "turn_id": self.state.current_turn_id,
                    }
                })
                
                while True:
                    # Keep connection alive, handle incoming commands
                    data = await websocket.receive_json()
                    await self._handle_ws_message(websocket, data)
            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"Dashboard WS error: {e}")
            finally:
                self.state.active_connections.discard(websocket)
        
        # REST endpoints for external updates (called by main server)
        @self.app.post("/api/update/session")
        async def update_session(data: dict):
            self.state.current_session_id = data.get("session_id")
            self.state.current_turn_id = data.get("turn_id")
            await self._broadcast({"type": "session_update", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/turn")
        async def update_turn(data: dict):
            self.state.current_turn_id = data.get("turn_id")
            await self._broadcast({"type": "turn_update", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/audio")
        async def update_audio(data: dict):
            """Receive audio level data for waveform."""
            track = data.get("track")  # "user" or "agent"
            level = data.get("level", 0.0)
            if track == "user":
                self.state.audio_buffer_user.append(level)
                if len(self.state.audio_buffer_user) > 200:
                    self.state.audio_buffer_user.pop(0)
            elif track == "agent":
                self.state.audio_buffer_agent.append(level)
                if len(self.state.audio_buffer_agent) > 200:
                    self.state.audio_buffer_agent.pop(0)
            await self._broadcast({"type": "audio_level", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/transcript")
        async def update_transcript(data: dict):
            self.state.transcript_history.append({
                "timestamp": time.time(),
                **data,
            })
            if len(self.state.transcript_history) > 500:
                self.state.transcript_history.pop(0)
            await self._broadcast({"type": "transcript", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/barge_in")
        async def update_barge_in(data: dict):
            self.state.barge_in_events.append({
                "timestamp": time.time(),
                **data,
            })
            await self._broadcast({"type": "barge_in", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/tool_call")
        async def update_tool_call(data: dict):
            self.state.tool_calls.append({
                "timestamp": time.time(),
                **data,
            })
            await self._broadcast({"type": "tool_call", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/metrics")
        async def update_metrics(data: dict):
            """Record turn metrics from main server."""
            metrics = TurnMetrics(
                turn_id=data.get("turn_id", ""),
                session_id=data.get("session_id", ""),
                vad_ms=data.get("vad_ms", 0),
                asr_ms=data.get("asr_ms", 0),
                ttft_ms=data.get("ttft_ms", 0),
                tts_first_chunk_ms=data.get("tts_first_chunk_ms", 0),
                e2e_ms=data.get("e2e_ms", 0),
                tool_exec_ms=data.get("tool_exec_ms", 0),
                tts_streaming_ms=data.get("tts_streaming_ms", 0),
                interruption_count=data.get("interruption_count", 0),
                metadata=data.get("metadata", {}),
            )
            await get_metrics_collector().record(metrics)
            await self._broadcast({"type": "metrics", **data})
            return {"ok": True}
        
        # Playground WS message handling
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            await websocket.accept()
            self.state.active_connections.add(websocket)
            try:
                # Send initial state
                await websocket.send_json({
                    "type": "init",
                    "state": {
                        "session_id": self.state.current_session_id,
                        "turn_id": self.state.current_turn_id,
                    }
                })
                
                while True:
                    # Keep connection alive, handle incoming commands
                    data = await websocket.receive_json()
                    await self._handle_ws_message(websocket, data)
            except WebSocketDisconnect:
                pass
            except Exception as e:
                print(f"Dashboard WS error: {e}")
            finally:
                self.state.active_connections.discard(websocket)
        
        # REST endpoints for external updates (called by main server)
        @self.app.post("/api/update/session")
        async def update_session(data: dict):
            self.state.current_session_id = data.get("session_id")
            self.state.current_turn_id = data.get("turn_id")
            await self._broadcast({"type": "session_update", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/turn")
        async def update_turn(data: dict):
            self.state.current_turn_id = data.get("turn_id")
            await self._broadcast({"type": "turn_update", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/audio")
        async def update_audio(data: dict):
            """Receive audio level data for waveform."""
            track = data.get("track")  # "user" or "agent"
            level = data.get("level", 0.0)
            if track == "user":
                self.state.audio_buffer_user.append(level)
                if len(self.state.audio_buffer_user) > 200:
                    self.state.audio_buffer_user.pop(0)
            elif track == "agent":
                self.state.audio_buffer_agent.append(level)
                if len(self.state.audio_buffer_agent) > 200:
                    self.state.audio_buffer_agent.pop(0)
            await self._broadcast({"type": "audio_level", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/transcript")
        async def update_transcript(data: dict):
            self.state.transcript_history.append({
                "timestamp": time.time(),
                **data,
            })
            if len(self.state.transcript_history) > 500:
                self.state.transcript_history.pop(0)
            await self._broadcast({"type": "transcript", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/barge_in")
        async def update_barge_in(data: dict):
            self.state.barge_in_events.append({
                "timestamp": time.time(),
                **data,
            })
            await self._broadcast({"type": "barge_in", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/tool_call")
        async def update_tool_call(data: dict):
            self.state.tool_calls.append({
                "timestamp": time.time(),
                **data,
            })
            await self._broadcast({"type": "tool_call", **data})
            return {"ok": True}
        
        @self.app.post("/api/update/metrics")
        async def update_metrics(data: dict):
            """Record turn metrics from main server."""
            metrics = TurnMetrics(
                turn_id=data.get("turn_id", ""),
                session_id=data.get("session_id", ""),
                vad_ms=data.get("vad_ms", 0),
                asr_ms=data.get("asr_ms", 0),
                ttft_ms=data.get("ttft_ms", 0),
                tts_first_chunk_ms=data.get("tts_first_chunk_ms", 0),
                e2e_ms=data.get("e2e_ms", 0),
                tool_exec_ms=data.get("tool_exec_ms", 0),
                tts_streaming_ms=data.get("tts_streaming_ms", 0),
                interruption_count=data.get("interruption_count", 0),
                metadata=data.get("metadata", {}),
            )
            await get_metrics_collector().record(metrics)
            await self._broadcast({"type": "metrics", **data})
            return {"ok": True}
    
    async def _handle_ws_message(self, websocket: WebSocket, data: dict) -> None:
        """Handle incoming dashboard commands."""
        msg_type = data.get("type")
        
        if msg_type == "get_history":
            limit = data.get("limit", 100)
            turns = await self.metrics_collector.get_recent_turns(limit)
            await websocket.send_json({"type": "history", "turns": turns})
        
        elif msg_type == "get_percentiles":
            window = data.get("window", 1000)
            percentiles = await self.metrics_collector.get_percentiles(window)
            await websocket.send_json({"type": "percentiles", "data": percentiles})
        
        elif msg_type == "get_playground_config":
            await websocket.send_json({"type": "playground_config", "config": self.state.playground_config})
        
        elif msg_type == "update_playground_config":
            self.state.playground_config.update(data.get("config", {}))
            await self._broadcast({"type": "playground_config", "config": self.state.playground_config})
    
    async def _broadcast(self, message: dict) -> None:
        """Broadcast message to all connected clients."""
        dead = set()
        for ws in self.state.active_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        
        for ws in dead:
            self.state.active_connections.discard(ws)


# Create global dashboard instance
dashboard = DashboardServer()
app = dashboard.app

# Dashboard HTML with real-time visualization and Playground
DASHBOARD_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VoiceAI Live Dashboard</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
        .header { background: #1e293b; padding: 1rem 2rem; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; font-weight: 600; }
        .status { display: flex; gap: 1rem; align-items: center; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }
        .status-dot.disconnected { background: #ef4444; }
        .tabs { display: flex; gap: 0; background: #1e293b; border-bottom: 1px solid #334155; padding: 0 2rem; }
        .tab { padding: 1rem 1.5rem; cursor: pointer; color: #94a3b8; font-weight: 500; border-bottom: 3px solid transparent; transition: all 0.2s; }
        .tab:hover { color: #e2e8f0; background: #334155; }
        .tab.active { color: #60a5fa; border-bottom-color: #60a5fa; }
        .tab-content { display: none; padding: 1.5rem; max-width: 1800px; margin: 0 auto; }
        .tab-content.active { display: block; animation: fadeIn 0.2s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        @media (max-width: 1200px) { .grid { grid-template-columns: 1fr; } }
        .card { background: #1e293b; border-radius: 8px; padding: 1.5rem; border: 1px solid #334155; margin-bottom: 1.5rem; }
        .card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .waveform { height: 200px; background: #0f172a; border-radius: 6px; position: relative; overflow: hidden; }
        .waveform canvas { width: 100%; height: 100%; display: block; }
        .waveform-labels { display: flex; justify-content: space-between; margin-top: 0.5rem; font-size: 0.75rem; color: #64748b; }
        .metric-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #334155; }
        .metric-row:last-child { border-bottom: none; }
        .metric-label { color: #94a3b8; }
        .metric-value { font-weight: 600; font-family: monospace; }
        .metric-value.warning { color: #fbbf24; }
        .metric-value.danger { color: #ef4444; }
        .metric-value.ok { color: #22c55e; }
        .transcript-list { max-height: 300px; overflow-y: auto; }
        .transcript-item { padding: 0.5rem; border-bottom: 1px solid #334155; font-size: 0.875rem; }
        .transcript-item:last-child { border-bottom: none; }
        .transcript-role { font-weight: 600; margin-right: 0.5rem; }
        .transcript-role.user { color: #60a5fa; }
        .transcript-role.assistant { color: #4ade80; }
        .transcript-role.system { color: #fbbf24; }
        .transcript-text { color: #cbd5e1; }
        .barge-in-badge { background: #ef4444; color: white; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.75rem; margin-left: 0.5rem; }
        .tool-call { padding: 0.5rem; background: #1e293b; border-radius: 6px; margin-bottom: 0.5rem; font-size: 0.875rem; }
        .tool-call-name { font-weight: 600; color: #60a5fa; }
        .tool-call-status { margin-left: 0.5rem; padding: 0.125rem 0.5rem; border-radius: 4px; font-size: 0.7rem; }
        .tool-call-status.success { background: #22c55e; }
        .tool-call-status.fallback { background: #fbbf24; }
        .tool-call-status.error { background: #ef4444; }
        .percentile-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
        .percentile-item { background: #0f172a; padding: 0.75rem; border-radius: 6px; }
        .percentile-label { font-size: 0.75rem; color: #94a3b8; }
        .percentile-value { font-size: 1.25rem; font-weight: 600; font-family: monospace; }
        
        /* Playground styles */
        .playground-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        @media (max-width: 1000px) { .playground-grid { grid-template-columns: 1fr; } }
        .playground-panel { background: #1e293b; border-radius: 8px; padding: 1.5rem; border: 1px solid #334155; }
        .playground-panel h3 { font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }
        .form-group { margin-bottom: 1rem; }
        .form-label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.5rem; }
        .form-input, .form-select, .form-textarea { width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 0.75rem; color: #e2e8f0; font-family: inherit; font-size: 0.875rem; }
        .form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: #60a5fa; }
        .form-textarea { min-height: 150px; resize: vertical; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.8rem; }
        .btn { padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; font-size: 0.875rem; transition: all 0.2s; }
        .btn-primary { background: #2563eb; color: white; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-secondary { background: #334155; color: #e2e8f0; }
        .btn-secondary:hover { background: #475569; }
        .btn-success { background: #16a34a; color: white; }
        .btn-success:hover { background: #15803d; }
        .btn-group { display: flex; gap: 0.75rem; margin-top: 1rem; }
        .playground-output { background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 1rem; min-height: 200px; max-height: 400px; overflow-y: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 0.8rem; white-space: pre-wrap; }
        .output-entry { margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid #334155; }
        .output-entry:last-child { border-bottom: none; }
        .output-label { font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.25rem; }
        .output-text { color: #cbd5e1; }
        .output-meta { font-size: 0.7rem; color: #64748b; margin-top: 0.25rem; }
        .slider-group { display: flex; align-items: center; gap: 1rem; }
        .slider-group input[type="range"] { flex: 1; accent-color: #2563eb; }
        .slider-value { min-width: 60px; text-align: right; font-family: monospace; color: #60a5fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>VoiceAI Live Dashboard</h1>
        <div class="status">
            <span class="status-dot" id="statusDot"></span>
            <span id="statusText">Connecting...</span>
            <span id="sessionInfo"></span>
        </div>
    </div>
    <nav class="tabs">
        <button class="tab active" data-tab="monitor">📊 Monitor</button>
        <button class="tab" data-tab="playground">🧪 Playground</button>
        <button class="tab" data-tab="inspector">🔍 Inspector</button>
    </nav>
    
    <!-- Monitor Tab -->
    <div class="tab-content active" id="tab-monitor">
        <div class="grid">
            <!-- Audio Waveforms -->
            <div class="card">
                <h2>Audio Waveforms</h2>
                <div class="waveform">
                    <canvas id="waveformUser"></canvas>
                    <canvas id="waveformAgent" style="position: absolute; top: 0; left: 0; opacity: 0.7;"></canvas>
                </div>
                <div class="waveform-labels">
                    <span>👤 User</span>
                    <span>🤖 Agent</span>
                </div>
            </div>
            
            <!-- Live Metrics -->
            <div class="card">
                <h2>Live Latency Metrics</h2>
                <div id="liveMetrics">
                    <div class="metric-row">
                        <span class="metric-label">VAD</span>
                        <span class="metric-value" id="vadLatency">-</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">ASR</span>
                        <span class="metric-value" id="asrLatency">-</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">TTFT (LLM)</span>
                        <span class="metric-value" id="ttftLatency">-</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">TTS First Chunk</span>
                        <span class="metric-value" id="ttsFirstLatency">-</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">E2E</span>
                        <span class="metric-value" id="e2eLatency">-</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Interruptions</span>
                        <span class="metric-value" id="interruptCount">0</span>
                    </div>
                </div>
            </div>
            
            <!-- Percentiles -->
            <div class="card">
                <h2>Percentiles (Last 1000 Turns)</h2>
                <div class="percentile-grid" id="percentileGrid">
                    <div class="percentile-item">
                        <div class="percentile-label">VAD P50</div>
                        <div class="percentile-value" id="vadP50">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">VAD P95</div>
                        <div class="percentile-value" id="vadP95">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">ASR P50</div>
                        <div class="percentile-value" id="asrP50">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">ASR P95</div>
                        <div class="percentile-value" id="asrP95">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">TTFT P50</div>
                        <div class="percentile-value" id="ttftP50">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">TTFT P95</div>
                        <div class="percentile-value" id="ttftP95">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">E2E P50</div>
                        <div class="percentile-value" id="e2eP50">-</div>
                    </div>
                    <div class="percentile-item">
                        <div class="percentile-label">E2E P95</div>
                        <div class="percentile-value" id="e2eP95">-</div>
                    </div>
                </div>
            </div>
            
            <!-- Live Transcript -->
            <div class="card" style="grid-column: 1 / -1;">
                <h2>Live Transcript</h2>
                <div class="transcript-list" id="transcriptList"></div>
            </div>
            
            <!-- Barge-in Events -->
            <div class="card">
                <h2>Barge-in Events</h2>
                <div id="bargeInList" style="max-height: 200px; overflow-y: auto;"></div>
            </div>
            
            <!-- Tool Calls -->
            <div class="card">
                <h2>Tool Calls</h2>
                <div id="toolCallList" style="max-height: 200px; overflow-y: auto;"></div>
            </div>
        </div>
    </div>
    
    <!-- Playground Tab -->
    <div class="tab-content" id="tab-playground">
        <div class="playground-grid">
            <!-- Configuration Panel -->
            <div class="playground-panel">
                <h3>Voice & Model Configuration</h3>
                
                <div class="form-group">
                    <label class="form-label">Voice ID</label>
                    <input type="text" class="form-input" id="voiceId" placeholder="Voice ID">
                </div>
                
                <div class="form-group">
                    <label class="form-label">LLM Model</label>
                    <select class="form-select" id="llmModel">
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label class="form-label">LLM Temperature <span id="tempValue">0.3</span></label>
                    <div class="slider-group">
                        <input type="range" class="form-input" id="llmTemperature" min="0" max="1" step="0.1" value="0.3">
                        <span class="slider-value" id="tempValueDisplay">0.3</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">VAD Threshold <span id="vadThresholdValue">0.6</span></label>
                    <div class="slider-group">
                        <input type="range" class="form-input" id="vadThreshold" min="0.1" max="0.9" step="0.05" value="0.6">
                        <span class="slider-value" id="vadThresholdDisplay">0.6</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">SOS Debounce (ms) <span id="sosDebounceValue">120</span></label>
                    <div class="slider-group">
                        <input type="range" class="form-input" id="sosDebounce" min="50" max="300" step="10" value="120">
                        <span class="slider-value" id="sosDebounceDisplay">120</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">EOS Timeout (ms) <span id="eosTimeoutValue">500</span></label>
                    <div class="slider-group">
                        <input type="range" class="form-input" id="eosTimeout" min="200" max="1000" step="50" value="500">
                        <span class="slider-value" id="eosTimeoutDisplay">500</span>
                    </div>
                </div>
                
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="savePlaygroundConfig()">Save Config</button>
                    <button class="btn btn-secondary" onclick="resetPlaygroundConfig()">Reset</button>
                </div>
            </div>
            
            <!-- System Prompt Panel -->
            <div class="playground-panel">
                <h3>System Prompt</h3>
                <textarea class="form-textarea" id="systemPrompt" placeholder="Enter system prompt..."></textarea>
                <div class="btn-group">
                    <button class="btn btn-primary" onclick="saveSystemPrompt()">Save Prompt</button>
                    <button class="btn btn-secondary" onclick="resetSystemPrompt()">Reset to Default</button>
                </div>
            </div>
        </div>
        
        <!-- Test Panel -->
        <div class="card" style="grid-column: 1 / -1; margin-top: 1.5rem;">
            <h3>Test Conversation</h3>
            <div class="playground-grid">
                <div class="playground-panel">
                    <h3>Test Input</h3>
                    <textarea class="form-textarea" id="testInput" placeholder="Enter test message..." rows="4">Hello, how are you?</textarea>
                    <div class="btn-group">
                        <button class="btn btn-success" onclick="runPlaygroundTest()">Run Test</button>
                        <button class="btn btn-secondary" onclick="clearTestHistory()">Clear History</button>
                    </div>
                </div>
                
                <div class="playground-panel">
                    <h3>Test Output</h3>
                    <div class="playground-output" id="testOutput"></div>
                </div>
            </div>
            
            <!-- Test History -->
            <div class="card" style="margin-top: 1.5rem;">
                <h3>Test History</h3>
                <div class="playground-output" id="testHistory"></div>
            </div>
        </div>
    </div>
    
    <!-- Inspector Tab -->
    <div class="tab-content" id="tab-inspector">
        <div class="grid">
            <!-- Live Transcript -->
            <div class="card" style="grid-column: 1 / -1;">
                <h2>Live Transcript Inspector</h2>
                <div class="transcript-list" id="transcriptList"></div>
            </div>
            
            <!-- Barge-in Events -->
            <div class="card">
                <h2>Barge-in Events</h2>
                <div id="bargeInList" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            
            <!-- Tool Calls -->
            <div class="card">
                <h2>Tool Calls Inspector</h2>
                <div id="toolCallList" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
            
            <!-- Session Metrics -->
            <div class="card">
                <h2>Session Metrics Detail</h2>
                <div class="percentile-grid" id="detailPercentileGrid"></div>
            </div>
        </div>
    </div>

    <script>
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            });
        });
        
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const sessionInfo = document.getElementById('sessionInfo');
        
        // Waveform canvases
        const canvasUser = document.getElementById('waveformUser');
        const canvasAgent = document.getElementById('waveformAgent');
        const ctxUser = canvasUser.getContext('2d');
        const ctxAgent = canvasAgent.getContext('2d');
        
        let userBuffer = [];
        let agentBuffer = [];
        let waveformWidth = 0;
        
        function resizeCanvases() {
            const rect = canvasUser.parentElement.getBoundingClientRect();
            waveformWidth = rect.width;
            canvasUser.width = rect.width * devicePixelRatio;
            canvasUser.height = rect.height * devicePixelRatio;
            canvasAgent.width = rect.width * devicePixelRatio;
            canvasAgent.height = rect.height * devicePixelRatio;
            ctxUser.scale(devicePixelRatio, devicePixelRatio);
            ctxAgent.scale(devicePixelRatio, devicePixelRatio);
        }
        
        function drawWaveform(ctx, buffer, color) {
            if (!ctx || buffer.length === 0) return;
            const width = canvasUser.width / devicePixelRatio;
            const height = canvasUser.height / devicePixelRatio;
            ctx.clearRect(0, 0, width, height);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const step = width / Math.max(buffer.length, 1);
            buffer.forEach((val, i) => {
                const x = i * step;
                const y = height / 2 - val * height / 3;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }
        
        function animateWaveform() {
            resizeCanvases();
            drawWaveform(ctxUser, userBuffer, '#60a5fa');
            drawWaveform(ctxAgent, agentBuffer, '#4ade80');
            requestAnimationFrame(animateWaveform);
        }
        
        ws.onopen = () => {
            statusDot.classList.remove('disconnected');
            statusText.textContent = 'Connected';
        };
        
        ws.onclose = () => {
            statusDot.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
        };
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
        };
        
        function handleMessage(msg) {
            switch (msg.type) {
                case 'init':
                    if (msg.state.session_id) {
                        sessionInfo.textContent = `Session: ${msg.state.session_id}`;
                    }
                    if (msg.playground_config) {
                        loadPlaygroundConfig(msg.playground_config);
                    }
                    break;
                case 'audio_level':
                    if (msg.track === 'user') {
                        userBuffer.push(msg.level);
                        if (userBuffer.length > 200) userBuffer.shift();
                    } else if (msg.track === 'agent') {
                        agentBuffer.push(msg.level);
                        if (agentBuffer.length > 200) agentBuffer.shift();
                    }
                    break;
                case 'transcript':
                    addTranscript(msg);
                    break;
                case 'barge_in':
                    addBargeIn(msg);
                    break;
                case 'tool_call':
                    addToolCall(msg);
                    break;
                case 'metrics':
                    updateLiveMetrics(msg);
                    break;
                case 'session_update':
                    if (msg.session_id) {
                        sessionInfo.textContent = `Session: ${msg.session_id}`;
                    }
                    break;
                case 'percentiles':
                    updatePercentiles(msg.data);
                    break;
                case 'history':
                    renderHistory(msg.turns);
                    break;
                case 'playground_config':
                    loadPlaygroundConfig(msg.config);
                    break;
                case 'playground_test_start':
                    addTestOutput(msg.test, 'running');
                    break;
                case 'playground_test_complete':
                    updateTestOutput(msg.test, 'completed');
                    addTestToHistory(msg.test);
                    break;
                case 'playground_test_results':
                    renderTestHistory(msg.tests);
                    break;
            }
        }
        
        // Playground config handling
        function loadPlaygroundConfig(config) {
            if (!config) return;
            document.getElementById('voiceId').value = config.voice_id || '';
            document.getElementById('llmModel').value = config.llm_model || 'gpt-4o-mini';
            document.getElementById('llmTemperature').value = config.llm_temperature || 0.3;
            document.getElementById('tempValueDisplay').textContent = config.llm_temperature || 0.3;
            document.getElementById('vadThreshold').value = config.vad_threshold || 0.6;
            document.getElementById('vadThresholdDisplay').textContent = config.vad_threshold || 0.6;
            document.getElementById('sosDebounce').value = config.vad_sos_debounce_ms || 120;
            document.getElementById('sosDebounceDisplay').textContent = config.vad_sos_debounce_ms || 120;
            document.getElementById('eosTimeout').value = config.vad_eos_timeout_ms || 500;
            document.getElementById('eosTimeoutDisplay').textContent = config.vad_eos_timeout_ms || 500;
            document.getElementById('systemPrompt').value = config.system_prompt || '';
        }
        
        function savePlaygroundConfig() {
            const config = {
                voice_id: document.getElementById('voiceId').value,
                llm_model: document.getElementById('llmModel').value,
                llm_temperature: parseFloat(document.getElementById('llmTemperature').value),
                vad_threshold: parseFloat(document.getElementById('vadThreshold').value),
                vad_sos_debounce_ms: parseInt(document.getElementById('sosDebounce').value),
                vad_eos_timeout_ms: parseInt(document.getElementById('eosTimeout').value),
            };
            ws.send(JSON.stringify({type: 'update_playground_config', config}));
        }
        
        function resetPlaygroundConfig() {
            fetch('/api/playground/config').then(r => r.json()).then(config => {
                loadPlaygroundConfig(config);
            });
        }
        
        function saveSystemPrompt() {
            const prompt = document.getElementById('systemPrompt').value;
            ws.send(JSON.stringify({type: 'update_playground_config', config: {system_prompt: prompt}}));
        }
        
        function resetSystemPrompt() {
            fetch('/api/playground/config').then(r => r.json()).then(config => {
                document.getElementById('systemPrompt').value = config.system_prompt || '';
            });
        }
        
        // Slider value updates
        document.getElementById('llmTemperature').addEventListener('input', (e) => {
            document.getElementById('tempValueDisplay').textContent = e.target.value;
        });
        document.getElementById('vadThreshold').addEventListener('input', (e) => {
            document.getElementById('vadThresholdDisplay').textContent = e.target.value;
        });
        document.getElementById('sosDebounce').addEventListener('input', (e) => {
            document.getElementById('sosDebounceDisplay').textContent = e.target.value;
        });
        document.getElementById('eosTimeout').addEventListener('input', (e) => {
            document.getElementById('eosTimeoutDisplay').textContent = e.target.value;
        });
        
        // Playground test
        async function runPlaygroundTest() {
            const input = document.getElementById('testInput').value;
            if (!input.trim()) return;
            
            const btn = event.target;
            btn.disabled = true;
            btn.textContent = 'Running...';
            
            const res = await fetch('/api/playground/test', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({text: input})
            });
            const data = await res.json();
            
            btn.disabled = false;
            btn.textContent = 'Run Test';
        }
        
        function addTestOutput(test, status) {
            const output = document.getElementById('testOutput');
            const entry = document.createElement('div');
            entry.className = 'output-entry';
            entry.id = 'test-' + test.test_id;
            const statusBadge = status === 'running' 
                ? '<span style="color:#fbbf24">● Running...</span>'
                : '<span style="color:#22c55e">● Completed</span>';
            entry.innerHTML = `
                <div class="output-label">Test ${test.test_id} ${statusBadge}</div>
                <div class="output-text">${status === 'running' ? 'Processing...' : test.output || 'No output'}</div>
                <div class="output-meta">Input: ${test.input} | Latency: ${test.latency_ms || '?'}ms</div>
            `;
            output.insertBefore(entry, output.firstChild);
        }
        
        function updateTestOutput(test, status) {
            const entry = document.getElementById('test-' + test.test_id);
            if (entry) {
                entry.innerHTML = `
                    <div class="output-label">Test ${test.test_id} <span style="color:#22c55e">● Completed</span></div>
                    <div class="output-text">${test.output || 'No output'}</div>
                    <div class="output-meta">Input: ${test.input} | Latency: ${test.latency_ms}ms</div>
                `;
            }
        }
        
        function addTestToHistory(test) {
            const history = document.getElementById('testHistory');
            const entry = document.createElement('div');
            entry.className = 'output-entry';
            entry.innerHTML = `
                <div class="output-label">${new Date(test.timestamp * 1000).toLocaleTimeString()} - Test ${test.test_id}</div>
                <div class="output-text">Input: ${test.input}</div>
                <div class="output-meta">Latency: ${test.latency_ms}ms | Output: ${test.output?.substring(0, 50) || '...'}</div>
            `;
            history.insertBefore(entry, history.firstChild);
        }
        
        function clearTestHistory() {
            document.getElementById('testOutput').innerHTML = '';
            document.getElementById('testHistory').innerHTML = '';
        }
        
        async function renderTestHistory(tests) {
            const history = document.getElementById('testHistory');
            history.innerHTML = '';
            tests.slice().reverse().forEach(test => {
                if (test.status === 'completed') {
                    addTestToHistory(test);
                }
            });
        }
        
        function renderHistory(turns) {
            // Could render full history in inspector
        }
        
        function addTranscript(msg) {
            const list = document.getElementById('transcriptList');
            const item = document.createElement('div');
            item.className = 'transcript-item';
            const roleClass = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'system';
            const roleLabel = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Agent' : '⚙️ System';
            const isFinal = msg.is_final ? '' : ' <span class="barge-in-badge">interim</span>';
            item.innerHTML = `<span class="transcript-role ${roleClass}">${roleLabel}</span><span class="transcript-text">${msg.text}${isFinal}</span>`;
            list.appendChild(item);
            list.scrollTop = list.scrollHeight;
        }
        
        function addBargeIn(msg) {
            const list = document.getElementById('bargeInList');
            const item = document.createElement('div');
            item.className = 'transcript-item';
            item.style.borderLeft = '3px solid #ef4444';
            item.innerHTML = `<strong>🚨 Barge-in</strong> at ${new Date(msg.timestamp * 1000).toLocaleTimeString()} <span class="barge-in-badge">INTERRUPT</span>`;
            list.insertBefore(item, list.firstChild);
        }
        
        function addToolCall(msg) {
            const list = document.getElementById('toolCallList');
            const item = document.createElement('div');
            item.className = 'tool-call';
            const statusClass = msg.status === 'success' ? 'success' : msg.status === 'fallback' ? 'fallback' : 'error';
            const statusText = msg.status || 'pending';
            item.innerHTML = `<span class="tool-call-name">${msg.tool_name}</span> <span class="tool-call-status ${statusClass}">${statusText}</span><br><small>Args: ${JSON.stringify(msg.args)}</small>`;
            list.insertBefore(item, list.firstChild);
        }
        
        function updateLiveMetrics(msg) {
            document.getElementById('vadLatency').textContent = msg.vad_ms ? `${msg.vad_ms.toFixed(1)}ms` : '-';
            document.getElementById('asrLatency').textContent = msg.asr_ms ? `${msg.asr_ms.toFixed(1)}ms` : '-';
            document.getElementById('ttftLatency').textContent = msg.ttft_ms ? `${msg.ttft_ms.toFixed(1)}ms` : '-';
            document.getElementById('ttsFirstLatency').textContent = msg.tts_first_chunk_ms ? `${msg.tts_first_chunk_ms.toFixed(1)}ms` : '-';
            document.getElementById('e2eLatency').textContent = msg.e2e_ms ? `${msg.e2e_ms.toFixed(1)}ms` : '-';
            document.getElementById('interruptCount').textContent = msg.interruption_count || 0;
            
            // Color code E2E
            const e2eEl = document.getElementById('e2eLatency');
            if (msg.e2e_ms) {
                if (msg.e2e_ms < 500) e2eEl.className = 'metric-value ok';
                else if (msg.e2e_ms < 800) e2eEl.className = 'metric-value warning';
                else e2eEl.className = 'metric-value danger';
            }
        }
        
        async function fetchPercentiles() {
            try {
                const resp = await fetch('/api/metrics/percentiles?window=1000');
                const data = await resp.json();
                updatePercentiles(data);
            } catch (e) {
                console.error('Failed to fetch percentiles:', e);
            }
        }
        
        function updatePercentiles(data) {
            if (!data) return;
            document.getElementById('vadP50').textContent = data.vad_p50 ? `${data.vad_p50.toFixed(1)}ms` : '-';
            document.getElementById('vadP95').textContent = data.vad_p95 ? `${data.vad_p95.toFixed(1)}ms` : '-';
            document.getElementById('asrP50').textContent = data.asr_p50 ? `${data.asr_p50.toFixed(1)}ms` : '-';
            document.getElementById('asrP95').textContent = data.asr_p95 ? `${data.asr_p95.toFixed(1)}ms` : '-';
            document.getElementById('ttftP50').textContent = data.ttft_p50 ? `${data.ttft_p50.toFixed(1)}ms` : '-';
            document.getElementById('ttftP95').textContent = data.ttft_p95 ? `${data.ttft_p95.toFixed(1)}ms` : '-';
            document.getElementById('e2eP50').textContent = data.e2e_p50 ? `${data.e2e_p50.toFixed(1)}ms` : '-';
            document.getElementById('e2eP95').textContent = data.e2e_p95 ? `${data.e2e_p95.toFixed(1)}ms` : '-';
        }
        
        // Initial fetch and periodic refresh
        fetchPercentiles();
        setInterval(fetchPercentiles, 10000);
        
        // Start animation
        animateWaveform();
        window.addEventListener('resize', resizeCanvases);
        
        // Init sliders
        document.getElementById('llmTemperature').addEventListener('input', (e) => {
            document.getElementById('tempValueDisplay').textContent = e.target.value;
        });
        document.getElementById('vadThreshold').addEventListener('input', (e) => {
            document.getElementById('vadThresholdDisplay').textContent = e.target.value;
        });
        document.getElementById('sosDebounce').addEventListener('input', (e) => {
            document.getElementById('sosDebounceDisplay').textContent = e.target.value;
        });
        document.getElementById('eosTimeout').addEventListener('input', (e) => {
            document.getElementById('eosTimeoutDisplay').textContent = e.target.value;
        });
    </script>
</body>
</html>
"""