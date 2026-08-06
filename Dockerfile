# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build arguments for Vite env vars
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
# Both names accepted — VITE_API_BASE_URL is used by src/api/client.ts
# VITE_API_BASE is used by src/lib/apiClient.ts
# These MUST be empty: call paths already include /api (e.g. /api/users).
# Setting either to '/api' produces double-prefix URLs (/api/api/users → 404).
ARG VITE_API_BASE_URL=
ARG VITE_API_BASE=

# Set them as environment variables so Vite bakes them into the bundle at build time
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_BASE=$VITE_API_BASE

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (dev deps needed for the build step)
RUN npm ci --prefer-offline --no-audit

# Copy source files
COPY . .

# Build the application (vite build + esbuild server bundle + postbuild)
RUN npm run build

# Stage 2: Production image — only what the server needs at runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --only=production --prefer-offline --no-audit

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/firebase-blueprint.json ./

# Expose port (Cloud Run injects PORT=8080 at runtime)
EXPOSE 8080

# NODE_ENV and PORT are set by Cloud Run env vars at runtime;
# these are just safe defaults for local docker run.
ENV NODE_ENV=production
ENV PORT=8080

# Start the compiled server bundle
CMD ["node", "dist/server.mjs"]
