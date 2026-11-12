
# Node.js runtime for the RoutePulse API
FROM node:22-bookworm-slim

# Prisma requires OpenSSL in the slim Debian image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# All workspace commands run from the repository root initially.
WORKDIR /app

# Copy root npm manifests.
COPY package.json package-lock.json ./

# Copy every workspace manifest before installing dependencies.
# This allows npm to resolve the complete workspace structure.
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json
# Prisma postinstall needs its schema and configuration available.
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Install dependencies exactly as recorded in package-lock.json.
# Include dev dependencies because TypeScript, tsx and Prisma CLI
# are currently needed to run and manage the API.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npm ci --include=dev

# Copy the application source and configuration.
COPY . .

# Prisma configuration uses paths relative to the current directory.
WORKDIR /app/apps/api

# Prisma 7 needs DATABASE_URL from its config.
# A placeholder is sufficient for client generation; no DB connection
# is made during prisma generate.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    npx prisma generate

# Runtime configuration.
ENV NODE_ENV=production
ENV PORT=4000

# The API listens on port 4000.
EXPOSE 4000


# Check both API availability and database connectivity.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Run as the non-root user provided by the official Node image.
USER node

# Start the TypeScript API without requiring an .env file.
CMD ["node", "--import", "tsx", "src/server.ts"]
