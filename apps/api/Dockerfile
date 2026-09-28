# ============================
# Stage 1 - Prune workspace
# ============================
FROM node:20-bookworm-slim AS pruner

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g turbo

COPY . .

RUN turbo prune @nexa-chess/api --docker


# ============================
# Stage 2 - Build
# ============================
FROM node:20-bookworm-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY .gitignore .gitignore

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN npm ci

COPY --from=pruner /app/out/full/ .

RUN npx turbo run build --filter=@nexa-chess/api

RUN npm prune --omit=dev


# ============================
# Stage 3 - Stockfish
# ============================
# Built from source for the host CPU: Debian's package is an old generic build
# without the dot-product (NEON) or AVX2 paths the NNUE evaluation needs to be
# fast. ARCH=native targets the machine running `docker compose build`, which
# is the production box itself — don't run this image on a different CPU.
FROM debian:bookworm-slim AS stockfish

ARG STOCKFISH_VERSION=sf_17.1

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${STOCKFISH_VERSION}" \
        https://github.com/official-stockfish/Stockfish.git /stockfish && \
    cd /stockfish/src && \
    make -j"$(nproc)" build ARCH=native && \
    strip stockfish


# ============================
# Stage 4 - Runtime
# ============================
FROM node:20-bookworm-slim AS runner

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssl \
        postgresql-client \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=stockfish /stockfish/src/stockfish /usr/local/bin/stockfish

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app .

COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh

RUN chmod +x ./apps/api/entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["./entrypoint.sh"]