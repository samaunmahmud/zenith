"""Microphone capture and the global push-to-talk hotkey.

How the listening loop works:

1. :class:`PushToTalk` runs a ``pynput`` keyboard listener on a background thread.
2. When the hotkey goes down (or is tapped, in toggle mode) it starts :class:`Recorder`,
   which streams 16 kHz mono audio from the default input device via ``sounddevice``.
3. When the hotkey is released (or tapped again) recording stops and the finished
   :class:`AudioClip` is put on a queue. Pressing Esc while recording throws the
   recording away instead.
4. The main thread blocks on :meth:`PushToTalk.next_clip` and processes one clip at a
   time. While it is busy, new presses are ignored so commands never overlap.

``sounddevice`` and ``pynput`` are imported lazily so the rest of the package (and the
tests) work on machines without audio hardware.
"""

from __future__ import annotations

import io
import logging
import queue
import threading
import time
import wave
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np

from .config import ConfigError

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class AudioClip:
    """A finished recording: mono float32 samples in [-1, 1]."""

    samples: np.ndarray
    sample_rate: int

    @property
    def duration(self) -> float:
        """Length in seconds."""
        return len(self.samples) / float(self.sample_rate)

    @property
    def rms(self) -> float:
        """Root-mean-square loudness, used to skip clips that are just silence."""
        if self.samples.size == 0:
            return 0.0
        return float(np.sqrt(np.mean(np.square(self.samples, dtype=np.float64))))

    def to_wav_bytes(self) -> bytes:
        """Encode as a 16-bit PCM WAV file in memory (what the STT APIs expect)."""
        pcm = (np.clip(self.samples, -1.0, 1.0) * 32767).astype("<i2")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(self.sample_rate)
            wav.writeframes(pcm.tobytes())
        return buffer.getvalue()


class MicrophoneError(Exception):
    """The microphone couldn't be opened (missing permission, no device...)."""


class Recorder:
    """Records from the default input device between :meth:`start` and :meth:`stop`."""

    def __init__(self, sample_rate: int = 16_000, max_seconds: float = 60.0) -> None:
        self.sample_rate = sample_rate
        self._max_frames = int(sample_rate * max_seconds)
        self._chunks: list[np.ndarray] = []
        self._frames = 0
        self._lock = threading.Lock()
        self._stream: Any = None

    @property
    def is_recording(self) -> bool:
        return self._stream is not None

    def _callback(self, indata: np.ndarray, frames: int, _time: Any, status: Any) -> None:
        # Runs on PortAudio's real-time thread: keep it tiny, never block or log heavily.
        if status:
            log.debug("Audio stream status: %s", status)
        with self._lock:
            if self._frames >= self._max_frames:
                return
            self._chunks.append(indata[:, 0].copy())
            self._frames += frames

    def start(self) -> None:
        """Open the microphone and begin buffering audio.

        Raises:
            MicrophoneError: If no input device is available or access was denied.
        """
        import sounddevice as sd  # lazy: needs PortAudio

        with self._lock:
            self._chunks, self._frames = [], 0
        try:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate, channels=1, dtype="float32", callback=self._callback
            )
            self._stream.start()
        except Exception as exc:
            self._stream = None
            raise MicrophoneError(
                f"Couldn't open the microphone ({exc}). Check System Settings > Privacy & Security > "
                "Microphone for your terminal app."
            ) from exc

    def stop(self) -> AudioClip:
        """Stop recording and return everything captured since :meth:`start`."""
        if self._stream is not None:
            try:
                self._stream.stop()
                self._stream.close()
            finally:
                self._stream = None
        with self._lock:
            samples = np.concatenate(self._chunks) if self._chunks else np.zeros(0, dtype=np.float32)
            self._chunks, self._frames = [], 0
        if len(samples) >= self._max_frames:
            log.warning("Recording hit the %.0fs limit and was cut off.", self._max_frames / self.sample_rate)
        return AudioClip(samples=samples, sample_rate=self.sample_rate)


def parse_hotkey(name: str) -> Any:
    """Turn a name like ``"alt_r"``, ``"f8"`` or ``"\\`"`` into a pynput key object.

    Any attribute of ``pynput.keyboard.Key`` works (``cmd_r``, ``ctrl_r``, ``f13`` ...), as
    does a single character.
    """
    from pynput import keyboard  # lazy: needs a GUI session

    name = name.strip().lower()
    if hasattr(keyboard.Key, name):
        return getattr(keyboard.Key, name)
    if len(name) == 1:
        return keyboard.KeyCode.from_char(name)
    raise ConfigError(f"Unknown HOTKEY {name!r}. Try alt_r, cmd_r, ctrl_r, f8 or a single character.")


