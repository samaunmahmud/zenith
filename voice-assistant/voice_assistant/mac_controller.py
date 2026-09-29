"""macOS automation: find, launch and focus apps, type text, and speak.

Design notes:

* **Apps are resolved before AppleScript sees them.** ``tell application "Nonsense"``
  pops a modal "Where is Nonsense?" dialog, so spoken names are first matched against the
  apps actually installed (aliases, exact, whole-word and fuzzy matching, then Spotlight).
  Only a real app ever reaches ``osascript``, and it is addressed by bundle id.
* **Arguments are passed via ``argv``**, never pasted into AppleScript source, so an app
  name or text containing quotes can't break (or inject into) the script.
* **Typing uses two strategies.** Short ASCII text is typed key by key with ``pyautogui``
  (looks natural, works in every text field). Long or non-ASCII text (accents, emoji, CJK)
  is pasted through the clipboard, which ``pyautogui`` can't type and which is much faster;
  the previous clipboard content is restored afterwards.
"""

from __future__ import annotations

import difflib
import logging
import os
import plistlib
import re
import subprocess
import sys
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# Spoken nicknames -> the app's real name. Keys are already normalised (see _normalise).
# A tuple lists candidates in order of preference; the first one installed wins.
APP_ALIASES: dict[str, str | tuple[str, ...]] = {
    "vs code": "Visual Studio Code",
    "vscode": "Visual Studio Code",
    "code": "Visual Studio Code",
    "visual studio": "Visual Studio Code",
    "chrome": "Google Chrome",
    "google": "Google Chrome",
    "firefox": "Firefox",
    "edge": "Microsoft Edge",
    "word": "Microsoft Word",
    "excel": "Microsoft Excel",
    "powerpoint": "Microsoft PowerPoint",
    "outlook": "Microsoft Outlook",
    "teams": "Microsoft Teams",
    "onenote": "Microsoft OneNote",
    # Renamed from System Preferences in macOS 13.
    "settings": ("System Settings", "System Preferences"),
    "system settings": ("System Settings", "System Preferences"),
    "system preferences": ("System Settings", "System Preferences"),
    "preferences": ("System Settings", "System Preferences"),
    "iterm": "iTerm",
    "iterm2": "iTerm",
    "zoom": "zoom.us",
    "whatsapp": "WhatsApp",
    "app store": "App Store",
    "mail": "Mail",
    "email": "Mail",
    "music": "Music",
    "itunes": "Music",
    "calculator": "Calculator",
    "calendar": "Calendar",
    "photos": "Photos",
    "facetime": "FaceTime",
    "activity monitor": "Activity Monitor",
    "task manager": "Activity Monitor",
    "notes": "Notes",
    "reminders": "Reminders",
    "messages": "Messages",
    "imessage": "Messages",
    "finder": "Finder",
    "files": "Finder",
    "safari": "Safari",
}

APP_DIRECTORIES: tuple[Path, ...] = (
    Path("/Applications"),
    Path("/Applications/Utilities"),
    Path("/System/Applications"),
    Path("/System/Applications/Utilities"),
    Path.home() / "Applications",
    Path.home() / "Applications/Chrome Apps.localized",
    # Since macOS 13, Safari's real bundle lives in a cryptex; /Applications has a stub.
    Path("/System/Volumes/Preboot/Cryptexes/App/System/Applications"),
)
# Finder lives outside the normal folders.
EXTRA_APPS: tuple[Path, ...] = (Path("/System/Library/CoreServices/Finder.app"),)

SOUNDS = {
    "start": "/System/Library/Sounds/Tink.aiff",
    "stop": "/System/Library/Sounds/Pop.aiff",
    "error": "/System/Library/Sounds/Basso.aiff",
}

_ACTIVATE_BY_ID = """
on run argv
    tell application id (item 1 of argv) to activate
end run
"""
_ACTIVATE_BY_NAME = """
on run argv
    tell application (item 1 of argv) to activate
end run
"""
_FRONTMOST = """
tell application "System Events"
    set p to first application process whose frontmost is true
    return (name of p) & linefeed & (bundle identifier of p)
end tell
"""
_PASTE = 'tell application "System Events" to keystroke "v" using command down'


