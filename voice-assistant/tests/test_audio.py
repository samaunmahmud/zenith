"""Push-to-talk state machine, driven with fake keys and a fake recorder."""

from __future__ import annotations

import numpy as np
import pytest

from voice_assistant import audio
from voice_assistant.audio import AudioClip, MicrophoneError, PushToTalk


class FakeRecorder:
    def __init__(self, fail=False):
        self.is_recording = False
        self.starts = 0
        self.fail = fail

    def start(self):
        if self.fail:
            raise MicrophoneError("denied")
        self.starts += 1
        self.is_recording = True

    def stop(self):
        self.is_recording = False
        return AudioClip(np.zeros(1600, dtype=np.float32), 16_000)


@pytest.fixture(autouse=True)
def plain_keys(monkeypatch):
    # Use key names directly instead of pynput objects (no GUI session needed).
    monkeypatch.setattr(audio, "parse_hotkey", lambda name: name)


def make(mode="hold", recorder=None, **callbacks):
    recorder = recorder or FakeRecorder()
    return PushToTalk(recorder, "alt_r", mode, **callbacks), recorder


def test_hold_mode_records_while_held():
    ptt, rec = make()
    ptt._on_press("alt_r")
    ptt._on_press("alt_r")  # auto-repeat must not restart
    assert rec.starts == 1 and rec.is_recording
    ptt._on_release("alt_r")
    assert not rec.is_recording
    assert isinstance(ptt.next_clip(timeout=0.1), AudioClip)


def test_toggle_mode_starts_and_stops_on_taps():
    ptt, rec = make("toggle")
    ptt._on_press("alt_r")
    ptt._on_release("alt_r")
    assert rec.is_recording
    ptt._on_press("alt_r")
    assert not rec.is_recording
    assert ptt.next_clip(timeout=0.1) is not None


def test_escape_discards_the_recording():
    cancelled = []
    ptt, rec = make(on_cancel=lambda: cancelled.append(True))
    ptt._on_press("alt_r")
    ptt._on_press("esc")
    ptt._on_release("alt_r")
    assert cancelled == [True]
    assert ptt.next_clip(timeout=0.05) is None


def test_other_keys_and_busy_state_are_ignored():
    ptt, rec = make()
    ptt._on_press("a")
    ptt._on_press("esc")  # nothing to cancel
    assert rec.starts == 0
    ptt.set_busy(True)
    ptt._on_press("alt_r")
    assert rec.starts == 0


def test_microphone_errors_reach_the_main_thread():
    ptt, _ = make(recorder=FakeRecorder(fail=True))
    ptt._on_press("alt_r")
    with pytest.raises(MicrophoneError):
        ptt.next_clip(timeout=0.1)
