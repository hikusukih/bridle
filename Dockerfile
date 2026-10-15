FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries for amd64 and arm64 and loads them at runtime, but npm would still run a
# no-op node-gyp rebuild that needs Python. Skipping install scripts keeps the image free of a compiler toolchain.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
WORKDIR /app
# Loopback inside a container is unreachable from the host, so listen on all interfaces here and let the
# operator's -p flag decide what is exposed.
ENV NODE_ENV=production \
    BRIDLE_DATA_DIR=/data \
    PORT=8787 \
    HOST=0.0.0.0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Migrations are read at startup from the package root, next to dist.
COPY --from=build /app/drizzle ./drizzle
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/server/main.js"]
