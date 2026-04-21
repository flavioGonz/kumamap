# ============================================================
# KumaMap - Multi-stage Production Dockerfile
# ============================================================
# Stage 1: Install dependencies
# Stage 2: Build Next.js
# Stage 3: Production runtime (minimal image)
# ============================================================

# --- Stage 1: Dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    # Rebuild native modules for alpine
    npm rebuild better-sqlite3

# Also install ALL deps for the build stage
FROM node:20-alpine AS deps-build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps-build /app/node_modules ./node_modules
COPY . .

# Build-time env (basePath gets baked into the Next.js build)
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

RUN npm run build

# --- Stage 3: Production runtime ---
FROM node:20-alpine AS runner
WORKDIR /app

# Runtime deps: better-sqlite3 + ffmpeg for RTSP camera streaming
RUN apk add --no-cache libstdc++ ffmpeg

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 kumamap && \
    adduser --system --uid 1001 kumamap

# Copy production node_modules (with native better-sqlite3)
COPY --from=deps /app/node_modules ./node_modules

# Copy built Next.js app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy source files needed at runtime (server.ts, src/lib/*)
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

# Data directory for SQLite DB and uploads
RUN mkdir -p /app/data && chown kumamap:kumamap /app/data
VOLUME ["/app/data"]

USER kumamap

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["npx", "tsx", "server.ts"]
