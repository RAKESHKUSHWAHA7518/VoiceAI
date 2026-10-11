# Multi-stage build for React Vite Frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy source and build bundle
COPY . ./
RUN npm run build

# Stage 2: High-performance Nginx web server
FROM nginx:alpine AS production

# Copy compiled SPA assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with reverse proxy & gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
