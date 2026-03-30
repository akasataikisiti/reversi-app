# ---- ビルドステージ ----
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ---- 実行ステージ ----
FROM node:18-alpine AS runner

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY static/ ./static/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/main.js"]
