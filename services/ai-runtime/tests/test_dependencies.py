"""Test 18: the locked production dependency closure stays on an allowlist.

No provider SDK and no HTTP client may arrive in the runtime image without a
reviewed change to this list (PHASE1_SPEC.md §7)."""

from __future__ import annotations

import tomllib

from tests.conftest import ROOT

ALLOWED_RUNTIME_PACKAGES = {
    "annotated-doc",
    "annotated-types",
    "anyio",
    "click",
    "fastapi",
    "h11",
    "idna",
    # API-only package (no SDK, no exporter): a no-op unless an SDK is installed.
    "opentelemetry-api",
    "pydantic",
    "pydantic-core",
    "pyjwt",
    "starlette",
    "typing-extensions",
    "typing-inspection",
    "uvicorn",
}

FORBIDDEN = {"httpx", "requests", "aiohttp", "urllib3", "openai", "anthropic", "google-genai", "groq", "ollama"}


def _runtime_closure() -> set[str]:
    lock = tomllib.loads((ROOT / "uv.lock").read_text())
    packages = {p["name"]: p for p in lock["package"]}
    root = packages["nexa-ai-runtime"]
    seen: set[str] = set()
    stack = [d["name"] for d in root.get("dependencies", [])]
    while stack:
        name = stack.pop()
        if name in seen:
            continue
        seen.add(name)
        stack.extend(d["name"] for d in packages[name].get("dependencies", []))
    return seen


def test_runtime_dependencies_are_allowlisted() -> None:
    closure = _runtime_closure()
    assert closure <= ALLOWED_RUNTIME_PACKAGES, f"not allowlisted: {sorted(closure - ALLOWED_RUNTIME_PACKAGES)}"
    assert not closure & FORBIDDEN


def test_dev_tools_are_not_runtime_dependencies() -> None:
    assert not _runtime_closure() & {"httpx", "jsonschema", "pytest"}
