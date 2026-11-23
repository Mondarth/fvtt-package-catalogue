# The accounts' image: the SvelteKit server (`node build/index.js`). Built from the sources, from the repository's root
# (`docker build -f apps/accounts/Dockerfile .`), so the image and the release come from one commit.
#
# Everything the server uses is bundled into build/, so the image holds no node_modules.

FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui/package.json packages/ui/
COPY apps/accounts/package.json apps/accounts/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @mondarth/accounts...
COPY tsconfig.base.json ./
COPY packages/ui packages/ui
COPY apps/accounts apps/accounts
RUN pnpm --filter @mondarth/accounts build

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# The bundles are ES modules.
RUN echo '{ "type": "module" }' > package.json
COPY --from=build /repo/apps/accounts/build ./build
# The image's own unprivileged user; the server writes nothing to the file system.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "build/index.js"]
