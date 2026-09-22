from __future__ import annotations

import asyncio
import base64
import json
import random
import time
import uuid
from typing import Any

from locust import HttpUser, TaskSet, between, task
from locust.env import Environment
from locust.log import setup_logging

from server.app.audio.utils import float32_to_pcm16
from server.app.transport.ws_protocol import (
    ControlType,
    FrameType,
    create_audio_frame,
    create_control_frame,
    parse_frame,
)


class VoiceAIWebSocketUser(HttpUser):
    """Locust user simulating a VoiceAI WebSocket conversation."""
    
    wait_time = between(1, 3)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ws = None
        self.session_id = None
        self.sequence = 0
        self.audio_buffer = []
        self.is_connected = False
        self.test_phrases = [
            "Hello, how are you today?",
            "What's the weather like?",
            "Can you help me book a flight?",
            "What time is it?",
            "Tell me a joke",
            "I need to check my booking",
            "Transfer me to support",
            "What's the temperature?",
            "Goodbye",
            "Thank you",
        ]
    
    def on_start(self):
        """Initialize WebSocket connection."""
        import websocket
        
        self.sequence = 0
        self.ws = websocket.create_connection(
            f"ws://{self.host}/ws",
            timeout=10,
        )
        self.ws.settimeout(5)
        
        # Wait for session start
        msg = self.ws.recv()
        parsed = parse_frame(msg)
        if parsed:
            frame_type, seq, payload = parsed
            if frame_type == FrameType.CONTROL:
                control = json.loads(payload.decode())
                if control.get("type") == ControlType.SESSION_START:
                    self.session_id = control.get("payload", {}).get("session_id")
                    self.is_connected = True
    
    def on_stop(self):
        """Close WebSocket connection."""
        if self.ws:
            self.ws.close()
    
    def _send_audio(self, audio_bytes: bytes):
        """Send audio frame via WebSocket."""
        if self.ws and self.is_connected:
            frame = create_audio_frame(audio_bytes, self.sequence)
            self.sequence += 1
            self.ws.send_binary(frame)
    
    def _send_control(self, control_type: str, payload: dict):
        """Send control frame via WebSocket."""
        if self.ws and self.is_connected:
            frame = create_control_frame(control_type, payload, self.sequence)
            self.sequence += 1
            self.ws.send_binary(frame)
    
    def _receive_message(self, timeout: float = 2.0):
        """Receive and parse a message."""
        if not self.ws:
            return None
        
        try:
            self.ws.settimeout(timeout)
            msg = self.ws.recv()
            return parse_frame(msg)
        except Exception:
            return None
    
    def _generate_test_audio(self, duration_ms: int = 3000) -> bytes:
        """Generate synthetic test audio (sine wave)."""
        import numpy as np
        
        sample_rate = 16000
        duration = duration_ms / 1000.0
        t = np.linspace(0, duration, int(sample_rate * duration))
        # Mix of frequencies to simulate speech
        signal = (
            0.3 * np.sin(2 * np.pi * 440 * t) +  # A4
            0.2 * np.sin(2 * np.pi * 880 * t) +  # A5
            0.1 * np.sin(2 * np.pi * 220 * t)    # A3
        )
        # Normalize and convert to PCM16
        signal = np.clip(signal, -1.0, 1.0)
        pcm16 = (signal * 32767).astype(np.int16)
        return pcm16.tobytes()
    
    @task(5)
    def conversation_turn(self):
        """Simulate a complete conversation turn."""
        if not self.is_connected:
            return
        
        # 1. Send START_SPEAKING
        self._send_control(ControlType.START_SPEAKING, {})
        
        # 2. Send audio chunks (simulate user speaking for 2-3 seconds)
        audio = self._generate_test_audio(random.randint(2000, 3000))
        chunk_size = 960  # 30ms at 16kHz
        
        for i in range(0, len(audio), chunk_size):
            chunk = audio[i:i+chunk_size]
            if len(chunk) == chunk_size:
                self._send_audio(chunk)
                time.sleep(0.03)  # 30ms per chunk
        
        # 3. Send STOP_SPEAKING
        self._send_control(ControlType.STOP_SPEAKING, {})
        
        # 4. Wait for response (collect audio frames until STOP_SPEAKING)
        response_chunks = 0
        start_time = time.time()
        while time.time() - start_time < 10:  # Max 10 second wait
            parsed = self._receive_message(0.5)
            if not parsed:
                continue
            
            frame_type, seq, payload = parsed
            if frame_type == FrameType.AUDIO:
                response_chunks += 1
            elif frame_type == FrameType.CONTROL:
                control = json.loads(payload.decode())
                if control.get("type") == ControlType.STOP_SPEAKING:
                    break
        
        # Record metrics
        latency = (time.time() - start_time) * 1000
        self.environment.events.request.fire(
            request_type="WebSocket",
            name="conversation_turn",
            response_time=latency,
            response_length=response_chunks * 960,
            exception=None,
        )
    
    @task(1)
    def barge_in_test(self):
        """Test barge-in interruption."""
        if not self.is_connected:
            return
        
        # Start speaking
        self._send_control(ControlType.START_SPEAKING, {})
        
        # Send audio
        audio = self._generate_test_audio(2000)
        chunk_size = 960
        for i in range(0, len(audio), chunk_size):
            chunk = audio[i:i+chunk_size]
            if len(chunk) == chunk_size:
                self._send_audio(chunk)
                time.sleep(0.03)
        
        # Send STOP_SPEAKING
        self._send_control(ControlType.STOP_SPEAKING, {})
        
        # Immediately interrupt
        time.sleep(0.5)
        self._send_control(ControlType.INTERRUPT, {})
        
        # Should receive FLUSH_BUFFER quickly
        start = time.time()
        while time.time() - start < 2:
            parsed = self._receive_message(0.1)
            if parsed:
                frame_type, seq, payload = parsed
                if frame_type == FrameType.CONTROL:
                    control = json.loads(payload.decode())
                    if control.get("type") == ControlType.FLUSH_BUFFER:
                        latency = (time.time() - start) * 1000
                        self.environment.events.request.fire(
                            request_type="WebSocket",
                            name="barge_in",
                            response_time=latency,
                            response_length=0,
                            exception=None,
                        )
                        break
        
        # Send STOP_SPEAKING to clean up
        self._send_control(ControlType.STOP_SPEAKING, {})
    
    @task(1)
    def ping_test(self):
        """Test WebSocket ping/pong latency."""
        if not self.is_connected:
            return
        
        start = time.time()
        self._send_control(ControlType.PING, {})
        
        # Wait for PONG
        while time.time() - start < 2:
            parsed = self._receive_message(0.1)
            if parsed:
                frame_type, seq, payload = parsed
                if frame_type == FrameType.CONTROL:
                    control = json.loads(payload.decode())
                    if control.get("type") == ControlType.PONG:
                        latency = (time.time() - start) * 1000
                        self.environment.events.request.fire(
                            request_type="WebSocket",
                            name="ping",
                            response_time=latency,
                            response_length=0,
                            exception=None,
                        )
                        break


