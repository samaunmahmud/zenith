"""Check the macOS privacy permissions the assistant depends on.

Missing permissions are the most common reason a fresh install "does nothing", and macOS
tends to fail silently:

* without **Input Monitoring**, the hotkey listener simply never receives key events;
* without **Microphone** access, recording "works" but every sample is zero;
* without **Accessibility**, simulated keystrokes are dropped.

The checks call the system frameworks directly through ``ctypes``, so they need no extra
packages. Each returns ``None`` when the answer can't be determined (not macOS, or an OS
too old to have the API).
"""

from __future__ import annotations

import ctypes
import logging
import subprocess
import sys
from functools import lru_cache

log = logging.getLogger(__name__)

_APPLICATION_SERVICES = "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
_CORE_GRAPHICS = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"

SETTINGS_PANES = {
    "accessibility": "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "input_monitoring": "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
    "microphone": "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    "automation": "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
}


@lru_cache(maxsize=None)
def _framework(path: str) -> ctypes.CDLL | None:
    if sys.platform != "darwin":
        return None
    try:
        return ctypes.cdll.LoadLibrary(path)
    except OSError:
        return None


def _call_bool(path: str, symbol: str) -> bool | None:
    lib = _framework(path)
    func = getattr(lib, symbol, None) if lib else None
    if func is None:
        return None
    func.restype = ctypes.c_bool
    func.argtypes = []
    return bool(func())


def accessibility_granted() -> bool | None:
    """Whether this process may post keystrokes / control other apps (``AXIsProcessTrusted``)."""
    return _call_bool(_APPLICATION_SERVICES, "AXIsProcessTrusted")


def input_monitoring_granted() -> bool | None:
    """Whether this process may observe global key events (macOS 10.15+)."""
    return _call_bool(_CORE_GRAPHICS, "CGPreflightListenEventAccess")


def request_input_monitoring() -> bool | None:
    """Ask macOS to prompt for Input Monitoring and add this app to the list in Settings."""
    return _call_bool(_CORE_GRAPHICS, "CGRequestListenEventAccess")


def open_settings(pane: str) -> None:
    """Open System Settings at the given privacy pane (a key of :data:`SETTINGS_PANES`)."""
    url = SETTINGS_PANES[pane]
    subprocess.run(["open", url], check=False)


def warn_about_missing_permissions() -> list[str]:
    """Log a clear warning for each permission that is known to be missing.

    Returns the names of the missing permissions (empty when all are fine or unknown).
    """
    missing: list[str] = []
    if input_monitoring_granted() is False:
        missing.append("input_monitoring")
        request_input_monitoring()  # makes the terminal appear in the Settings list
        log.warning(
            "Input Monitoring is OFF for this terminal, so the hotkey won't be detected. Enable it in "
            "System Settings > Privacy & Security > Input Monitoring, then restart the terminal."
        )
    if accessibility_granted() is False:
        missing.append("accessibility")
        log.warning(
            "Accessibility is OFF for this terminal, so text can't be typed. Enable it in "
            "System Settings > Privacy & Security > Accessibility, then restart the terminal."
        )
    if missing:
        log.warning("Run `python -m voice_assistant --doctor` to check everything and open the right settings.")
    return missing
