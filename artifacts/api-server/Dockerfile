FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copier workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Install deps
RUN pnpm install --frozen-lockfile --config.confirmModulesPurge=false

# Build
RUN pnpm --filter @workspace/api-server run build

WORKDIR /app/artifacts/api-server
EXPOSE 8080
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
