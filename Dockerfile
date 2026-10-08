# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY server ./server

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S voiceai -u 1001

# Copy built files
COPY --from=builder --chown=voiceai:nodejs /app/dist ./dist
COPY --from=builder --chown=voiceai:nodejs /app/package*.json ./
COPY --chown=voiceai:nodejs client ./client

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Create necessary directories
RUN mkdir -p logs && chown -R voiceai:nodejs logs

USER voiceai

EXPOSE 8000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/src/app.js"]