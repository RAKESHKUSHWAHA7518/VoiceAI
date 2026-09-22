from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Provider API Keys
    deepgram_api_key: str = Field(default="", alias="DEEPGRAM_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    cartesia_api_key: str = Field(default="", alias="CARTESIA_API_KEY")
    elevenlabs_api_key: str = Field(default="", alias="ELEVENLABS_API_KEY")

    # Redis & Postgres
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    postgres_url: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/voiceai",
        alias="POSTGRES_URL",
    )

    # Langfuse
    langfuse_public_key: str = Field(default="", alias="LANGFUSE_PUBLIC_KEY")
    langfuse_secret_key: str = Field(default="", alias="LANGFUSE_SECRET_KEY")
    langfuse_host: str = Field(default="https://cloud.langfuse.com", alias="LANGFUSE_HOST")

    # LiveKit
    livekit_url: str = Field(default="", alias="LIVEKIT_URL")
    livekit_api_key: str = Field(default="", alias="LIVEKIT_API_KEY")
    livekit_api_secret: str = Field(default="", alias="LIVEKIT_API_SECRET")

    # SIP / Twilio
    twilio_account_sid: str = Field(default="", alias="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field(default="", alias="TWILIO_AUTH_TOKEN")
    twilio_phone_number: str = Field(default="", alias="TWILIO_PHONE_NUMBER")
    sip_webhook_url: str = Field(default="", alias="SIP_WEBHOOK_URL")

    # VAD Settings
    vad_threshold: float = Field(default=0.6, alias="VAD_THRESHOLD")
    vad_sos_debounce_ms: int = Field(default=120, alias="VAD_SOS_DEBOUNCE_MS")
    vad_eos_timeout_ms: int = Field(default=500, alias="VAD_EOS_TIMEOUT_MS")

    # LLM Settings
    llm_model: str = Field(default="gpt-4o-mini", alias="LLM_MODEL")
    llm_temperature: float = Field(default=0.3, alias="LLM_TEMPERATURE")
    llm_max_tokens: int = Field(default=512, alias="LLM_MAX_TOKENS")

    # TTS Settings
    tts_provider: str = Field(default="cartesia", alias="TTS_PROVIDER")
    tts_voice_id: str = Field(default="", alias="TTS_VOICE_ID")
    tts_sample_rate: int = Field(default=24000, alias="TTS_SAMPLE_RATE")

    # Audio
    audio_sample_rate: int = Field(default=16000, alias="AUDIO_SAMPLE_RATE")
    audio_channels: int = Field(default=1, alias="AUDIO_CHANNELS")
    audio_chunk_ms: int = Field(default=30, alias="AUDIO_CHUNK_MS")

    # Server
    host: str = Field(default="0.0.0.0", alias="HOST")
    port: int = Field(default=8000, alias="PORT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
