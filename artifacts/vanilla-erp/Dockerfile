FROM node:24-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/vanilla-erp/ ./artifacts/vanilla-erp/

ENV npm_config_user_agent="pnpm/0.0.0 npm/? node/? linux x64"
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @workspace/vanilla-erp run build

FROM nginx:alpine
COPY --from=builder /app/artifacts/vanilla-erp/dist /usr/share/nginx/html
COPY artifacts/vanilla-erp/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
