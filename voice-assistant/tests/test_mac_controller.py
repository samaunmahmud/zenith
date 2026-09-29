"""App resolution and AppleScript invocation, with subprocess faked out."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from voice_assistant.mac_controller import AppNotFoundError, AutomationError, InstalledApp, MacController, scan_applications

APPS = [
    InstalledApp("Safari", Path("/Applications/Safari.app")),
    InstalledApp("Visual Studio Code", Path("/Applications/Visual Studio Code.app")),
    InstalledApp("Xcode", Path("/Applications/Xcode.app")),
    InstalledApp("Spotify", Path("/Applications/Spotify.app")),
    InstalledApp("Notes", Path("/System/Applications/Notes.app")),
    InstalledApp("Adobe Photoshop 2025", Path("/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app")),
    InstalledApp("System Settings", Path("/System/Applications/System Settings.app")),
]


class FakeRunner:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.calls = []
        self.result = subprocess.CompletedProcess([], returncode, stdout, stderr)

    def __call__(self, cmd, **kwargs):
        self.calls.append(cmd)
        return self.result


def controller(runner=None, **kwargs) -> MacController:
    return MacController(runner=runner or FakeRunner(stdout=""), app_scanner=lambda: APPS, sound_cues=False, **kwargs)


@pytest.mark.parametrize(
    "spoken, expected",
    [
        ("Safari", "Safari"),
        ("safari app", "Safari"),
        ("the VS Code", "Visual Studio Code"),
        ("vscode", "Visual Studio Code"),
        ("xcode", "Xcode"),
        ("x code", "Xcode"),
        ("photoshop", "Adobe Photoshop 2025"),
        ("spotfy", "Spotify"),
        ("settings", "System Settings"),
        ("Notes.app", "Notes"),
    ],
)
def test_resolve_app(spoken, expected):
    assert controller().resolve_app(spoken).name == expected


def test_unknown_app_offers_suggestions():
    with pytest.raises(AppNotFoundError) as info:
        controller().resolve_app("Notez Pro Max")
    assert "couldn't find" in info.value.user_message


def test_unknown_app_uses_spotlight_before_giving_up():
    runner = FakeRunner(stdout="/Users/me/Tools/Obsidian.app\n")
    assert controller(runner).resolve_app("obsidian").name == "Obsidian"
    assert runner.calls[0][0] == "mdfind"


def test_arguments_are_passed_as_argv_not_interpolated():
    runner = FakeRunner()
    mac = controller(runner)
    mac.run_applescript('on run argv\nreturn item 1 of argv\nend run', 'He said "hi"; do shell script "rm"')
    cmd = runner.calls[0]
    assert cmd[:2] == ["osascript", "-e"]
    assert cmd[3] == 'He said "hi"; do shell script "rm"'
    assert "rm" not in cmd[2]


def test_permission_errors_explain_the_fix():
    mac = controller(FakeRunner(returncode=1, stderr="execution error: Not authorized to send Apple events (-1743)"))
    with pytest.raises(AutomationError) as info:
        mac.run_applescript("return 1")
    assert "Accessibility" in info.value.user_message


def test_dry_run_does_not_touch_the_system():
    runner = FakeRunner()
    mac = controller(runner, dry_run=True)
    mac.open_app("safari")
    mac.type_text("hello")
    mac.speak("hello")
    assert runner.calls == []


def test_long_or_unicode_text_is_pasted(monkeypatch):
    mac = controller(paste_threshold=10)
    used = []
    monkeypatch.setattr(mac, "_paste", lambda text: used.append(("paste", text)))
    monkeypatch.setattr(mac, "_type", lambda text: used.append(("type", text)))
    mac.type_text("short")
    mac.type_text("café")
    mac.type_text("this is longer than ten")
    assert [kind for kind, _ in used] == ["type", "paste", "paste"]


def test_scan_applications(tmp_path):
    (tmp_path / "Foo.app").mkdir()
    (tmp_path / "Suite").mkdir()
    (tmp_path / "Suite" / "Bar.app").mkdir()
    (tmp_path / "readme.txt").write_text("x")
    names = [app.name for app in scan_applications([tmp_path], extra=[])]
    assert names == ["Bar", "Foo"]
