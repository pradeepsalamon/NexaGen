"""The task policy, generated from AI_TASKS in packages/types/src/ai.ts.

The runtime refuses to start if the file is missing, doesn't match the
manifest's hash, or names a different contract version."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from .contract import AI_CONTRACT_VERSION
from .settings import SettingsError


@dataclass(frozen=True)
class TaskPolicy:
    task: str
    scope: str
    data_classes: frozenset[str]
    routes: frozenset[str]


@dataclass(frozen=True)
class Policy:
    tasks: dict[str, TaskPolicy]

    def allows(self, *, task: str, scope: str, data_class: str, route: str) -> bool:
        entry = self.tasks.get(task)
        return (
            entry is not None
            and entry.scope == scope
            and data_class in entry.data_classes
            and route in entry.routes
        )


def load_policy(contract_dir: Path) -> Policy:
    try:
        raw = (contract_dir / "task-policy.json").read_bytes()
        manifest = json.loads((contract_dir / "manifest.json").read_text("utf-8"))
        policy = json.loads(raw)
    except (OSError, ValueError):
        raise SettingsError("task-policy.json or manifest.json is missing or unreadable.") from None

    if manifest.get("contractVersion") != AI_CONTRACT_VERSION or policy.get("contractVersion") != AI_CONTRACT_VERSION:
        raise SettingsError(f"Contract files are not version {AI_CONTRACT_VERSION}.")
    if manifest.get("files", {}).get("task-policy.json") != hashlib.sha256(raw).hexdigest():
        raise SettingsError("task-policy.json does not match manifest.json; regenerate the contract.")

    tasks: dict[str, TaskPolicy] = {}
    for entry in policy.get("tasks", []):
        tasks[entry["task"]] = TaskPolicy(
            task=entry["task"],
            scope=entry["scope"],
            data_classes=frozenset(entry["dataClasses"]),
            routes=frozenset(entry["routes"]),
        )
    if not tasks:
        raise SettingsError("task-policy.json lists no tasks.")
    return Policy(tasks=tasks)
