# The catalogue's image: the SvelteKit server (`node build/index.js`, the default) and the worker
# (`node build/worker/main.js <command>`). Built from the sources, so the image and the release come from one commit.
#
# Everything the processes use is bundled into build/, so the image holds no node_modules.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/catalogue-contract/package.json packages/catalogue-contract/
COPY packages/accounts-contract/package.json packages/accounts-contract/
COPY packages/ui/package.json packages/ui/
COPY apps/catalogue/package.json apps/catalogue/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/catalogue-contract packages/catalogue-contract
COPY packages/accounts-contract packages/accounts-contract
COPY packages/ui packages/ui
COPY apps/catalogue apps/catalogue
# SvelteKit validates the environment when it analyses the build as well as when the server starts. These placeholders
# satisfy the build; the server reads, and validates, the real values when it starts.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build API_KEYS=build-only \
    AUTH_SECRET=build-only-placeholder-not-a-secret-0000 SITE_URL=http://build.invalid \
    pnpm --filter @mondarth/fvtt-package-catalogue build

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle \
    PACKAGE_OVERRIDES_FILE=/app/overrides.json
WORKDIR /app
# The bundles are ES modules.
RUN echo '{ "type": "module" }' > package.json
COPY --from=build /repo/apps/catalogue/build ./build
COPY --from=build /repo/apps/catalogue/drizzle ./drizzle
COPY --from=build /repo/apps/catalogue/overrides.json ./overrides.json
# The image's own unprivileged user; neither process writes to the file system.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "build/index.js"]
