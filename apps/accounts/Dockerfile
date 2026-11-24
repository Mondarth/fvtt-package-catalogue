# The accounts' image: the SvelteKit server (`node build/index.js`, the default), and the migrations
# (`node build/migrate.js`). Built from the sources, from the repository's root
# (`docker build -f apps/accounts/Dockerfile .`), so the image and the release come from one commit.
#
# Everything the server uses is bundled into build/, so the image holds no node_modules.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui/package.json packages/ui/
COPY packages/accounts-contract/package.json packages/accounts-contract/
COPY apps/accounts/package.json apps/accounts/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @mondarth/accounts...
COPY tsconfig.base.json ./
COPY packages/ui packages/ui
COPY packages/accounts-contract packages/accounts-contract
COPY apps/accounts apps/accounts
# SvelteKit validates the environment when it analyses the build as well as when the server starts. These placeholders
# satisfy the build; the server reads, and validates, the real values when it starts.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build AUTH_SECRET=build-only-placeholder-not-a-secret-0000 \
    SITE_URL=http://build.invalid INTERNAL_API_KEYS=build-only-placeholder-not-a-key-000000 \
    pnpm --filter @mondarth/accounts build

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
# The bundles are ES modules.
RUN echo '{ "type": "module" }' > package.json
COPY --from=build /repo/apps/accounts/build ./build
COPY --from=build /repo/apps/accounts/drizzle ./drizzle
# The image's own unprivileged user; the server writes nothing to the file system.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "build/index.js"]
