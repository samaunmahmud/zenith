"""``python -m voice_assistant --doctor``: check the whole setup in one go.

Runs each check in order, prints ✅ / ⚠️ / ❌ with a fix for anything that's wrong, and
exits non-zero if something is broken. Checks are independent, so one failure doesn't
hide the others.
"""

from __future__ import annotations

import importlib
import platform
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass

from . import permissions
from .config import Config, ConfigError

OK, WARN, FAIL = "✅", "⚠️ ", "❌"


@dataclass
class Check:
    status: str
    title: str
    detail: str = ""
    fix: str = ""


def _print(check: Check) -> None:
    line = f"{check.status} {check.title}"
    if check.detail:
        line += f": {check.detail}"
    print(line, flush=True)
    if check.fix:
        print(f"     → {check.fix}", flush=True)


def check_python() -> Check:
    version = platform.python_version()
    if sys.version_info >= (3, 10):
        return Check(OK, "Python", version)
    return Check(FAIL, "Python", version, "Python 3.10 or newer is required (brew install python@3.12).")


def check_platform() -> Check:
    if sys.platform != "darwin":
        return Check(WARN, "Platform", platform.platform(), "Only --text --dry-run works outside macOS.")
    return Check(OK, "macOS", f"{platform.mac_ver()[0]} ({platform.machine()})")


def check_config() -> tuple[Check, Config | None]:
    try:
        config = Config.from_env()
    except ConfigError as exc:
        return Check(FAIL, "Configuration", str(exc), "cp .env.example .env and set GEMINI_API_KEY."), None
    key = config.gemini_api_key
    masked = f"{key[:4]}…{key[-4:]}" if len(key) > 10 else "set"
    return Check(OK, "Configuration", f"key {masked}, model {config.gemini_model}, STT {config.stt_backend}"), config


def check_packages(config: Config | None) -> list[Check]:
    modules = {"google.genai": "google-genai", "sounddevice": "sounddevice", "pynput": "pynput", "pyautogui": "pyautogui"}
    backend = config.stt_backend if config else None
    extra = {"openai": ("openai", "openai"), "google": ("speech_recognition", "SpeechRecognition"),
             "local": ("faster_whisper", "faster-whisper")}
    if backend in extra:
        module, package = extra[backend]
        modules[module] = package
    checks = []
    for module, package in modules.items():
        try:
            importlib.import_module(module)
            checks.append(Check(OK, f"Package {package}"))
        except Exception as exc:  # noqa: BLE001 - import can fail in many ways (missing lib, no display)
            checks.append(Check(FAIL, f"Package {package}", f"{type(exc).__name__}: {exc}", f"pip install {package}"))
    return checks


def check_permissions(open_settings: bool) -> list[Check]:
    checks = []
    for name, label, probe, purpose in (
        ("input_monitoring", "Input Monitoring", permissions.input_monitoring_granted, "detect the hotkey"),
        ("accessibility", "Accessibility", permissions.accessibility_granted, "type text"),
    ):
        granted = probe()
        if granted is None:
            checks.append(Check(WARN, label, "couldn't be checked on this system"))
        elif granted:
            checks.append(Check(OK, label))
        else:
            fix = f"Needed to {purpose}. Enable your terminal in System Settings > Privacy & Security > {label}, then restart it."
            checks.append(Check(FAIL, label, "not granted", fix))
            if open_settings:
                if name == "input_monitoring":
                    permissions.request_input_monitoring()
                permissions.open_settings(name)
    return checks


def check_microphone(config: Config | None) -> Check:
    try:
        import sounddevice as sd

        from .audio import Recorder

        device = sd.query_devices(kind="input")
    except Exception as exc:  # noqa: BLE001
        return Check(FAIL, "Microphone", f"no input device ({exc})", "Connect a microphone or check System Settings > Sound.")

    print(f"   🎙  Recording 2 seconds from “{device['name']}”. Say something now...", flush=True)
    recorder = Recorder(config.sample_rate if config else 16_000, max_seconds=5)
    try:
        recorder.start()
        time.sleep(2.0)
        clip = recorder.stop()
    except Exception as exc:  # noqa: BLE001
        return Check(FAIL, "Microphone", str(exc), "Grant Microphone permission to your terminal.")

    threshold = config.silence_rms_threshold if config else 0.004
    level = f"level {clip.rms:.4f} (silence threshold {threshold})"
    if clip.rms == 0.0:
        return Check(FAIL, "Microphone", f"recorded pure silence, {level}",
                     "macOS is blocking the mic: System Settings > Privacy & Security > Microphone.")
    if clip.rms < threshold:
        return Check(WARN, "Microphone", f"very quiet, {level}",
                     "Speak up, pick another input device, or lower SILENCE_RMS_THRESHOLD.")
    return Check(OK, "Microphone", f"“{device['name']}”, {level}")


def check_gemini(config: Config | None) -> Check:
    if config is None:
        return Check(WARN, "Gemini API", "skipped (no configuration)")
    from .ai_client import GeminiBrain

    started = time.perf_counter()
    try:
        action = GeminiBrain(config).decide("what is two plus two")
    except Exception as exc:  # noqa: BLE001
        message = getattr(exc, "user_message", str(exc))
        return Check(FAIL, "Gemini API", message, "Check GEMINI_API_KEY / GEMINI_MODEL in .env.")
    elapsed = time.perf_counter() - started
    return Check(OK, "Gemini API", f"{config.gemini_model} answered {action.intent.value} in {elapsed:.2f}s")


def check_apps_and_automation() -> list[Check]:
    from .mac_controller import AutomationError, MacController

    mac = MacController(sound_cues=False, dry_run=sys.platform != "darwin")
    apps = mac.installed_apps()
    checks = [Check(OK if apps else WARN, "Installed apps", f"{len(apps)} found")]
    if sys.platform != "darwin":
        return checks
    try:
        output = mac.run_applescript(
            'tell application "System Events" to get name of first application process whose frontmost is true',
            timeout=10,
        )
        checks.append(Check(OK, "Automation (System Events)", f"frontmost app is {output}"))
    except AutomationError as exc:
        checks.append(Check(FAIL, "Automation (System Events)", exc.user_message,
                            "Allow System Events for your terminal under Privacy & Security > Automation."))
    return checks


def run_doctor(open_settings: bool = True, test_microphone: bool = True) -> int:
    """Run every check and print a report. Returns 0 if nothing failed, else 1."""
    print("\n🩺 Voice assistant doctor\n", flush=True)
    results: list[Check] = []

    def run(step: Callable[[], Check | list[Check]]) -> None:
        outcome = step()
        for check in outcome if isinstance(outcome, list) else [outcome]:
            _print(check)
            results.append(check)

    run(check_python)
    run(check_platform)
    config_check, config = check_config()
    _print(config_check)
    results.append(config_check)
    run(lambda: check_packages(config))
    run(lambda: check_permissions(open_settings))
    if test_microphone:
        run(lambda: check_microphone(config))
    run(lambda: check_gemini(config))
    run(check_apps_and_automation)

    failed = [c for c in results if c.status == FAIL]
    warned = [c for c in results if c.status == WARN]
    print()
    if failed:
        print(f"{FAIL} {len(failed)} problem(s) to fix. After changing permissions, restart your terminal.")
        return 1
    print(f"{OK} All good{f' ({len(warned)} warning(s))' if warned else ''}. Run: python -m voice_assistant")
    return 0