class AutomationError(Exception):
    """A macOS automation step failed. ``user_message`` is safe to read aloud."""

    def __init__(self, user_message: str, *, detail: str = "") -> None:
        super().__init__(detail or user_message)
        self.user_message = user_message


class AppNotFoundError(AutomationError):
    """No installed app matches the spoken name."""

    def __init__(self, requested: str, suggestions: list[str]) -> None:
        if suggestions:
            options = " or ".join(suggestions)
            message = f"I couldn't find an app called {requested}. Did you mean {options}?"
        else:
            message = f"I couldn't find an app called {requested}."
        super().__init__(message)
        self.requested = requested
        self.suggestions = suggestions


@dataclass(frozen=True)
class InstalledApp:
    """An ``.app`` bundle on disk."""

    name: str
    path: Path

    @cached_property
    def bundle_id(self) -> str | None:
        """``CFBundleIdentifier`` from the bundle's Info.plist, e.g. ``com.apple.Safari``."""
        try:
            with open(self.path / "Contents" / "Info.plist", "rb") as fh:
                return plistlib.load(fh).get("CFBundleIdentifier")
        except (OSError, plistlib.InvalidFileException, ValueError):
            return None


@dataclass(frozen=True)
class FrontApp:
    """The app that currently has keyboard focus."""

    name: str
    bundle_id: str | None


def _normalise(name: str) -> str:
    """Lower-case, drop punctuation and filler so "the VS-Code app" becomes "vs code"."""
    name = name.lower().strip()
    name = re.sub(r"\.app$", "", name)
    name = re.sub(r"[^\w\s.+]", " ", name)
    name = re.sub(r"^(the|my)\s+", "", name)
    name = re.sub(r"\s+(app|application)$", "", name)
    return " ".join(name.split())


