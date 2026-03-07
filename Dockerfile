FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Copy better-sqlite3 native binding (not included in standalone by default)
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
