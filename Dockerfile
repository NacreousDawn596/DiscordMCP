# ---- build stage ----
FROM node:26-slim AS build

WORKDIR /app

# Install build toolchain for native modules (better-sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:26-slim AS runtime

WORKDIR /app

# Rebuild native deps for the runtime image (same Node major version).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV DATABASE_PATH=/app/data/agent.sqlite

CMD ["node", "dist/index.js"]
