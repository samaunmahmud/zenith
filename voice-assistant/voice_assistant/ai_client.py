"""The assistant's "brain": turns a transcript into a structured action using Gemini.

A single Gemini call both classifies the request and produces its payload (the app name,
the text to type, or the spoken answer). Doing it in one round trip instead of
"classify, then generate" roughly halves the latency of every command.

The model is forced to reply with JSON matching :data:`RESPONSE_SCHEMA`, which is then
validated again with Pydantic, so the rest of the program only ever sees a well-formed
:class:`AssistantAction`.
"""

from __future__ import annotations

import json
import logging
import re
from collections import deque
from datetime import datetime
from enum import Enum

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError, field_validator, model_validator

from .config import Config
from .retry import call_with_retries

log = logging.getLogger(__name__)


class AIServiceError(Exception):
    """The Gemini API could not be reached or refused the request.

    ``user_message`` is short and suitable for reading aloud.
    """

    def __init__(self, user_message: str, *, detail: str = "") -> None:
        super().__init__(detail or user_message)
        self.user_message = user_message


class IntentParseError(AIServiceError):
    """Gemini answered, but not with a usable action."""


class Intent(str, Enum):
    """What the user wants done.

    ``UNCLEAR`` is a safety valve on top of the three core intents: when the transcript is
    garbled or ambiguous, asking a short question beats launching the wrong app or typing
    nonsense into someone's document.
    """

    OPEN_APP = "OPEN_APP"
    WRITE_TEXT = "WRITE_TEXT"
    ANSWER_QUESTION = "ANSWER_QUESTION"
    UNCLEAR = "UNCLEAR"


class AssistantAction(BaseModel):
    """A validated decision from the model."""

    intent: Intent
    app_name: str | None = None  # OPEN_APP target, or the app to write in for WRITE_TEXT
    text: str | None = None  # WRITE_TEXT: exactly what to type
    answer: str | None = None  # ANSWER_QUESTION reply or UNCLEAR clarifying question
    confidence: float = 1.0

    @field_validator("app_name", "text", "answer", mode="before")
    @classmethod
    def _blank_to_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("confidence", mode="before")
    @classmethod
    def _clamp_confidence(cls, value: object) -> float:
        try:
            return min(1.0, max(0.0, float(value)))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0.5

    @model_validator(mode="after")
    def _require_payload(self) -> AssistantAction:
        """Downgrade actions that are missing the field they need to UNCLEAR."""
        if self.intent is Intent.OPEN_APP and not self.app_name:
            return AssistantAction(intent=Intent.UNCLEAR, answer="Which app should I open?", confidence=0.0)
        if self.intent is Intent.WRITE_TEXT and not self.text:
            return AssistantAction(intent=Intent.UNCLEAR, answer="What would you like me to write?", confidence=0.0)
        if self.intent in (Intent.ANSWER_QUESTION, Intent.UNCLEAR) and not self.answer:
            return AssistantAction(intent=Intent.UNCLEAR, answer="Sorry, could you say that again?", confidence=0.0)
        return self


