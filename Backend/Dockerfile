# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Uploaded files land here by default (see UPLOAD_DIR in config/index.ts); created up front so
# the non-root user below can write to it without a runtime chown.
RUN addgroup -S fixtrack \
    && adduser -S fixtrack -G fixtrack \
    && mkdir -p /app/var/uploads \
    && chown -R fixtrack:fixtrack /app

USER fixtrack
EXPOSE 4000
CMD ["node", "dist/index.js"]
