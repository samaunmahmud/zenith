"""Runtime configuration, loaded from environment variables and an optional ``.env`` file.

Every setting has a sensible default except ``GEMINI_API_KEY``. Values are read once at
start-up into an immutable :class:`Config`, so the rest of the code never touches
``os.environ`` directly.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, replace
from pathlib import Path

from dotenv import load_dotenv

STT_BACKENDS = ("gemini", "openai", "local", "google")
PTT_MODES = ("hold", "toggle")


class ConfigError(Exception):
    """Raised when a setting is missing or invalid. The message is shown to the user as-is."""


def _env_str(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    return value.strip()


def _env_bool(name: str, default: bool) -> bool:
    value = _env_str(name)
    if value is None:
        return default
    if value.lower() in ("1", "true", "yes", "on"):
        return True
    if value.lower() in ("0", "false", "no", "off"):
        return False
    raise ConfigError(f"{name} must be true or false, got {value!r}")


def _env_number(name: str, default: float, cast: type[int] | type[float] = float) -> float:
    value = _env_str(name)
    if value is None:
        return default
    try:
        return cast(value)
    except ValueError as exc:
        raise ConfigError(f"{name} must be a number, got {value!r}") from exc


@dataclass(frozen=True)
class Config:
    """All tunable settings for the assistant. See ``.env.example`` for descriptions."""

    # --- Gemini (the "brain") ---
    gemini_api_key: str
    gemini_model: str = "gemini-flash-latest"
    gemini_thinking_level: str | None = None  # e.g. "low" for faster replies; None = model default
    gemini_timeout_seconds: float = 30.0
    max_retries: int = 3
    history_turns: int = 6  # previous exchanges sent for follow-ups ("make it shorter")

    # --- Speech-to-text ---
    stt_backend: str = "gemini"
    language: str = "en"
    openai_api_key: str | None = None
    openai_stt_model: str = "whisper-1"
    local_whisper_model: str = "base.en"

    # --- Microphone / push-to-talk ---
    hotkey: str = "alt_r"  # Right Option key
    ptt_mode: str = "hold"
    sample_rate: int = 16_000
    min_record_seconds: float = 0.35
    max_record_seconds: float = 60.0
    silence_rms_threshold: float = 0.004

    # --- Output ---
    speak_responses: bool = True
    tts_voice: str | None = None  # `say -v '?'` lists voices; None = system voice
    tts_rate: int = 190
    sound_cues: bool = True
    typing_interval: float = 0.008  # seconds between keystrokes
    paste_threshold: int = 300  # text longer than this is pasted instead of typed

    # --- Misc ---
    dry_run: bool = False
    log_level: str = "INFO"

    @classmethod
    def from_env(cls, env_file: str | Path | None = None) -> Config:
        """Build a config from the environment, loading ``env_file`` (or ``./.env``) first.

        Variables already set in the shell win over values in the file.
        """
        load_dotenv(env_file or Path.cwd() / ".env", override=False)

        api_key = _env_str("GEMINI_API_KEY") or _env_str("GOOGLE_API_KEY")
        if not api_key:
            raise ConfigError(
                "GEMINI_API_KEY is not set. Create one at https://aistudio.google.com/apikey "
                "and put it in voice-assistant/.env (see .env.example)."
            )

        config = cls(
            gemini_api_key=api_key,
            gemini_model=_env_str("GEMINI_MODEL", cls.gemini_model),
            gemini_thinking_level=_env_str("GEMINI_THINKING_LEVEL"),
            gemini_timeout_seconds=_env_number("GEMINI_TIMEOUT_SECONDS", cls.gemini_timeout_seconds),
            max_retries=int(_env_number("MAX_RETRIES", cls.max_retries, int)),
            history_turns=int(_env_number("HISTORY_TURNS", cls.history_turns, int)),
            stt_backend=_env_str("STT_BACKEND", cls.stt_backend).lower(),
            language=_env_str("LANGUAGE", cls.language),
            openai_api_key=_env_str("OPENAI_API_KEY"),
            openai_stt_model=_env_str("OPENAI_STT_MODEL", cls.openai_stt_model),
            local_whisper_model=_env_str("LOCAL_WHISPER_MODEL", cls.local_whisper_model),
            hotkey=_env_str("HOTKEY", cls.hotkey).lower(),
            ptt_mode=_env_str("PTT_MODE", cls.ptt_mode).lower(),
            sample_rate=int(_env_number("SAMPLE_RATE", cls.sample_rate, int)),
            min_record_seconds=_env_number("MIN_RECORD_SECONDS", cls.min_record_seconds),
            max_record_seconds=_env_number("MAX_RECORD_SECONDS", cls.max_record_seconds),
            silence_rms_threshold=_env_number("SILENCE_RMS_THRESHOLD", cls.silence_rms_threshold),
            speak_responses=_env_bool("SPEAK_RESPONSES", cls.speak_responses),
            tts_voice=_env_str("TTS_VOICE"),
            tts_rate=int(_env_number("TTS_RATE", cls.tts_rate, int)),
            sound_cues=_env_bool("SOUND_CUES", cls.sound_cues),
            typing_interval=_env_number("TYPING_INTERVAL", cls.typing_interval),
            paste_threshold=int(_env_number("PASTE_THRESHOLD", cls.paste_threshold, int)),
            dry_run=_env_bool("DRY_RUN", cls.dry_run),
            log_level=_env_str("LOG_LEVEL", cls.log_level).upper(),
        )
        config.validate()
        return config

    def with_overrides(self, **changes: object) -> Config:
        """Return a copy with some fields replaced (used for command-line flags)."""
        updated = replace(self, **{k: v for k, v in changes.items() if v is not None})
        updated.validate()
        return updated

    def validate(self) -> None:
        """Check cross-field rules that a type annotation can't express."""
        if self.stt_backend not in STT_BACKENDS:
            raise ConfigError(f"STT_BACKEND must be one of {', '.join(STT_BACKENDS)}, got {self.stt_backend!r}")
        if self.stt_backend == "openai" and not self.openai_api_key:
            raise ConfigError("STT_BACKEND=openai needs OPENAI_API_KEY to be set.")
        if self.ptt_mode not in PTT_MODES:
            raise ConfigError(f"PTT_MODE must be one of {', '.join(PTT_MODES)}, got {self.ptt_mode!r}")
        if self.min_record_seconds >= self.max_record_seconds:
            raise ConfigError("MIN_RECORD_SECONDS must be smaller than MAX_RECORD_SECONDS.")
        if self.max_retries < 0:
            raise ConfigError("MAX_RETRIES cannot be negative.")
