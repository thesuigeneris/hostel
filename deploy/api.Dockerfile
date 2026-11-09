# syntax=docker/dockerfile:1
# The API (Bun + Hono). Build from the repository root:
#   docker build -f deploy/api.Dockerfile -t hostels-api .
# The same image runs migrations: `bun run src/db/migrate.ts`.

FROM oven/bun:1.4.4-slim AS deps
WORKDIR /app
# Every workspace manifest, so the lockfile is honoured exactly; only the API's packages are installed.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
# A build behind a TLS-inspecting proxy can pass its CA for this step only (never stored in the image):
#   docker build --secret id=build_ca,src=/path/to/ca.crt ...
RUN --mount=type=secret,id=build_ca,required=false \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    bun install --frozen-lockfile --production --filter @hostels/api

FROM oven/bun:1.4.4-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/data/uploads
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared ./packages/shared
# Bun installs in isolated mode: one store in node_modules/.bun, and per-package node_modules that link into it.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/migrations ./apps/api/migrations
# Photos live on a volume mounted here; the process runs unprivileged.
RUN mkdir -p /data/uploads && chown -R bun:bun /data/uploads
USER bun
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 4000) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "run", "src/index.ts"]
