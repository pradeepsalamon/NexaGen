# AI runtime (docs/ai/architecture/PHASE1_SPEC.md). Multi-arch base; the
# arm64 build is checked in CI with buildx + QEMU, never on the production box.
FROM python:3.12-slim-bookworm AS build

COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
COPY pyproject.toml uv.lock ./
# Hash-checked against uv.lock; dev tools (pytest, httpx, jsonschema) excluded.
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim-bookworm

RUN groupadd --gid 10001 runtime \
 && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin runtime

COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY app ./app
COPY contract/v1/*.json ./contract/v1/

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

USER 10001:10001
EXPOSE 8000

# One worker: the jti replay cache is per process (OD-21). 0.0.0.0 is the
# container's own interface on ai_internal; compose publishes no port.
CMD ["uvicorn", "--factory", "app.main:create_app", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "1", "--limit-concurrency", "32", "--timeout-keep-alive", "5", "--no-access-log"]
