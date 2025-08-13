# syntax=docker/dockerfile:1.6
ARG CACHEBUST=2025-08-13-03

########################
# 1) deps (installs ALL deps including dev)
########################
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Ensure vite and other dev deps are installed
ENV NPM_CONFIG_PRODUCTION=false
RUN npm ci --include=dev --no-audit --no-fund

########################
# 2) build (runs vite build)
########################
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# helpful logs
RUN node -v && npm -v && cat package.json | grep '"build"' || true
RUN npm run build

########################
# 3) runtime (serve dist via express)
########################
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# built assets + server
COPY --from=build /app/dist ./dist
COPY server.js package*.json ./
# keep runtime lean
RUN npm pkg delete scripts.dev || true \
 && npm pkg delete devDependencies || true
EXPOSE 3000
CMD ["node", "server.js"]