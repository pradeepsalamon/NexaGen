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
# Stage 3 - Runtime
# ============================
FROM node:20-bookworm-slim AS runner

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        openssl \
        stockfish \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app .

COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh

RUN chmod +x ./apps/api/entrypoint.sh

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["./entrypoint.sh"]