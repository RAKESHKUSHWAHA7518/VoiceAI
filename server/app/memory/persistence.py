from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import redis.asyncio as redis
import asyncpg

from server.app.config import settings
from server.app.memory.short_term import LongTermMemory, SlidingWindowMemory


@dataclass
class RedisSessionStore:
    """Redis-backed session state storage."""
    
    redis_client: redis.Redis
    ttl: int = 86400  # 24 hours
    
    async def save_session(self, session_id: str, data: dict) -> None:
        """Save session state to Redis."""
        key = f"session:{session_id}"
        payload = json.dumps(data)
        await self.redis_client.setex(key, self.ttl, payload)
    
    async def load_session(self, session_id: str) -> Optional[dict]:
        """Load session state from Redis."""
        key = f"session:{session_id}"
        data = await self.redis_client.get(key)
        if data:
            return json.loads(data)
        return None
    
    async def delete_session(self, session_id: str) -> None:
        """Delete session from Redis."""
        key = f"session:{session_id}"
        await self.redis_client.delete(key)
    
    async def save_memory(self, user_id: str, memory: LongTermMemory) -> None:
        """Save long-term memory to Redis."""
        key = f"memory:{user_id}"
        payload = {
            "profile": memory.profile,
            "preferences": memory.preferences,
            "session_summaries": memory.session_summaries,
            "created_at": memory.created_at,
            "updated_at": memory.updated_at,
        }
        await self.redis_client.set(key, json.dumps(payload))
    
    async def load_memory(self, user_id: str) -> Optional[LongTermMemory]:
        """Load long-term memory from Redis."""
        key = f"memory:{user_id}"
        data = await self.redis_client.get(key)
        if data:
            payload = json.loads(data)
            memory = LongTermMemory(user_id=user_id)
            memory.profile = payload.get("profile", {})
            memory.preferences = payload.get("preferences", {})
            memory.session_summaries = payload.get("session_summaries", [])
            memory.created_at = payload.get("created_at", time.time())
            memory.updated_at = payload.get("updated_at", time.time())
            return memory
        return None


class PostgresMemoryStore:
    """Postgres-backed long-term memory storage."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def init_schema(self) -> None:
        """Initialize database schema."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS user_profiles (
                    user_id TEXT PRIMARY KEY,
                    profile JSONB NOT NULL DEFAULT '{}',
                    preferences JSONB NOT NULL DEFAULT '{}',
                    session_summaries JSONB NOT NULL DEFAULT '[]',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_user_profiles_updated 
                ON user_profiles(updated_at DESC)
            """)
    
    async def save_memory(self, memory: LongTermMemory) -> None:
        """Save or update long-term memory."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO user_profiles (user_id, profile, preferences, session_summaries, created_at, updated_at)
                VALUES ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6))
                ON CONFLICT (user_id) DO UPDATE SET
                    profile = EXCLUDED.profile,
                    preferences = EXCLUDED.preferences,
                    session_summaries = EXCLUDED.session_summaries,
                    updated_at = to_timestamp($6)
            """, 
                memory.user_id,
                json.dumps(memory.profile),
                json.dumps(memory.preferences),
                json.dumps(memory.session_summaries),
                memory.created_at,
                memory.updated_at,
            )
    
    async def load_memory(self, user_id: str) -> Optional[LongTermMemory]:
        """Load long-term memory by user_id."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT user_id, profile, preferences, session_summaries, 
                       EXTRACT(EPOCH FROM created_at) as created_at,
                       EXTRACT(EPOCH FROM updated_at) as updated_at
                FROM user_profiles
                WHERE user_id = $1
            """, user_id)
            
            if row:
                memory = LongTermMemory(user_id=row["user_id"])
                memory.profile = row["profile"]
                memory.preferences = row["preferences"]
                memory.session_summaries = row["session_summaries"]
                memory.created_at = row["created_at"]
                memory.updated_at = row["updated_at"]
                return memory
        return None
    
    async def delete_memory(self, user_id: str) -> None:
        """Delete user memory."""
        async with self.pool.acquire() as conn:
            await conn.execute("DELETE FROM user_profiles WHERE user_id = $1", user_id)


class MemoryPersistenceManager:
    """
    Unified memory persistence combining Redis (session) + Postgres (long-term).
    """
    
    def __init__(
        self,
        redis_url: str = None,
        postgres_url: str = None,
    ):
        self.redis_url = redis_url or settings.redis_url
        self.postgres_url = postgres_url or settings.postgres_url
        
        self._redis: Optional[redis.Redis] = None
        self._redis_store: Optional[RedisSessionStore] = None
        self._pg_pool: Optional[asyncpg.Pool] = None
        self._pg_store: Optional[PostgresMemoryStore] = None
    
    async def initialize(self) -> None:
        """Initialize connections."""
        # Redis
        self._redis = redis.from_url(self.redis_url, decode_responses=True)
        await self._redis.ping()
        self._redis_store = RedisSessionStore(self._redis)
        
        # Postgres
        self._pg_pool = await asyncpg.create_pool(self.postgres_url)
        self._pg_store = PostgresMemoryStore(self._pg_pool)
        await self._pg_store.init_schema()
    
    async def close(self) -> None:
        """Close connections."""
        if self._redis:
            await self._redis.close()
        if self._pg_pool:
            await self._pg_pool.close()
    
    @property
    def redis(self) -> RedisSessionStore:
        if not self._redis_store:
            raise RuntimeError("Not initialized. Call initialize() first.")
        return self._redis_store
    
    @property
    def postgres(self) -> PostgresMemoryStore:
        if not self._pg_store:
            raise RuntimeError("Not initialized. Call initialize() first.")
        return self._pg_store
    
    async def save_session_state(self, session_id: str, state: dict) -> None:
        await self._redis_store.save_session(session_id, state)
    
    async def load_session_state(self, session_id: str) -> Optional[dict]:
        return await self._redis_store.load_session(session_id)
    
    async def save_long_term_memory(self, memory: LongTermMemory) -> None:
        # Save to both Redis (fast) and Postgres (durable)
        await asyncio.gather(
            self._redis_store.save_memory(memory.user_id, memory),
            self._pg_store.save_memory(memory),
        )
    
    async def load_long_term_memory(self, user_id: str) -> Optional[LongTermMemory]:
        # Try Redis first (fast), fallback to Postgres
        memory = await self._redis_store.load_memory(user_id)
        if memory is None:
            memory = await self._pg_store.load_memory(user_id)
            if memory:
                # Warm up Redis cache
                await self._redis_store.save_memory(user_id, memory)
        return memory