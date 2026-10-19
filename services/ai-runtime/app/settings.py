"""Runtime configuration. Anything wrong here stops the process at start:
there is no "auth disabled" mode, including in tests (PHASE1_SPEC.md §3.4)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

MIN_SECRET_LENGTH = 32
DEFAULT_CONTRACT_DIR = Path(__file__).resolve().parent.parent / "contract" / "v1"
LOG_LEVELS = ("debug", "info", "warning", "error")


class SettingsError(Exception):
    """Raised for a configuration the runtime refuses to start with. The
    message names the variable, never its value."""


@dataclass(frozen=True)
class Settings:
    secret: str
    previous_secret: str | None
    max_body_bytes: int
    max_in_flight: int
    request_timeout_ms: int
    log_level: str
    contract_dir: Path


def _int(env: dict[str, str], name: str, default: int, low: int, high: int) -> int:
    raw = env.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise SettingsError(f"{name} must be an integer.") from None
    if not low <= value <= high:
        raise SettingsError(f"{name} must be between {low} and {high}.")
    return value


def load_settings(env: dict[str, str] | None = None) -> Settings:
    env = dict(os.environ if env is None else env)

    secret = env.get("AI_RUNTIME_SHARED_SECRET", "")
    if len(secret) < MIN_SECRET_LENGTH or secret.startswith("change-this"):
        raise SettingsError(
            f"AI_RUNTIME_SHARED_SECRET must be a random value of at least {MIN_SECRET_LENGTH} characters."
        )
    previous = env.get("AI_RUNTIME_SHARED_SECRET_PREVIOUS", "") or None
    if previous is not None:
        if len(previous) < MIN_SECRET_LENGTH:
            raise SettingsError(
                f"AI_RUNTIME_SHARED_SECRET_PREVIOUS must be at least {MIN_SECRET_LENGTH} characters when set."
            )
        if previous == secret:
            raise SettingsError("AI_RUNTIME_SHARED_SECRET_PREVIOUS must differ from AI_RUNTIME_SHARED_SECRET.")

    log_level = env.get("LOG_LEVEL", "info").strip().lower() or "info"
    if log_level == "warn":
        log_level = "warning"
    if log_level not in LOG_LEVELS:
        raise SettingsError(f"LOG_LEVEL must be one of {', '.join(LOG_LEVELS)}.")

    contract_dir = Path(env.get("AI_RUNTIME_CONTRACT_DIR") or DEFAULT_CONTRACT_DIR)

    return Settings(
        secret=secret,
        previous_secret=previous,
        max_body_bytes=_int(env, "AI_RUNTIME_MAX_BODY_BYTES", 16384, 1024, 1048576),
        max_in_flight=_int(env, "AI_RUNTIME_MAX_IN_FLIGHT", 4, 1, 16),
        request_timeout_ms=_int(env, "AI_RUNTIME_REQUEST_TIMEOUT_MS", 5000, 100, 30000),
        log_level=log_level,
        contract_dir=contract_dir,
    )
