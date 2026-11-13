# syntax=docker/dockerfile:1
# The website (Next.js), built as a standalone server and run on Node. Build from the repository root:
#   docker build -f deploy/web.Dockerfile --build-arg API_PUBLIC_URL=https://api.example.in \
#     --build-arg SITE_URL=https://example.in -t hostels-web .
# API_PUBLIC_URL is read at build time: the Content Security Policy only lets images load from that origin.

FROM node:22-slim AS build
COPY --from=oven/bun:1.4.4-slim /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
# A build behind a TLS-inspecting proxy can pass its CA for this step only (never stored in the image):
#   docker build --secret id=build_ca,src=/path/to/ca.crt ...
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    bun install --frozen-lockfile --filter @hostels/web
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
ARG API_PUBLIC_URL
ARG SITE_URL
# Optional map tile provider; empty means free OpenStreetMap tiles (docs/RUN.md, "Maps"). Baked in at build.
ARG MAP_TILE_URL=""
ARG MAP_ATTRIBUTION=""
RUN test -n "$API_PUBLIC_URL" && test -n "$SITE_URL" || (echo "Pass --build-arg API_PUBLIC_URL and SITE_URL" >&2; exit 1)
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    API_PUBLIC_URL=$API_PUBLIC_URL \
    NEXT_PUBLIC_SITE_URL=$SITE_URL \
    NEXT_PUBLIC_MAP_TILE_URL=$MAP_TILE_URL \
    NEXT_PUBLIC_MAP_ATTRIBUTION=$MAP_ATTRIBUTION
WORKDIR /app/apps/web
# The site has no public/ folder today; make one so the runtime copy below works if files are added later.
RUN mkdir -p public && node node_modules/next/dist/bin/next build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# The standalone output keeps the monorepo layout: the server is apps/web/server.js.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/robots.txt').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/web/server.js"]
