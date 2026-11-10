# Build the Vite frontend and type-check the server.
FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Install production node_modules (including native better-sqlite3) with a full toolchain.
FROM node:22-bookworm AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Runtime: slim image + compiled native module. Railway injects PORT at runtime.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/uploads
COPY package*.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
EXPOSE 3100
CMD ["node", "--import", "tsx", "server/src/index.ts"]
