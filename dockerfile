# syntax=docker/dockerfile:1.6

########################
# 1) deps
########################
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Dev deps are needed for Vite build
RUN npm ci --include=dev --no-audit --no-fund

########################
# 2) build
########################
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

########################
# 3) runner (serve dist)
########################
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy built assets and server
COPY --from=build /app/dist ./dist
COPY server.js package*.json ./

# Trim dev stuff from runtime (optional)
RUN npm pkg delete scripts.dev || true \
 && npm pkg delete devDependencies || true

EXPOSE 3000
CMD ["node", "server.js"]