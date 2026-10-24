# Multi-stage build for production
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY server ./server
COPY shared ./shared

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init ca-certificates && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 voiceai && useradd -u 1001 -g voiceai -m voiceai

# Copy built files
COPY --from=builder --chown=voiceai:voiceai /app/dist ./dist
COPY --from=builder --chown=voiceai:voiceai /app/package*.json ./
COPY --chown=voiceai:voiceai scripts/start-production.cjs ./scripts/start-production.cjs

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Create necessary directories
RUN mkdir -p logs data && chown -R voiceai:voiceai logs data
ENV NODE_ENV=production VOICEAI_DATA_DIR=/app/data VOICEAI_RUNTIME_MODE=demo

USER voiceai

EXPOSE 8000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/src/app.js"]
