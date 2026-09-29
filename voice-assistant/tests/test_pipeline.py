"""End-to-end behaviour of the Assistant with every component faked."""

from __future__ import annotations

import numpy as np

from voice_assistant.ai_client import AIServiceError, AssistantAction, Intent
from voice_assistant.audio import AudioClip
from voice_assistant.config import Config
from voice_assistant.mac_controller import AppNotFoundError, FrontApp, InstalledApp
from voice_assistant.main import Assistant
from voice_assistant.stt import clean_transcript


class FakeBrain:
    def __init__(self, result):
        self.result = result
        self.seen = []

    def decide(self, transcript, frontmost_app=None):
        self.seen.append(transcript)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result

    def decide_audio(self, wav_bytes, frontmost_app=None):
        return self.decide(("audio", len(wav_bytes)), frontmost_app)


class FakeMac:
    def __init__(self, open_error=None):
        self.events = []
        self.open_error = open_error

    def frontmost_app(self):
        return FrontApp("TextEdit", "com.apple.TextEdit")

    def open_app(self, name):
        if self.open_error:
            raise self.open_error
        self.events.append(("open", name))
        return InstalledApp(name, None)

    def focus(self, app):
        self.events.append(("focus", app.name))

    def type_text(self, text):
        self.events.append(("type", text))

    def speak(self, text):
        self.events.append(("speak", text))

    def play_cue(self, kind):
        self.events.append(("cue", kind))


class FakeTranscriber:
    name = "fake"

    def __init__(self, text):
        self.text = text

    def transcribe(self, clip):
        return self.text


CONFIG = Config(gemini_api_key="k")


def loud_clip(seconds=1.0) -> AudioClip:
    t = np.linspace(0, seconds, int(16_000 * seconds), dtype=np.float32)
    return AudioClip(0.2 * np.sin(2 * np.pi * 220 * t).astype(np.float32), 16_000)


def test_open_app_flow():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.OPEN_APP, app_name="Spotify", confidence=0.9))
    Assistant(CONFIG, brain, mac, FakeTranscriber("open spotify")).handle_clip(loud_clip())
    assert brain.seen == ["open spotify"]
    assert ("open", "Spotify") in mac.events


def test_write_text_refocuses_the_original_app_then_types():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.WRITE_TEXT, text="Hello there.", confidence=0.9))
    Assistant(CONFIG, brain, mac).handle_command("type hello there")
    assert mac.events == [("focus", "TextEdit"), ("type", "Hello there.")]


def test_write_text_in_named_app_opens_it_first():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.WRITE_TEXT, app_name="Notes", text="Milk", confidence=0.9))
    Assistant(CONFIG, brain, mac).handle_command("open notes and write milk")
    assert mac.events == [("open", "Notes"), ("type", "Milk")]


def test_answers_are_spoken():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.ANSWER_QUESTION, answer="Canberra.", confidence=1))
    Assistant(CONFIG, brain, mac).handle_command("capital of australia")
    assert ("speak", "Canberra.") in mac.events


def test_low_confidence_actions_ask_instead_of_acting():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.WRITE_TEXT, text="???", confidence=0.2))
    Assistant(CONFIG, brain, mac).handle_command("mumble")
    assert not any(kind == "type" for kind, _ in mac.events)


def test_missing_app_is_reported_not_raised():
    mac = FakeMac(open_error=AppNotFoundError("Notez", ["Notes"]))
    brain = FakeBrain(AssistantAction(intent=Intent.OPEN_APP, app_name="Notez", confidence=0.9))
    Assistant(CONFIG, brain, mac).handle_command("open notez")
    spoken = [text for kind, text in mac.events if kind == "speak"]
    assert spoken and "Did you mean Notes" in spoken[0]


def test_api_failure_is_reported_not_raised():
    mac = FakeMac()
    brain = FakeBrain(AIServiceError("I've hit the Gemini rate limit."))
    Assistant(CONFIG, brain, mac).handle_command("anything")
    assert ("speak", "I've hit the Gemini rate limit.") in mac.events


def test_silence_and_empty_transcripts_never_reach_gemini():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.ANSWER_QUESTION, answer="x", confidence=1))
    silent = AudioClip(np.zeros(16_000, dtype=np.float32), 16_000)
    Assistant(CONFIG, brain, mac, FakeTranscriber("hello")).handle_clip(silent)
    Assistant(CONFIG, brain, mac, FakeTranscriber("")).handle_clip(loud_clip())
    Assistant(CONFIG, brain, mac, FakeTranscriber("hello")).handle_clip(loud_clip(0.1))  # too short
    assert brain.seen == []


def test_whisper_hallucinations_are_dropped():
    assert clean_transcript("  Thank you. ") == ""
    assert clean_transcript("open   safari") == "open safari"


def test_wav_encoding_round_trip():
    import io
    import wave

    with wave.open(io.BytesIO(loud_clip(0.5).to_wav_bytes())) as wav:
        assert (wav.getframerate(), wav.getnchannels(), wav.getnframes()) == (16_000, 1, 8_000)


def test_direct_audio_mode_sends_the_recording_to_the_brain():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.OPEN_APP, transcript="Open Safari.", app_name="Safari", confidence=0.9))
    Assistant(CONFIG, brain, mac, transcriber=None).handle_clip(loud_clip())
    assert brain.seen[0][0] == "audio"
    assert ("open", "Safari") in mac.events


def test_direct_audio_mode_with_no_speech_does_not_act():
    mac = FakeMac()
    brain = FakeBrain(AssistantAction(intent=Intent.UNCLEAR, transcript="", answer="Sorry?", confidence=0.1))
    Assistant(CONFIG, brain, mac, transcriber=None).handle_clip(loud_clip())
    assert ("speak", "Sorry, I didn't catch that.") in mac.events
