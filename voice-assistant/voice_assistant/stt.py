"""Speech-to-text backends behind one small interface.

=============  ==============================  ========================================
Backend        Needs                           Notes
=============  ==============================  ========================================
gemini-direct  GEMINI_API_KEY (already set)    Default. No separate STT step: the audio
                                               goes straight to the brain in one call
                                               (see GeminiBrain.decide_audio).
gemini         GEMINI_API_KEY (already set)    Separate Gemini transcription call.
openai         OPENAI_API_KEY                  OpenAI Whisper API; very accurate.
local          ``pip install faster-whisper``  Fully offline. First run downloads the model.
google         nothing                         Free Google Web Speech (SpeechRecognition);
                                               rate-limited, fine for experimenting.
=============  ==============================  ========================================

Every backend returns ``""`` when it heard nothing intelligible and raises
:class:`TranscriptionError` when the service itself failed.
"""

from __future__ import annotations

import io
import logging
from typing import Any, Protocol

from .audio import AudioClip
from .config import Config
from .retry import call_with_retries

log = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """The STT service failed. ``user_message`` is safe to read aloud."""

    def __init__(self, user_message: str, *, detail: str = "") -> None:
        super().__init__(detail or user_message)
        self.user_message = user_message


class Transcriber(Protocol):
    """Anything that turns an :class:`AudioClip` into text."""

    name: str

    def transcribe(self, clip: AudioClip) -> str:
        """Return the transcript, or ``""`` if no speech was recognised."""
        ...


# Whisper-family models famously "hear" these on near-silent input.
_HALLUCINATIONS = {
    "thank you.", "thanks for watching!", "thank you for watching.", "you", "bye.", ".", "[blank_audio]",
}


def clean_transcript(text: str) -> str:
    """Trim whitespace and drop well-known phantom transcripts of silence."""
    text = " ".join(text.split())
    return "" if text.lower() in _HALLUCINATIONS else text


class GeminiTranscriber:
    """Sends the WAV to Gemini as inline audio and asks for a verbatim transcript."""

    name = "gemini"

    _PROMPT = (
        "Transcribe this voice command verbatim in {language}. Output only the transcript, with no "
        "commentary or quotes. If there is no intelligible speech, output exactly: <none>"
    )

    def __init__(self, config: Config, client: Any) -> None:
        self._config = config
        self._client = client

    def transcribe(self, clip: AudioClip) -> str:
        from google.genai import types

        from .ai_client import friendly_gemini_error, is_retryable_gemini_error

        def request() -> Any:
            return self._client.models.generate_content(
                model=self._config.gemini_model,
                contents=[
                    types.Part.from_bytes(data=clip.to_wav_bytes(), mime_type="audio/wav"),
                    self._PROMPT.format(language=self._config.language),
                ],
                config=types.GenerateContentConfig(
                    temperature=0.0,
                    max_output_tokens=1024,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                ),
            )

        try:
            response = call_with_retries(
                request, retries=self._config.max_retries, is_retryable=is_retryable_gemini_error, what="Gemini STT"
            )
        except Exception as exc:
            err = friendly_gemini_error(exc)
            raise TranscriptionError(err.user_message, detail=str(err)) from exc
        text = (response.text or "").strip()
        return "" if text.strip("<>").lower() == "none" else clean_transcript(text)


class OpenAIWhisperTranscriber:
    """OpenAI's hosted Whisper (or gpt-4o-*-transcribe) API."""

    name = "openai"

    def __init__(self, config: Config) -> None:
        from openai import OpenAI

        self._config = config
        self._client = OpenAI(api_key=config.openai_api_key, timeout=30.0, max_retries=0)

    def transcribe(self, clip: AudioClip) -> str:
        import openai

        def retryable(exc: BaseException) -> bool:
            return isinstance(exc, (openai.RateLimitError, openai.APIConnectionError, openai.InternalServerError))

        def request() -> Any:
            return self._client.audio.transcriptions.create(
                model=self._config.openai_stt_model,
                file=("command.wav", clip.to_wav_bytes(), "audio/wav"),
                language=self._config.language,
            )

        try:
            result = call_with_retries(
                request, retries=self._config.max_retries, is_retryable=retryable, what="Whisper API"
            )
        except openai.RateLimitError as exc:
            raise TranscriptionError("The Whisper API rate limit was hit. Try again in a moment.", detail=str(exc)) from exc
        except openai.AuthenticationError as exc:
            raise TranscriptionError("OpenAI rejected the API key. Check OPENAI_API_KEY.", detail=str(exc)) from exc
        except openai.OpenAIError as exc:
            raise TranscriptionError("Speech recognition failed. Please try again.", detail=str(exc)) from exc
        return clean_transcript(getattr(result, "text", "") or "")


class LocalWhisperTranscriber:
    """Offline transcription with ``faster-whisper`` (CTranslate2; fast on Apple Silicon CPUs)."""

    name = "local"

    def __init__(self, config: Config) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise TranscriptionError(
                "STT_BACKEND=local needs faster-whisper: pip install faster-whisper", detail=str(exc)
            ) from exc
        log.info("Loading local Whisper model %r (the first run downloads it)...", config.local_whisper_model)
        self._model = WhisperModel(config.local_whisper_model, device="auto", compute_type="int8")
        self._language = config.language

    def transcribe(self, clip: AudioClip) -> str:
        # faster-whisper expects 16 kHz float32, which is exactly what Recorder produces.
        segments, _info = self._model.transcribe(
            clip.samples, language=self._language, beam_size=1, vad_filter=True
        )
        return clean_transcript(" ".join(segment.text for segment in segments))


class GoogleWebSpeechTranscriber:
    """The free Google Web Speech endpoint via the ``SpeechRecognition`` package.

    Audio is handed over as an in-memory WAV, so PyAudio is *not* required.
    """

    name = "google"

    def __init__(self, config: Config) -> None:
        import speech_recognition as sr

        self._sr = sr
        self._recognizer = sr.Recognizer()
        self._language = config.language if "-" in config.language else f"{config.language}-US"

    def transcribe(self, clip: AudioClip) -> str:
        sr = self._sr
        with sr.AudioFile(io.BytesIO(clip.to_wav_bytes())) as source:
            audio = self._recognizer.record(source)
        try:
            return clean_transcript(self._recognizer.recognize_google(audio, language=self._language))
        except sr.UnknownValueError:
            return ""  # speech was unintelligible
        except sr.RequestError as exc:
            raise TranscriptionError("Google speech recognition is unavailable right now.", detail=str(exc)) from exc


def build_transcriber(config: Config, gemini_client: Any = None) -> Transcriber | None:
    """Instantiate the backend named by ``config.stt_backend``.

    Returns ``None`` for ``gemini-direct``, where no separate transcriber is used.
    """
    if config.stt_backend == "gemini-direct":
        return None
    if config.stt_backend == "gemini":
        if gemini_client is None:
            raise ValueError("The gemini STT backend needs the shared Gemini client")
        return GeminiTranscriber(config, gemini_client)
    if config.stt_backend == "openai":
        return OpenAIWhisperTranscriber(config)
    if config.stt_backend == "local":
        return LocalWhisperTranscriber(config)
    if config.stt_backend == "google":
        return GoogleWebSpeechTranscriber(config)
    raise ValueError(f"Unknown STT backend {config.stt_backend!r}")
