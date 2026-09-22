from __future__ import annotations

import pytest

from server.app.session.state_machine import SessionState, SessionStateMachine


@pytest.mark.asyncio
async def test_session_interrupt_cancels_turn():
    session = SessionStateMachine("test")
    session.start_session()
    turn = session.new_turn()

    assert not turn.cancelled
    session.interrupt()
    assert turn.cancelled
    assert session.is_cancelled

    cancelled = await session.wait_for_cancellation(timeout=0.1)
    assert cancelled


@pytest.mark.asyncio
async def test_session_resume_after_interrupt():
    session = SessionStateMachine("test")
    session.start_session()
    session.new_turn()
    session.interrupt()

    session.resume_after_interrupt()
    assert session.state == SessionState.LISTENING
    assert not session.is_cancelled

    cancelled = await session.wait_for_cancellation(timeout=0.05)
    assert not cancelled
