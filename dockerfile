# syntax=docker/dockerfile:1.6

########################
# 1) Install deps
########################
FROM node:20-alpine AS deps
WORKDIR /app

# Keep layers stable: copy only lock + package first
COPY package*.json ./

# Install ALL deps (dev deps required for vite build)
RUN npm ci --include=dev --no-audit --no-fund

########################
# 2) Build
########################
FROM node:20-alpine AS build
WORKDIR /app

# Bring node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Now copy the rest of the app
COPY . .

# Build static assets
RUN npm run build

########################
# 3) Runtime (serve dist)
########################
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy built assets and server
COPY --from=build /app/dist ./dist
COPY server.js package*.json ./

# Keep runtime image lean (optional)
# Remove dev scripts/devDeps entries from package.json so npm start is safe
RUN npm pkg delete scripts.dev || true \
 && npm pkg delete devDependencies || true

EXPOSE 3000
CMD ["node", "server.js"]