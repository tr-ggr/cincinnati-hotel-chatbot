# Build context is the repo root (see infra/docker-compose.yml: context: .., dockerfile: apps/api/Dockerfile).
# Only the files this image needs are copied explicitly, so host node_modules never leak in.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /repo

# ---- deps: install workspace dependencies for the api package only (frozen lockfile)
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api...

# ---- build: compile TypeScript to dist/
FROM deps AS build
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
RUN pnpm --filter api build

# ---- prod: production node_modules + compiled output only
FROM build AS prod-deps
RUN pnpm --filter api --prod deploy --legacy /out

# ---- runtime
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=prod-deps /out/package.json ./package.json
COPY --from=prod-deps /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/index.js"]
