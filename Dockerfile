# Deploy target: Google Cloud Run — the deployment backend used by both Google AI Studio's
# "Build" mode (Import from GitHub -> Deploy) and Google Antigravity's Firebase/Cloud
# integration (verified against ai.google.dev/gemini-api/docs/aistudio-build-mode, 2026-07-18).
# Cloud Run injects the listen port via the PORT env var — the app must bind to it, not a
# hardcoded port.

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Production values, NOT read from .env.local (that file is dev-only and gitignored).
# Pass at build time: docker build --build-arg VITE_GOOGLE_OAUTH_CLIENT_ID=... \
#   --build-arg VITE_SUGGEST_PROXY_URL=... .
ARG VITE_GOOGLE_OAUTH_CLIENT_ID
ARG VITE_SUGGEST_PROXY_URL
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=$VITE_GOOGLE_OAUTH_CLIENT_ID
ENV VITE_SUGGEST_PROXY_URL=$VITE_SUGGEST_PROXY_URL
RUN npm run build

# ---- Serve stage — static SPA, no Node server code needed ----
FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist ./dist
COPY serve.json ./dist/serve.json
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
