
# Stage 1: Build the React application
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Prisma requires OpenSSL in the slim Debian image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy npm workspace manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Prisma postinstall needs its schema and configuration.
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Install dependencies for all workspaces.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npm ci --include=dev

# Copy source code
COPY . .

# Build the production frontend
RUN npm run build -w @routepulse/web


# Stage 2: Serve the static frontend using nginx
FROM nginxinc/nginx-unprivileged:stable-alpine

# Copy the production build into nginx's web root
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
