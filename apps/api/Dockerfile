FROM node:20-alpine AS pruner
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @nexa-chess/api --docker

FROM node:20-alpine AS builder
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY .gitignore .gitignore
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm install
COPY --from=pruner /app/out/full/ .
RUN npx turbo run build --filter=@nexa-chess/api
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
RUN apk update && apk add --no-cache openssl stockfish
WORKDIR /app

COPY --from=builder /app .
COPY apps/api/entrypoint.sh ./apps/api/entrypoint.sh
RUN chmod +x ./apps/api/entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["./entrypoint.sh"]
