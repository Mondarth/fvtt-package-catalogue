# The catalogue's image: the SvelteKit server (`node build/index.js`, the default) and the worker
# (`node build/worker/main.js <command>`). Built from the sources, so the image and the release come from one commit.
#
# Everything the processes use is bundled into build/, so the image holds no node_modules.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contract/package.json packages/contract/
COPY packages/catalogue/package.json packages/catalogue/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/contract packages/contract
COPY packages/catalogue packages/catalogue
# SvelteKit validates the environment when it analyses the build as well as when the server starts. These placeholders
# satisfy the build; the server reads, and validates, the real values when it starts.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build API_KEYS=build-only \
    pnpm --filter @mondarth/fvtt-package-catalogue build

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
# The bundles are ES modules.
RUN echo '{ "type": "module" }' > package.json
COPY --from=build /repo/packages/catalogue/build ./build
COPY --from=build /repo/packages/catalogue/drizzle ./drizzle
# The image's own unprivileged user; neither process writes to the file system.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "build/index.js"]
