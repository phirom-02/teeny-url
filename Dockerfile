# Stage 1: Install all workspace dependencies and build the web UI
FROM node:24-slim AS builder
WORKDIR /app

# Enable pnpm
RUN npm install -g pnpm

# Copy workspace manifests first for dependency layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/

# Install all dependencies (root + web workspace)
RUN pnpm install --frozen-lockfile

# Copy source and build @teeny-url/web
COPY . .
RUN pnpm run build

# Stage 2: Production runtime (API + built web assets)
FROM node:24-slim AS production
WORKDIR /app
ENV NODE_ENV=production

# Enable pnpm to install root production dependencies
RUN npm install -g pnpm

# Copy root manifests and install only API production dependencies
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --filter . && pnpm store prune

# Copy runtime TypeScript source, migrations, and CLI scripts
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts
# Copy Drizzle SQL migrations
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

# Copy compiled SvelteKit frontend assets from builder stage
COPY --from=builder --chown=node:node /app/web/build ./web/build

# Switch to built-in non-root user
USER node

EXPOSE 3000

# Matches package.json "start" script (native TS execution on Node >=24.2)
CMD ["node", "--env-file-if-exists=.env", "src/server.ts"]
