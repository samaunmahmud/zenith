"""Entry point and orchestrator: hotkey -> record -> transcribe -> decide -> act.

Run with ``python -m voice_assistant`` (see ``--help``). Every stage logs a numbered step
so you can follow what the assistant is doing in real time::

    [1/4] 🎙  Listening... (release to finish)
    [2/4] 📝 Transcribing 2.1s of audio with gemini
    [2/4] 📝 Heard: "open spotify"
    [3/4] 🧠 Thinking...
    [3/4] 🧠 Intent OPEN_APP (confidence 0.98) in 0.62s
    [4/4] ⚙️  Opening Spotify (/Applications/Spotify.app)
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from types import FrameType

from .ai_client import AIServiceError, AssistantAction, GeminiBrain, Intent
from .audio import AudioClip, MicrophoneError, PushToTalk, Recorder
from .config import STT_BACKENDS, Config, ConfigError
from .mac_controller import AutomationError, FrontApp, MacController
from .stt import Transcriber, TranscriptionError, build_transcriber

log = logging.getLogger("voice_assistant")

LOW_CONFIDENCE = 0.45  # below this, WRITE_TEXT / OPEN_APP ask for confirmation instead of acting


class Assistant:
    """Wires the components together and runs one command at a time.

    Every component is injected, so tests can swap in fakes.
    """

    def __init__(
        self,
        config: Config,
        brain: GeminiBrain,
        mac: MacController,
        transcriber: Transcriber | None = None,
    ) -> None:
        self.config = config
        self.brain = brain
        self.mac = mac
        self.transcriber = transcriber

    # ------------------------------------------------------------------ pipeline

    def handle_clip(self, clip: AudioClip) -> None:
        """Steps 2-4 for one recording. Never raises: every failure is reported to the user."""
        if clip.duration < self.config.min_record_seconds:
            log.info("[2/4] Recording too short (%.2fs); ignoring. Hold the hotkey while you speak.", clip.duration)
            return
        if clip.rms < self.config.silence_rms_threshold:
            log.info("[2/4] Only silence recorded (level %.4f); ignoring. Is the right microphone selected?", clip.rms)
            self._say_error("I didn't hear anything.")
            return

        assert self.transcriber is not None, "voice mode needs a transcriber"
        log.info("[2/4] 📝 Transcribing %.1fs of audio with %s", clip.duration, self.transcriber.name)
        started = time.perf_counter()
        try:
            transcript = self.transcriber.transcribe(clip)
        except TranscriptionError as exc:
            log.error("[2/4] Transcription failed: %s", exc)
            self._say_error(exc.user_message)
            return
        except Exception:
            log.exception("[2/4] Unexpected transcription error")
            self._say_error("Speech recognition failed.")
            return

        if not transcript:
            log.info("[2/4] No intelligible speech recognised.")
            self._say_error("Sorry, I didn't catch that.")
            return
        log.info('[2/4] 📝 Heard: "%s" (%.2fs)', transcript, time.perf_counter() - started)
        self.handle_command(transcript)

    def handle_command(self, transcript: str) -> None:
        """Steps 3-4: ask Gemini what to do, then do it. Never raises."""
        front = self.mac.frontmost_app()
        log.info("[3/4] 🧠 Thinking...%s", f" (frontmost: {front.name})" if front else "")
        started = time.perf_counter()
        try:
            action = self.brain.decide(transcript, frontmost_app=front.name if front else None)
        except AIServiceError as exc:
            log.error("[3/4] Gemini failed: %s", exc)
            self._say_error(exc.user_message)
            return
        except Exception:
            log.exception("[3/4] Unexpected error talking to Gemini")
            self._say_error("Something went wrong while thinking about that.")
            return
        log.info(
            "[3/4] 🧠 Intent %s (confidence %.2f) in %.2fs",
            action.intent.value, action.confidence, time.perf_counter() - started,
        )

        try:
            self.execute(action, front)
        except AutomationError as exc:
            log.error("[4/4] %s", exc)
            self._say_error(exc.user_message)
        except Exception:
            log.exception("[4/4] Unexpected error while executing %s", action.intent.value)
            self._say_error("Something went wrong while doing that.")

    def execute(self, action: AssistantAction, front: FrontApp | None = None) -> None:
        """Step 4: carry out a decided action.

        Raises:
            AutomationError: If macOS couldn't perform it (app missing, permission denied...).
        """
        if action.intent in (Intent.OPEN_APP, Intent.WRITE_TEXT) and action.confidence < LOW_CONFIDENCE:
            log.info("[4/4] Low confidence (%.2f); asking instead of acting.", action.confidence)
            what = f"open {action.app_name}" if action.intent is Intent.OPEN_APP else "type that"
            self._reply(f"I'm not sure I understood. Did you want me to {what}? Please say it again.")
            return

        if action.intent is Intent.OPEN_APP:
            log.info("[4/4] ⚙️  Opening app %r", action.app_name)
            app = self.mac.open_app(action.app_name or "")
            print(f"✅ Opened {app.name}")

        elif action.intent is Intent.WRITE_TEXT:
            text = action.text or ""
            if action.app_name:
                log.info("[4/4] ⚙️  Opening %r to write in it", action.app_name)
                self.mac.open_app(action.app_name)
            elif front:
                self.mac.focus(front)  # make sure keystrokes go back where the user was
            log.info("[4/4] ⌨️  Writing %d characters", len(text))
            self.mac.type_text(text)
            print(f"✅ Wrote {len(text)} characters")

        else:  # ANSWER_QUESTION or UNCLEAR
            label = "💬" if action.intent is Intent.ANSWER_QUESTION else "❓"
            log.info("[4/4] %s Replying", label)
            self._reply(action.answer or "")

    # ------------------------------------------------------------------ output

    def _reply(self, text: str) -> None:
        print(f"\n🤖 {text}\n", flush=True)
        if self.config.speak_responses:
            self.mac.speak(text)

    def _say_error(self, message: str) -> None:
        print(f"⚠️  {message}", flush=True)
        self.mac.play_cue("error")
        if self.config.speak_responses:
            self.mac.speak(message)

    # ------------------------------------------------------------------ loops

    def run_voice(self) -> None:
        """Push-to-talk loop: blocks until Ctrl+C."""
        recorder = Recorder(self.config.sample_rate, self.config.max_record_seconds)

        def on_start() -> None:
            self.mac.stop_speaking()  # talking over the assistant interrupts it
            self.mac.play_cue("start")

        ptt = PushToTalk(
            recorder, self.config.hotkey, self.config.ptt_mode,
            on_start=on_start, on_stop=lambda: self.mac.play_cue("stop"),
        )
        ptt.start()
        verb = "Hold" if self.config.ptt_mode == "hold" else "Tap"
        print(f"\n✨ Ready. {verb} [{ptt.hotkey_name}] and speak. Press Ctrl+C to quit.\n", flush=True)
        try:
            while True:
                try:
                    clip = ptt.next_clip(timeout=0.5)  # short timeout keeps Ctrl+C responsive
                except MicrophoneError as exc:
                    log.error("%s", exc)
                    self._say_error("I couldn't access the microphone.")
                    continue
                if clip is None:
                    continue
                ptt.set_busy(True)
                try:
                    self.handle_clip(clip)
                finally:
                    ptt.set_busy(False)
                    log.info("Ready for the next command.")
        finally:
            ptt.stop()

    def run_text(self) -> None:
        """Keyboard loop: type commands instead of speaking (handy for testing prompts)."""
        print("\n✨ Text mode. Type a command and press Enter (Ctrl+D or 'quit' to exit).\n", flush=True)
        while True:
            try:
                line = input("you › ").strip()
            except EOFError:
                print()
                return
            if line.lower() in ("quit", "exit"):
                return
            if line:
                self.handle_command(line)


def setup_logging(level: str) -> None:
    """Timestamped, single-line logs; third-party libraries are kept quiet unless debugging."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stderr,
    )
    if level != "DEBUG":
        for noisy in ("httpx", "httpcore", "google_genai", "urllib3", "openai", "faster_whisper"):
            logging.getLogger(noisy).setLevel(logging.WARNING)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="voice_assistant", description="Push-to-talk macOS voice assistant powered by Gemini.")
    parser.add_argument("--text", action="store_true", help="type commands in the terminal instead of speaking")
    parser.add_argument("--stt", choices=STT_BACKENDS, help="speech-to-text backend (overrides STT_BACKEND)")
    parser.add_argument("--hotkey", help="push-to-talk key, e.g. alt_r, cmd_r, f8 (overrides HOTKEY)")
    parser.add_argument("--toggle", action="store_true", help="tap the hotkey to start/stop instead of holding it")
    parser.add_argument("--no-speak", action="store_true", help="print answers without reading them aloud")
    parser.add_argument("--dry-run", action="store_true", help="log actions instead of opening apps or typing")
    parser.add_argument("--env-file", help="path to a .env file (default: ./.env)")
    parser.add_argument("--debug", action="store_true", help="verbose logging")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns a process exit code."""
    args = parse_args(argv)
    try:
        config = Config.from_env(args.env_file).with_overrides(
            stt_backend=args.stt,
            hotkey=args.hotkey,
            ptt_mode="toggle" if args.toggle else None,
            speak_responses=False if args.no_speak else None,
            dry_run=True if args.dry_run else None,
            log_level="DEBUG" if args.debug else None,
        )
    except ConfigError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    setup_logging(config.log_level)
    log.info("Model %s | STT %s | hotkey %s (%s)%s", config.gemini_model, config.stt_backend,
             config.hotkey, config.ptt_mode, " | DRY RUN" if config.dry_run else "")

    mac = MacController(
        typing_interval=config.typing_interval,
        paste_threshold=config.paste_threshold,
        tts_voice=config.tts_voice,
        tts_rate=config.tts_rate,
        sound_cues=config.sound_cues,
        dry_run=config.dry_run,
    )
    brain = GeminiBrain(config)

    # Turn SIGTERM into a clean KeyboardInterrupt exit as well.
    def _terminate(_signum: int, _frame: FrameType | None) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, _terminate)

    try:
        if args.text:
            Assistant(config, brain, mac).run_text()
        else:
            try:
                transcriber = build_transcriber(config, gemini_client=brain.client)
            except TranscriptionError as exc:
                print(f"Speech-to-text setup failed: {exc}", file=sys.stderr)
                return 2
            mac.installed_apps()  # warm the app cache so the first "open ..." is instant
            Assistant(config, brain, mac, transcriber).run_voice()
    except KeyboardInterrupt:
        print("\n👋 Bye.")
    finally:
        mac.stop_speaking()
    return 0


if __name__ == "__main__":
    sys.exit(main())
