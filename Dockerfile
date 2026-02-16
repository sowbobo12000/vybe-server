# ── Stage 1: Build ──
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate
RUN npx tsc --build

# ── Stage 2: Production ──
FROM node:20-alpine AS runner

RUN addgroup --system --gid 1001 vybe && \
    adduser --system --uid 1001 vybe

WORKDIR /app

# Install production deps only (no devDependencies)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma client (generated) and built output
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist

USER vybe

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