SYSTEM_PROMPT = """\
You are the intent parser and brain of a macOS voice assistant. The user's words come from \
speech-to-text, so expect missing punctuation, filler words ("um", "like") and mis-heard \
words. Infer what they meant. Reply ONLY with JSON matching the schema.

Choose exactly one intent:

OPEN_APP - launch, open, start, switch to, or bring up an application.
  * app_name: the app's real macOS name, e.g. "Visual Studio Code" for "VS code", "Google \
Chrome" for "chrome", "System Settings" for "settings", "Spotify" for "spot a fie".
  * Leave text and answer null.

WRITE_TEXT - write, type, draft, compose or dictate text into the app the user is using.
  * text: EXACTLY what should be typed. No preamble ("Sure, here is..."), no surrounding \
quotes, no markdown or code fences unless the user asked for code or markdown.
  * Verbatim dictation ("type hello world") is reproduced word for word with corrected \
punctuation and capitalisation. Composition ("write an email asking for Friday off") is \
written in full, ready to use, in plain text with normal line breaks.
  * If the user names an app to write in ("open Notes and write a shopping list"), put it \
in app_name; otherwise leave app_name null.

ANSWER_QUESTION - a question, a calculation, advice, or casual conversation.
  * answer: a direct reply that will be READ ALOUD. Usually 1-3 sentences, plain spoken \
English, no markdown, lists, emoji or URLs. Spell out symbols ("5 degrees Celsius").
  * You cannot browse the web; if the question needs live data (news, weather, prices), \
say so briefly and give whatever general help you can.

UNCLEAR - the transcript is empty, gibberish, cut off mid-sentence, or so ambiguous that \
acting could do the wrong thing.
  * answer: one short clarifying question.

confidence: 0.0-1.0, how sure you are about the intent.
Only fill the fields the chosen intent uses; set the others to null.

Examples:
"open safari" -> {"intent":"OPEN_APP","app_name":"Safari","text":null,"answer":null,"confidence":0.98}
"launch v s code" -> {"intent":"OPEN_APP","app_name":"Visual Studio Code","text":null,"answer":null,"confidence":0.95}
"type thanks for the update I'll review it tomorrow" -> {"intent":"WRITE_TEXT","app_name":null,"text":"Thanks for the update, I'll review it tomorrow.","answer":null,"confidence":0.97}
"open notes and write a haiku about coffee" -> {"intent":"WRITE_TEXT","app_name":"Notes","text":"Dark roast in the cup\\nsteam curls into morning light\\nthe day finds its feet","answer":null,"confidence":0.93}
"what's the capital of australia" -> {"intent":"ANSWER_QUESTION","app_name":null,"text":null,"answer":"The capital of Australia is Canberra.","confidence":0.99}
"open the" -> {"intent":"UNCLEAR","app_name":null,"text":null,"answer":"Which app would you like me to open?","confidence":0.3}
"""

# Explicit schema (rather than letting the SDK derive one from Pydantic) keeps the request
# stable across SDK versions. property_ordering makes the model decide `intent` first.
_NULLABLE_STRING = types.Schema(type=types.Type.STRING, nullable=True)
RESPONSE_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    properties={
        "intent": types.Schema(type=types.Type.STRING, enum=[i.value for i in Intent]),
        "app_name": _NULLABLE_STRING,
        "text": _NULLABLE_STRING,
        "answer": _NULLABLE_STRING,
        "confidence": types.Schema(type=types.Type.NUMBER),
    },
    required=["intent", "confidence"],
    property_ordering=["intent", "app_name", "text", "answer", "confidence"],
)

_RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


def is_retryable_gemini_error(exc: BaseException) -> bool:
    """Rate limits, server errors and network hiccups are worth retrying; bad requests aren't."""
    if isinstance(exc, genai_errors.APIError):
        return exc.code in _RETRYABLE_STATUS
    return isinstance(exc, (httpx.TransportError, TimeoutError, ConnectionError))


def friendly_gemini_error(exc: BaseException) -> AIServiceError:
    """Map a low-level exception to something worth saying out loud."""
    code = getattr(exc, "code", None)
    if code == 400 and ("API_KEY_INVALID" in str(exc) or "API key not valid" in str(exc)):
        code = 401  # Gemini reports a bad key as 400 INVALID_ARGUMENT
    if code == 429:
        message = "I've hit the Gemini rate limit or quota. Give it a minute and try again."
    elif code in (401, 403):
        message = "Gemini rejected the API key. Check GEMINI_API_KEY in your dot env file."
    elif code == 404:
        message = "That Gemini model wasn't found. Check GEMINI_MODEL in your settings."
    elif code == 400:
        message = "Gemini couldn't process that request."
    elif isinstance(exc, (httpx.TransportError, TimeoutError, ConnectionError)):
        message = "I couldn't reach Gemini. Check your internet connection."
    else:
        message = "Gemini is having trouble right now. Please try again shortly."
    return AIServiceError(message, detail=f"{type(exc).__name__}: {exc}")


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_action(raw: str) -> AssistantAction:
    """Parse the model's JSON reply into an :class:`AssistantAction`.

    Structured output normally guarantees clean JSON, but code fences or leading prose are
    stripped defensively so a minor formatting slip doesn't lose the whole command.
    """
    cleaned = _FENCE_RE.sub("", raw.strip())
    if not cleaned.startswith("{"):
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise IntentParseError("Sorry, I got a confusing answer. Please try again.", detail=f"No JSON in: {raw!r}")
        cleaned = cleaned[start : end + 1]
    try:
        return AssistantAction.model_validate(json.loads(cleaned))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise IntentParseError(
            "Sorry, I got a confusing answer. Please try again.", detail=f"{exc}; raw={raw!r}"
        ) from exc


