"""Checks against the real macOS APIs. Skipped on other platforms; CI runs them on macOS.

They need no permissions (nothing here listens to keys, records or types), so they pass
on a fresh machine and on headless CI runners.
"""

from __future__ import annotations

import importlib
import sys

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="macOS only")


@pytest.mark.parametrize("module", ["sounddevice", "pynput.keyboard", "pyautogui", "AppKit"])
def test_native_dependencies_import(module):
    importlib.import_module(module)


def test_real_apps_resolve_to_bundle_ids():
    from voice_assistant.mac_controller import MacController

    mac = MacController(sound_cues=False)
    assert mac.resolve_app("safari").bundle_id == "com.apple.Safari"
    assert mac.resolve_app("the finder app").bundle_id == "com.apple.finder"
    assert mac.resolve_app("settings").name in ("System Settings", "System Preferences")  # renamed in macOS 13


def test_osascript_receives_arguments_verbatim():
    from voice_assistant.mac_controller import MacController

    tricky = 'He said "hi" \\ and left'
    script = "on run argv\nreturn item 1 of argv\nend run"
    assert MacController(sound_cues=False).run_applescript(script, tricky) == tricky


def test_permission_probes_return_booleans():
    from voice_assistant import permissions

    assert isinstance(permissions.accessibility_granted(), bool)
    assert isinstance(permissions.input_monitoring_granted(), bool)


def test_appkit_clipboard_round_trip():
    import subprocess

    from voice_assistant.mac_controller import _Clipboard

    clipboard = _Clipboard(subprocess.run)
    assert clipboard._appkit is not None
    clipboard.set_text("before ✨")
    snapshot = clipboard.snapshot()
    clipboard.set_text("during")
    clipboard.restore(snapshot)
    board = clipboard._appkit.NSPasteboard.generalPasteboard()
    assert board.stringForType_(clipboard._appkit.NSPasteboardTypeString) == "before ✨"
