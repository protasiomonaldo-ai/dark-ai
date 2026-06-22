FROM node:20-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# ---- Frontend build ----
FROM base AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN pnpm install
COPY frontend/ ./
RUN pnpm run build

# ---- Backend build ----
FROM base AS backend-builder
WORKDIR /app/backend
COPY backend/package.json ./
RUN pnpm install
COPY backend/ ./
RUN pnpm run build

# ---- Production image ----
FROM node:20-alpine AS production
WORKDIR /app
RUN npm install -g pnpm

COPY backend/package.json ./
RUN pnpm install --prod

COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
