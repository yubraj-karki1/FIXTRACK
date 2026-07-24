# ---- Dependencies stage ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Runtime stage ----
# next.config.mjs sets output: 'standalone', so .next/standalone is a self-contained server
# bundle - no full node_modules tree needed in the runtime image.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
# No public/ directory exists in this project today; add a COPY line here if one is added later.

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
