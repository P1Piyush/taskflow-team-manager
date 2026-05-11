FROM node:20-alpine AS base
WORKDIR /app

# ── Build client ──────────────────────────────────────────────────────────────
FROM base AS client-build
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# ── Build server ──────────────────────────────────────────────────────────────
FROM base AS server-build
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/ ./server/
RUN cd server && npx prisma generate && npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=server-build /app/server/package*.json ./server/
RUN cd server && npm install --omit=dev

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/prisma ./server/prisma
COPY --from=server-build /app/server/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=server-build /app/server/node_modules/@prisma ./server/node_modules/@prisma
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