class PushToTalk:
    """Global hotkey that turns key presses into :class:`AudioClip` objects.

    Args:
        recorder: The microphone recorder to drive.
        hotkey: Key name, see :func:`parse_hotkey`.
        mode: ``"hold"`` records while the key is held down; ``"toggle"`` starts on one
            tap and stops on the next.
        on_start / on_stop / on_cancel: Optional callbacks (sound cues, stopping speech...).
            They run on the listener thread, so they must return quickly.
        cancel_key: Key that discards the recording in progress (default Esc).
    """

    def __init__(
        self,
        recorder: Recorder,
        hotkey: str = "alt_r",
        mode: str = "hold",
        on_start: Callable[[], None] | None = None,
        on_stop: Callable[[], None] | None = None,
        on_cancel: Callable[[], None] | None = None,
        cancel_key: str = "esc",
    ) -> None:
        self._recorder = recorder
        self._key = parse_hotkey(hotkey)
        self._cancel_key = parse_hotkey(cancel_key)
        self._on_cancel = on_cancel
        self._hotkey_name = hotkey
        self._mode = mode
        self._on_start = on_start
        self._on_stop = on_stop
        self._clips: queue.Queue[AudioClip | Exception] = queue.Queue()
        self._busy = threading.Event()
        self._listener: Any = None
        self._started_at = 0.0

    @property
    def hotkey_name(self) -> str:
        return self._hotkey_name

    def start(self) -> None:
        """Begin listening for the hotkey (non-blocking)."""
        from pynput import keyboard

        self._listener = keyboard.Listener(on_press=self._on_press, on_release=self._on_release)
        self._listener.daemon = True
        self._listener.start()

    def stop(self) -> None:
        """Stop the listener and discard any recording in progress."""
        if self._listener is not None:
            self._listener.stop()
            self._listener = None
        if self._recorder.is_recording:
            self._recorder.stop()

    def set_busy(self, busy: bool) -> None:
        """While busy, presses are ignored so a new command can't interrupt the current one."""
        if busy:
            self._busy.set()
        else:
            self._busy.clear()

    def next_clip(self, timeout: float | None = None) -> AudioClip | None:
        """Block until the next recording is finished. Returns ``None`` on timeout.

        Raises:
            MicrophoneError: If the microphone failed while starting a recording.
        """
        try:
            item = self._clips.get(timeout=timeout)
        except queue.Empty:
            return None
        if isinstance(item, Exception):
            raise item
        return item

    # --- listener-thread callbacks -------------------------------------------------

    def _matches(self, key: Any) -> bool:
        return key == self._key

    def _begin(self) -> None:
        if self._busy.is_set():
            log.info("Still working on the last command; ignoring the hotkey.")
            return
        try:
            self._recorder.start()
        except MicrophoneError as exc:
            self._clips.put(exc)
            return
        self._started_at = time.monotonic()
        log.info("[1/4] 🎙  Listening... (%s)", "release to finish" if self._mode == "hold" else "tap again to finish")
        if self._on_start:
            self._on_start()

    def _finish(self) -> None:
        clip = self._recorder.stop()
        if self._on_stop:
            self._on_stop()
        log.debug("Recorded %.2fs in %.2fs wall time", clip.duration, time.monotonic() - self._started_at)
        self._clips.put(clip)

    def _cancel(self) -> None:
        clip = self._recorder.stop()
        log.info("[1/4] ✋ Recording cancelled (%.1fs discarded).", clip.duration)
        if self._on_cancel:
            self._on_cancel()

    def _on_press(self, key: Any) -> None:
        if key == self._cancel_key and self._recorder.is_recording:
            self._cancel()
            return
        if not self._matches(key):
            return
        if self._mode == "hold":
            # Holding a character key auto-repeats presses; only the first one counts.
            if not self._recorder.is_recording:
                self._begin()
        elif self._recorder.is_recording:
            self._finish()
        else:
            self._begin()

    def _on_release(self, key: Any) -> None:
        if self._mode == "hold" and self._matches(key) and self._recorder.is_recording:
            self._finish()