class GeminiBrain:
    """Wraps the ``google-genai`` client with the prompt, schema, retries and short memory."""

    def __init__(self, config: Config, client: genai.Client | None = None) -> None:
        self._config = config
        self.client = client or genai.Client(
            api_key=config.gemini_api_key,
            http_options=types.HttpOptions(timeout=int(config.gemini_timeout_seconds * 1000)),
        )
        # Each item is a (user transcript, model JSON) pair, oldest first.
        self._history: deque[tuple[str, str]] = deque(maxlen=max(0, config.history_turns))

    def _generation_config(self) -> types.GenerateContentConfig:
        thinking = None
        if self._config.gemini_thinking_level:
            thinking = types.ThinkingConfig(thinking_level=self._config.gemini_thinking_level.upper())
        return types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
            temperature=0.4,
            max_output_tokens=4096,
            thinking_config=thinking,
            # We never pass Python tools, so skip the SDK's function-calling loop (and its warning).
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

    def _contents(self, transcript: str, frontmost_app: str | None) -> list[types.Content]:
        contents: list[types.Content] = []
        for user_text, model_json in self._history:
            contents.append(types.Content(role="user", parts=[types.Part(text=user_text)]))
            contents.append(types.Content(role="model", parts=[types.Part(text=model_json)]))
        context = f"[Local time: {datetime.now():%A %d %B %Y, %H:%M}"
        if frontmost_app:
            context += f". Frontmost app: {frontmost_app}"
        context += "]"
        contents.append(types.Content(role="user", parts=[types.Part(text=f"{context}\n{transcript}")]))
        return contents

    def decide(self, transcript: str, frontmost_app: str | None = None) -> AssistantAction:
        """Classify ``transcript`` and generate its payload.

        Args:
            transcript: What the user said.
            frontmost_app: The app in focus, given to the model as context (helps it pick
                e.g. code vs. prose for "write a function that...").

        Raises:
            AIServiceError: The API failed after retries (quota, auth, network...).
            IntentParseError: The reply couldn't be turned into an action.
        """

        def request() -> types.GenerateContentResponse:
            return self.client.models.generate_content(
                model=self._config.gemini_model,
                contents=self._contents(transcript, frontmost_app),
                config=self._generation_config(),
            )

        try:
            response = call_with_retries(
                request,
                retries=self._config.max_retries,
                is_retryable=is_retryable_gemini_error,
                what="Gemini request",
            )
        except Exception as exc:
            raise friendly_gemini_error(exc) from exc

        raw = response.text or ""
        if not raw:
            reason = _finish_reason(response)
            if reason == "SAFETY":
                raise IntentParseError("Sorry, I can't help with that one.", detail="Blocked by safety filters")
            raise IntentParseError("Sorry, I didn't get an answer. Please try again.", detail=f"Empty reply ({reason})")

        action = parse_action(raw)
        self._history.append((transcript, raw))
        return action

    def clear_history(self) -> None:
        """Forget previous exchanges (e.g. when the user says "start over")."""
        self._history.clear()


def _finish_reason(response: types.GenerateContentResponse) -> str:
    try:
        reason = response.candidates[0].finish_reason  # type: ignore[index]
        return getattr(reason, "name", str(reason))
    except (AttributeError, IndexError, TypeError):
        return "UNKNOWN"
