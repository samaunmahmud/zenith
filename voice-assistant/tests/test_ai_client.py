"""Parsing/validation of Gemini replies and the retry/error mapping, without any network."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from voice_assistant.ai_client import (
    AIServiceError,
    GeminiBrain,
    Intent,
    IntentParseError,
    parse_action,
)
from voice_assistant.config import Config


def make_config(**overrides) -> Config:
    return Config(gemini_api_key="test-key", max_retries=2, **overrides)


def test_parses_open_app():
    action = parse_action('{"intent":"OPEN_APP","app_name":"Safari","text":null,"answer":null,"confidence":0.9}')
    assert action.intent is Intent.OPEN_APP
    assert action.app_name == "Safari"


def test_strips_code_fences_and_prose():
    raw = 'Here you go:\n```json\n{"intent":"ANSWER_QUESTION","answer":"Canberra.","confidence":1}\n```'
    assert parse_action(raw).answer == "Canberra."


def test_missing_payload_becomes_unclear():
    action = parse_action('{"intent":"OPEN_APP","app_name":"  ","confidence":0.9}')
    assert action.intent is Intent.UNCLEAR
    assert action.answer


def test_confidence_is_clamped():
    assert parse_action('{"intent":"ANSWER_QUESTION","answer":"hi","confidence":7}').confidence == 1.0


@pytest.mark.parametrize("raw", ["", "not json", '{"intent":"DANCE","confidence":1}', "{broken"])
def test_garbage_raises_parse_error(raw):
    with pytest.raises(IntentParseError):
        parse_action(raw)


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome, candidates=[])


def fake_brain(outcomes, **config):
    models = FakeModels(outcomes)
    brain = GeminiBrain(make_config(**config), client=SimpleNamespace(models=models))
    return brain, models


def api_error(code: int) -> genai_errors.APIError:
    return genai_errors.APIError(code, {"error": {"message": "boom", "status": "X"}})


def test_decide_retries_rate_limits(monkeypatch):
    monkeypatch.setattr("voice_assistant.retry.time.sleep", lambda _s: None)
    reply = json.dumps({"intent": "WRITE_TEXT", "text": "Hello.", "confidence": 0.9})
    brain, models = fake_brain([api_error(429), api_error(503), reply])
    action = brain.decide("type hello")
    assert action.intent is Intent.WRITE_TEXT and action.text == "Hello."
    assert len(models.calls) == 3


def test_decide_gives_friendly_quota_message(monkeypatch):
    monkeypatch.setattr("voice_assistant.retry.time.sleep", lambda _s: None)
    brain, models = fake_brain([api_error(429)] * 3)
    with pytest.raises(AIServiceError) as info:
        brain.decide("hello")
    assert "rate limit" in info.value.user_message
    assert len(models.calls) == 3  # first try + 2 retries


def test_auth_errors_are_not_retried():
    brain, models = fake_brain([api_error(403)])
    with pytest.raises(AIServiceError) as info:
        brain.decide("hello")
    assert "API key" in info.value.user_message
    assert len(models.calls) == 1


def test_history_is_sent_on_follow_ups():
    first = json.dumps({"intent": "ANSWER_QUESTION", "answer": "Paris.", "confidence": 1})
    second = json.dumps({"intent": "ANSWER_QUESTION", "answer": "About 2 million.", "confidence": 1})
    brain, models = fake_brain([first, second])
    brain.decide("capital of france")
    brain.decide("how many people live there")
    contents = models.calls[1]["contents"]
    assert [c.role for c in contents] == ["user", "model", "user"]
    assert "capital of france" in contents[0].parts[0].text


def test_request_uses_json_schema():
    brain, models = fake_brain([json.dumps({"intent": "ANSWER_QUESTION", "answer": "Hi", "confidence": 1})])
    brain.decide("hi")
    config = models.calls[0]["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_schema.properties["intent"].enum == [i.value for i in Intent]


def test_invalid_key_reported_as_400_gets_key_message():
    err = genai_errors.APIError(400, {"error": {"message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}})
    brain, _ = fake_brain([err])
    with pytest.raises(AIServiceError) as info:
        brain.decide("hello")
    assert "API key" in info.value.user_message
