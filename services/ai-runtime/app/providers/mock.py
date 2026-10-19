"""The mock provider: `mock:echo`. Deterministic, no model, no network."""

from __future__ import annotations

PROVIDER = "mock"
MODEL = "echo"


class MockEchoProvider:
    name = PROVIDER
    model = MODEL

    async def echo(self, text: str) -> dict[str, object]:
        return {"echo": text, "length": len(text)}

    def ready(self) -> bool:
        return True
