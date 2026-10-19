"""Test 12: the process refuses to start on a bad configuration."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from tests.conftest import CONTRACT_DIR, ROOT, new_secret

START = "from app.main import create_app; create_app()"


def _start(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    clean = {key: value for key, value in os.environ.items() if not key.startswith("AI_RUNTIME_")}
    return subprocess.run(
        [sys.executable, "-c", START], cwd=ROOT, env={**clean, **env}, capture_output=True, text=True, timeout=60
    )


def test_starts_with_a_valid_secret() -> None:
    assert _start({"AI_RUNTIME_SHARED_SECRET": new_secret()}).returncode == 0


@pytest.mark.parametrize(
    "env",
    [
        {},
        {"AI_RUNTIME_SHARED_SECRET": ""},
        {"AI_RUNTIME_SHARED_SECRET": "x" * 31},
        {"AI_RUNTIME_SHARED_SECRET": "change-this-" + "x" * 40},
        {"AI_RUNTIME_SHARED_SECRET": "s" * 48, "AI_RUNTIME_SHARED_SECRET_PREVIOUS": "s" * 48},
        {"AI_RUNTIME_SHARED_SECRET": "s" * 48, "AI_RUNTIME_SHARED_SECRET_PREVIOUS": "short"},
        {"AI_RUNTIME_SHARED_SECRET": "s" * 48, "AI_RUNTIME_MAX_BODY_BYTES": "10"},
        {"AI_RUNTIME_SHARED_SECRET": "s" * 48, "AI_RUNTIME_MAX_IN_FLIGHT": "0"},
        {"AI_RUNTIME_SHARED_SECRET": "s" * 48, "AI_RUNTIME_REQUEST_TIMEOUT_MS": "abc"},
    ],
    ids=["unset", "empty", "short", "placeholder", "previous-equals-current", "previous-short",
         "body-cap-too-small", "in-flight-zero", "timeout-not-int"],
)
def test_refuses_bad_configuration(env: dict[str, str]) -> None:
    result = _start(env)
    assert result.returncode != 0
    for value in env.values():
        if len(value) >= 32:
            assert value not in result.stdout + result.stderr  # never echo a secret


def _contract_copy(tmp_path: Path) -> Path:
    target = tmp_path / "v1"
    shutil.copytree(CONTRACT_DIR, target, ignore=shutil.ignore_patterns("fixtures"))
    return target


def test_refuses_missing_task_policy(tmp_path: Path) -> None:
    contract = _contract_copy(tmp_path)
    (contract / "task-policy.json").unlink()
    result = _start({"AI_RUNTIME_SHARED_SECRET": new_secret(), "AI_RUNTIME_CONTRACT_DIR": str(contract)})
    assert result.returncode != 0


def test_refuses_task_policy_not_matching_manifest(tmp_path: Path) -> None:
    contract = _contract_copy(tmp_path)
    policy = json.loads((contract / "task-policy.json").read_text())
    policy["tasks"][0]["dataClasses"].append("PERSONAL_STUDENT")
    (contract / "task-policy.json").write_text(json.dumps(policy))
    result = _start({"AI_RUNTIME_SHARED_SECRET": new_secret(), "AI_RUNTIME_CONTRACT_DIR": str(contract)})
    assert result.returncode != 0


def test_refuses_another_contract_version(tmp_path: Path) -> None:
    contract = _contract_copy(tmp_path)
    manifest = json.loads((contract / "manifest.json").read_text())
    manifest["contractVersion"] = "2.0"
    (contract / "manifest.json").write_text(json.dumps(manifest))
    result = _start({"AI_RUNTIME_SHARED_SECRET": new_secret(), "AI_RUNTIME_CONTRACT_DIR": str(contract)})
    assert result.returncode != 0
