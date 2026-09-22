from __future__ import annotations

import asyncio

from server.app.transport import (
    LiveKitTransport,
    LiveKitConfig,
    MockLiveKitTransport,
    get_livekit_transport,
    SIPTransport,
    SIPConfig,
    MockSIPTransport,
    get_sip_transport,
)


async def test_livekit_transport_mock():
    """Test MockLiveKitTransport basic functionality."""
    transport = MockLiveKitTransport()
    await transport.initialize()
    
    assert transport._running is True
    
    room_name = await transport.create_room("test-room")
    assert room_name == "test-room"
    
    token = await transport.generate_token("test-room", "test-user")
    assert "mock-token" in token
    
    conn = await transport.connect_as_agent("test-room", "test-agent")
    assert conn["room_name"] == "test-room"
    assert conn["participant_name"] == "test-agent"
    
    await transport.disconnect("test-room")
    assert "test-room" not in transport._connections


async def test_sip_transport_mock():
    """Test MockSIPTransport basic functionality."""
    transport = MockSIPTransport()
    await transport.initialize()
    
    assert transport._running is True
    
    call_sid = await transport.make_call("+15551234567")
    assert call_sid.startswith("mock-call-")
    assert call_sid in transport._connections
    
    await transport.hangup(call_sid)
    assert call_sid not in transport._connections


async def test_get_livekit_transport_factory():
    """Test factory function returns mock when no config."""
    transport = get_livekit_transport()
    assert isinstance(transport, MockLiveKitTransport)


async def test_get_sip_transport_factory():
    """Test factory function returns mock when no config."""
    transport = get_sip_transport()
    assert isinstance(transport, MockSIPTransport)


async def test_livekit_config():
    """Test LiveKitConfig dataclass."""
    config = LiveKitConfig(
        url="wss://test.livekit.cloud",
        api_key="test-key",
        api_secret="test-secret",
        room_name="test-room",
    )
    
    assert config.url == "wss://test.livekit.cloud"
    assert config.api_key == "test-key"
    assert config.api_secret == "test-secret"
    assert config.room_name == "test-room"
    assert config.sample_rate == 48000


async def test_sip_config():
    """Test SIPConfig dataclass."""
    config = SIPConfig(
        provider="twilio",
        account_sid="ACxxx",
        auth_token="token",
        phone_number="+15551234567",
        webhook_url="https://example.com/webhook",
    )
    
    assert config.provider == "twilio"
    assert config.account_sid == "ACxxx"
    assert config.sample_rate == 8000
    assert config.channels == 1


if __name__ == "__main__":
    asyncio.run(test_livekit_transport_mock())
    print("✓ test_livekit_transport_mock")
    
    asyncio.run(test_sip_transport_mock())
    print("✓ test_sip_transport_mock")
    
    asyncio.run(test_get_livekit_transport_factory())
    print("✓ test_get_livekit_transport_factory")
    
    asyncio.run(test_get_sip_transport_factory())
    print("✓ test_get_sip_transport_factory")
    
    asyncio.run(test_livekit_config())
    print("✓ test_livekit_config")
    
    asyncio.run(test_sip_config())
    print("✓ test_sip_config")
    
    print("\nAll transport tests passed!")