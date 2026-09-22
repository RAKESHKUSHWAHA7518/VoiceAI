from __future__ import annotations

from server.app.session.state_machine import SessionState, SessionStateMachine


def test_session_state_machine_lifecycle():
    session = SessionStateMachine("test_session")

    assert session.state == SessionState.IDLE

    session.start_session()
    assert session.state == SessionState.LISTENING

    turn = session.new_turn("turn_1")
    assert turn.turn_id == "turn_1"
    assert session.state == SessionState.PROCESSING

    session.start_speaking()
    assert session.state == SessionState.SPEAKING

    session.interrupt()
    assert session.state == SessionState.INTERRUPTED
    assert turn.cancelled is True

    session.resume_after_interrupt()
    assert session.state == SessionState.LISTENING

    session.end_session()
    assert session.state == SessionState.ENDED


def test_session_turn_history():
    session = SessionStateMachine("test")
    session.start_session()

    turn1 = session.new_turn("t1")
    turn2 = session.new_turn("t2")
    turn3 = session.new_turn("t3")

    assert len(session.turn_history) == 3
    assert session.get_context_for_rewind(0) is turn1
    assert session.get_context_for_rewind(1) is turn2
    assert session.get_context_for_rewind(2) is turn3
    assert session.get_context_for_rewind(3) is None
    assert session.get_context_for_rewind(-1) is None


async def test_cancellation_event():
    session = SessionStateMachine("test")
    session.start_session()
    session.new_turn()

    assert session.is_cancelled is False

    session.interrupt()
    assert session.is_cancelled is True

    cancelled = await session.wait_for_cancellation(timeout=0.1)
    assert cancelled is True

    session.resume_after_interrupt()
    assert session.is_cancelled is False

    cancelled = await session.wait_for_cancellation(timeout=0.05)
    assert cancelled is False