def scan_applications(directories: Iterable[Path] = APP_DIRECTORIES, extra: Iterable[Path] = EXTRA_APPS) -> list[InstalledApp]:
    """List ``.app`` bundles in the standard folders, one level of sub-folders deep.

    One level of nesting catches suites installed in their own folder, like
    ``/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app``.
    """
    found: dict[str, InstalledApp] = {}

    def add(path: Path) -> None:
        name = path.stem
        found.setdefault(name.lower(), InstalledApp(name=name, path=path))

    for directory in directories:
        try:
            entries = list(directory.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.suffix == ".app":
                add(entry)
            elif entry.is_dir() and not entry.name.startswith("."):
                try:
                    for child in entry.iterdir():
                        if child.suffix == ".app":
                            add(child)
                except OSError:
                    continue
    for path in extra:
        if path.exists():
            add(path)
    return sorted(found.values(), key=lambda app: app.name.lower())


class MacController:
    """High-level macOS actions used by the assistant.

    Args:
        typing_interval: Delay between simulated keystrokes, in seconds.
        paste_threshold: Text longer than this many characters is pasted, not typed.
        tts_voice / tts_rate: Passed to the ``say`` command.
        sound_cues: Play short system sounds when recording starts/stops.
        dry_run: Log every action instead of performing it (safe for testing).
        runner / popen: Injected ``subprocess.run`` / ``subprocess.Popen`` for tests.
        app_scanner: Injected app lister for tests.
    """

    def __init__(
        self,
        *,
        typing_interval: float = 0.008,
        paste_threshold: int = 300,
        tts_voice: str | None = None,
        tts_rate: int = 190,
        sound_cues: bool = True,
        dry_run: bool = False,
        runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
        popen: Callable[..., Any] = subprocess.Popen,
        app_scanner: Callable[[], list[InstalledApp]] = scan_applications,
    ) -> None:
        self.typing_interval = typing_interval
        self.paste_threshold = paste_threshold
        self.tts_voice = tts_voice
        self.tts_rate = tts_rate
        self.sound_cues = sound_cues
        self.dry_run = dry_run
        self._run = runner
        self._popen = popen
        self._scan = app_scanner
        self._apps: list[InstalledApp] | None = None
        self._speech: Any = None
        if sys.platform != "darwin" and not dry_run:
            log.warning("Not running on macOS: app control, typing and speech will fail. Use --dry-run.")

    # ------------------------------------------------------------------ low level

    def run_applescript(self, script: str, *args: str, timeout: float = 10.0) -> str:
        """Run AppleScript source with ``osascript``; ``args`` arrive as ``argv`` in ``on run``.

        Raises:
            AutomationError: With a hint about permissions when macOS blocks the script.
        """
        try:
            result = self._run(
                ["osascript", "-e", script, *args], capture_output=True, text=True, timeout=timeout, check=False
            )
        except FileNotFoundError as exc:
            raise AutomationError("osascript isn't available; this only works on macOS.", detail=str(exc)) from exc
        except subprocess.TimeoutExpired as exc:
            raise AutomationError("macOS took too long to respond.", detail=str(exc)) from exc
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            if "-1743" in stderr or "not allowed" in stderr.lower() or "-25211" in stderr:
                raise AutomationError(
                    "macOS blocked the automation. Allow your terminal under System Settings, Privacy and "
                    "Security, in both Accessibility and Automation.",
                    detail=stderr,
                )
            raise AutomationError("That macOS action failed.", detail=stderr)
        return (result.stdout or "").strip()

    # ------------------------------------------------------------------ apps

    def installed_apps(self, refresh: bool = False) -> list[InstalledApp]:
        """Installed apps, scanned once and cached."""
        if self._apps is None or refresh:
            self._apps = self._scan()
            log.debug("Found %d installed apps", len(self._apps))
        return self._apps

    def resolve_app(self, spoken_name: str) -> InstalledApp:
        """Match a spoken app name to an installed app.

        Tries, in order: alias table, exact name, name without spaces ("xcode"),
        whole-word match ("photoshop" -> "Adobe Photoshop 2025"), fuzzy match, Spotlight.

        Raises:
            AppNotFoundError: Nothing matched; carries up to three suggestions.
        """
        apps = self.installed_apps()
        by_norm = {_normalise(app.name): app for app in apps}
        query = _normalise(spoken_name)
        if not query:
            raise AppNotFoundError(spoken_name, [])

        alias = APP_ALIASES.get(query, ())
        for candidate in (alias,) if isinstance(alias, str) else alias:
            if _normalise(candidate) in by_norm:
                return by_norm[_normalise(candidate)]
        if query in by_norm:
            return by_norm[query]

        squashed = {norm.replace(" ", ""): app for norm, app in by_norm.items()}
        if query.replace(" ", "") in squashed:
            return squashed[query.replace(" ", "")]

        pattern = re.compile(rf"\b{re.escape(query)}\b")
        word_matches = [app for norm, app in by_norm.items() if pattern.search(norm)]
        if word_matches:
            return min(word_matches, key=lambda app: len(app.name))  # shortest = least specific

        close = difflib.get_close_matches(query, list(by_norm), n=1, cutoff=0.8)
        if close:
            return by_norm[close[0]]

        spotlight = self._spotlight_find(spoken_name)
        if spotlight:
            return spotlight

        suggestions = [by_norm[n].name for n in difflib.get_close_matches(query, list(by_norm), n=3, cutoff=0.5)]
        raise AppNotFoundError(spoken_name, suggestions)

    def _spotlight_find(self, name: str) -> InstalledApp | None:
        """Ask Spotlight for an application with this display name (catches odd install locations)."""
        safe = name.replace("'", "").replace('"', "").replace("*", "").strip()
        if not safe:
            return None
        query = f"kMDItemContentType == 'com.apple.application-bundle' && kMDItemDisplayName == '*{safe}*'cd"
        try:
            result = self._run(["mdfind", query], capture_output=True, text=True, timeout=5, check=False)
        except (OSError, subprocess.TimeoutExpired):
            return None
        paths = [Path(line) for line in (result.stdout or "").splitlines() if line.endswith(".app")]
        if not paths:
            return None
        best = min(paths, key=lambda p: len(p.stem))
        return InstalledApp(name=best.stem, path=best)

    def open_app(self, spoken_name: str, wait: bool = True) -> InstalledApp:
        """Launch (if needed) and focus an app, then wait until it is frontmost.

        Raises:
            AppNotFoundError: The name didn't match any installed app.
            AutomationError: macOS refused to launch it.
        """
        app = self.resolve_app(spoken_name)
        log.info("Opening %s (%s)", app.name, app.path)
        if self.dry_run:
            log.info("[dry-run] would activate %s", app.bundle_id or app.name)
            return app
        try:
            if app.bundle_id:
                self.run_applescript(_ACTIVATE_BY_ID, app.bundle_id, timeout=20)
            else:
                self.run_applescript(_ACTIVATE_BY_NAME, app.name, timeout=20)
        except AutomationError as exc:
            # `open` is a good fallback: it doesn't need Automation permission.
            log.warning("AppleScript activate failed (%s); falling back to `open`", exc)
            result = self._run(["open", str(app.path)], capture_output=True, text=True, timeout=20, check=False)
            if result.returncode != 0:
                raise AutomationError(f"I couldn't open {app.name}.", detail=result.stderr) from exc
        if wait:
            self.wait_until_frontmost(app)
        return app

    def frontmost_app(self) -> FrontApp | None:
        """The app with keyboard focus, or ``None`` if it couldn't be determined."""
        if self.dry_run:
            return None
        try:
            output = self.run_applescript(_FRONTMOST, timeout=3)
        except AutomationError as exc:
            log.debug("Couldn't read frontmost app: %s", exc)
            return None
        name, _, bundle_id = output.partition("\n")
        bundle_id = bundle_id.strip()
        return FrontApp(name=name.strip(), bundle_id=bundle_id if bundle_id and bundle_id != "missing value" else None)

    def focus(self, app: FrontApp) -> None:
        """Bring a previously frontmost app back into focus (before typing into it)."""
        if self.dry_run or not app.bundle_id:
            return
        try:
            self.run_applescript(_ACTIVATE_BY_ID, app.bundle_id, timeout=5)
        except AutomationError as exc:
            log.warning("Couldn't refocus %s: %s", app.name, exc)

    def wait_until_frontmost(self, app: InstalledApp, timeout: float = 8.0) -> bool:
        """Poll until ``app`` has focus, so typed text lands in the right window."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            front = self.frontmost_app()
            if front and ((app.bundle_id and front.bundle_id == app.bundle_id) or front.name == app.name):
                time.sleep(0.25)  # let the window finish appearing / take key focus
                return True
            time.sleep(0.15)
        log.warning("%s didn't come to the front within %.0fs", app.name, timeout)
        return False

    # ------------------------------------------------------------------ typing

    def type_text(self, text: str) -> None:
        """Insert ``text`` at the current cursor position of the frontmost app.

        Raises:
            AutomationError: Accessibility permission is missing or typing was aborted.
        """
        if not text:
            return
        use_paste = len(text) > self.paste_threshold or not text.isascii()
        how = "pasting" if use_paste else "typing"
        log.info("%s %d characters", how.capitalize(), len(text))
        if self.dry_run:
            log.info("[dry-run] would be %s:\n%s", how, text)
            return
        if use_paste:
            self._paste(text)
        else:
            self._type(text)

    def _type(self, text: str) -> None:
        import pyautogui  # lazy: needs a GUI session

        pyautogui.PAUSE = 0  # we control pacing with `interval`
        try:
            # write() maps \n to Return and \t to Tab.
            pyautogui.write(text, interval=self.typing_interval)
        except pyautogui.FailSafeException as exc:
            raise AutomationError("Typing stopped because the mouse hit a screen corner.", detail=str(exc)) from exc

    def _paste(self, text: str) -> None:
        clipboard = _Clipboard(self._run)
        snapshot = clipboard.snapshot()
        clipboard.set_text(text)
        try:
            self.run_applescript(_PASTE)
            time.sleep(0.5)  # give the target app time to read the clipboard before restoring it
        finally:
            clipboard.restore(snapshot)

    # ------------------------------------------------------------------ audio out

    def speak(self, text: str) -> None:
        """Read ``text`` aloud with the built-in ``say`` command, without blocking.

        Any speech still playing is cut off first.
        """
        if not text:
            return
        self.stop_speaking()
        if self.dry_run:
            log.info("[dry-run] would say: %s", text)
            return
        command = ["say", "-r", str(self.tts_rate)]
        if self.tts_voice:
            command += ["-v", self.tts_voice]
        try:
            self._speech = self._popen([*command, text], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError as exc:
            log.warning("Text-to-speech unavailable: %s", exc)

    def stop_speaking(self) -> None:
        """Interrupt the current ``say`` process, if any (called when you start talking)."""
        if self._speech is not None and self._speech.poll() is None:
            self._speech.terminate()
        self._speech = None

    def play_cue(self, kind: str) -> None:
        """Play a short system sound (``start``, ``stop`` or ``error``) without blocking."""
        path = SOUNDS.get(kind)
        if not self.sound_cues or self.dry_run or not path:
            return
        try:
            self._popen(["afplay", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError:
            pass


class _Clipboard:
    """Save, replace and restore the general pasteboard.

    With PyObjC's AppKit (installed alongside ``pyautogui`` on macOS) *every* type on the
    clipboard is saved, so an image, file or rich text you copied survives the paste.
    Without it, ``pbcopy``/``pbpaste`` are used, which only round-trip plain text.
    """

    def __init__(self, runner: Callable[..., subprocess.CompletedProcess[str]]) -> None:
        self._run = runner
        self._env = {**os.environ, "LANG": "en_US.UTF-8"}  # pbcopy/pbpaste need UTF-8 for non-ASCII
        try:
            import AppKit  # type: ignore[import-not-found]

            self._appkit: Any = AppKit
        except ImportError:
            self._appkit = None

    def snapshot(self) -> Any:
        """Capture the current clipboard contents."""
        if self._appkit is not None:
            try:
                board = self._appkit.NSPasteboard.generalPasteboard()
                items = []
                for item in board.pasteboardItems() or []:
                    data = {str(kind): item.dataForType_(kind) for kind in item.types()}
                    items.append({kind: value for kind, value in data.items() if value is not None})
                return ("appkit", items)
            except Exception as exc:  # noqa: BLE001 - fall back to plain text below
                log.debug("AppKit clipboard snapshot failed: %s", exc)
        result = self._run(["pbpaste"], capture_output=True, text=True, env=self._env, check=False)
        return ("text", result.stdout or "")

    def set_text(self, text: str) -> None:
        """Put ``text`` on the clipboard."""
        if self._appkit is not None:
            board = self._appkit.NSPasteboard.generalPasteboard()
            board.clearContents()
            if board.setString_forType_(text, self._appkit.NSPasteboardTypeString):
                return
        self._run(["pbcopy"], input=text, text=True, env=self._env, check=True)

    def restore(self, snapshot: Any) -> None:
        """Put back what :meth:`snapshot` captured. Never raises."""
        kind, payload = snapshot
        try:
            if kind == "appkit":
                board = self._appkit.NSPasteboard.generalPasteboard()
                board.clearContents()
                restored = []
                for entry in payload:
                    item = self._appkit.NSPasteboardItem.alloc().init()
                    for data_type, data in entry.items():
                        item.setData_forType_(data, data_type)
                    restored.append(item)
                if restored:
                    board.writeObjects_(restored)
            else:
                self._run(["pbcopy"], input=payload, text=True, env=self._env, check=False)
        except Exception as exc:  # noqa: BLE001 - losing the old clipboard is not worth crashing over
            log.warning("Couldn't restore the previous clipboard: %s", exc)
