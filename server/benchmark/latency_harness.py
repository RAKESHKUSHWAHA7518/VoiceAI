from __future__ import annotations

import asyncio
import statistics
import time
from dataclasses import dataclass

from server.app.telemetry.latency_spans import LatencyTracker


@dataclass
class BenchmarkResult:
    name: str
    iterations: int
    durations_ms: list[float]

    @property
    def p50(self) -> float:
        return statistics.median(self.durations_ms)

    @property
    def p95(self) -> float:
        sorted_d = sorted(self.durations_ms)
        idx = int(len(sorted_d) * 0.95)
        return sorted_d[min(idx, len(sorted_d) - 1)]

    @property
    def p99(self) -> float:
        sorted_d = sorted(self.durations_ms)
        idx = int(len(sorted_d) * 0.99)
        return sorted_d[min(idx, len(sorted_d) - 1)]

    @property
    def mean(self) -> float:
        return statistics.mean(self.durations_ms)

    @property
    def stdev(self) -> float:
        return statistics.stdev(self.durations_ms) if len(self.durations_ms) > 1 else 0.0


async def run_benchmark(name: str, iterations: int, coro_factory, *args, **kwargs) -> BenchmarkResult:
    durations = []
    for _ in range(iterations):
        start = time.perf_counter()
        await coro_factory(*args, **kwargs)
        durations.append((time.perf_counter() - start) * 1000)
    return BenchmarkResult(name, iterations, durations)


async def mock_vad():
    await asyncio.sleep(0.02)


async def mock_asr():
    await asyncio.sleep(0.15)


async def mock_llm():
    await asyncio.sleep(0.2)


async def mock_tts():
    await asyncio.sleep(0.1)


async def mock_pipeline():
    tracker = LatencyTracker("bench", "benchmark_session")
    with tracker.span("vad"):
        await mock_vad()
    with tracker.span("asr"):
        await mock_asr()
    with tracker.span("llm"):
        await mock_llm()
    with tracker.span("tts"):
        await mock_tts()


async def main():
    print("Running Phase 0 benchmarks...\n")

    results = []

    # Individual component benchmarks
    results.append(await run_benchmark("VAD (mock)", 100, mock_vad))
    results.append(await run_benchmark("ASR (mock)", 100, mock_asr))
    results.append(await run_benchmark("LLM (mock)", 100, mock_llm))
    results.append(await run_benchmark("TTS (mock)", 100, mock_tts))

    # Full pipeline
    results.append(await run_benchmark("Full Pipeline (mock)", 50, mock_pipeline))

    print(f"{'Component':<30} {'Iter':>5} {'Mean':>8} {'P50':>8} {'P95':>8} {'P99':>8} {'Stdev':>8}")
    print("-" * 85)
    for r in results:
        print(f"{r.name:<30} {r.iterations:>5} {r.mean:>8.2f} {r.p50:>8.2f} {r.p95:>8.2f} {r.p99:>8.2f} {r.stdev:>8.2f}")

    # Check against budgets
    print("\n--- Latency Budget Check (p95) ---")
    budgets = {
        "VAD (mock)": 70,
        "ASR (mock)": 300,
        "LLM (mock)": 250,
        "TTS (mock)": 150,
        "Full Pipeline (mock)": 600,
    }
    all_pass = True
    for r in results:
        budget = budgets.get(r.name, 9999)
        status = "PASS" if r.p95 <= budget else "FAIL"
        if status == "FAIL":
            all_pass = False
        print(f"  {r.name:<30} p95={r.p95:.2f}ms budget={budget}ms [{status}]")

    if all_pass:
        print("\nAll latency budgets met!")
    else:
        print("\nSome budgets exceeded - investigate.")

    return 0 if all_pass else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