class VoiceAILoadTest(VoiceAIWebSocketUser):
    """Load test with higher concurrency."""
    wait_time = between(0.5, 1.5)


def run_load_test(
    users: int = 50,
    spawn_rate: int = 5,
    duration: int = 60,
    host: str = "localhost:8000",
) -> dict:
    """
    Run load test programmatically.
    
    Returns summary statistics.
    """
    import sys
    from locust import run_single_user
    
    # Run in subprocess for isolation
    import subprocess
    
    cmd = [
        sys.executable, "-m", "locust",
        "-f", __file__,
        "--host", f"ws://{host}",
        "--users", str(users),
        "--spawn-rate", str(spawn_rate),
        "--run-time", f"{duration}s",
        "--headless",
        "--csv", "load_test_results",
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=".")
    
    # Parse CSV results
    import pandas as pd
    try:
        stats = pd.read_csv("load_test_results_stats.csv")
        failures = pd.read_csv("load_test_results_failures.csv")
        
        return {
            "total_requests": stats["Request Count"].sum(),
            "failure_count": stats["Failure Count"].sum(),
            "avg_response_time": stats["Average Response Time"].mean(),
            "p95_response_time": stats["95th percentile"].max(),
            "requests_per_second": stats["Requests/s"].sum(),
            "failures": failures.to_dict("records") if not failures.empty else [],
        }
    except Exception:
        return {"error": "Could not parse results", "stdout": result.stdout, "stderr": result.stderr}


if __name__ == "__main__":
    # For running single user test
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "single":
        setup_logging("INFO", None)
        env = Environment(user_classes=[VoiceAIWebSocketUser])
        runner = env.create_local_runner()
        runner.start(1, spawn_rate=1)
        time.sleep(30)
        runner.quit()
    else:
        print("Run with: locust -f server/benchmark/locustfile.py --host=ws://localhost:8000")