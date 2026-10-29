# Build context is the repository root (see compose.yml).

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

# Manifests first so the install layer is cached.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter web...

# Only the web sources (never copy a host node_modules).
COPY apps/web/index.html apps/web/tsconfig.json apps/web/vite.config.ts apps/web/eslint.config.js ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
RUN pnpm --filter web build

# ---- runtime ----
FROM nginx:alpine
# One worker is plenty for this traffic; `auto` would start one per CPU (each a few MB).
RUN sed -i 's/^worker_processes.*/worker_processes 1;/' /etc/nginx/nginx.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
