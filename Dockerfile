# Aegis — Render Docker image (Bun)
# See render.yaml for the service definition and the note about the
# standalone server entrypoint that is still needed before a real deploy.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app /app
EXPOSE 10000
# TODO: replace with the standalone server entrypoint once it exists,
# e.g. CMD ["bun", "run", "server/standalone.ts"]
# Until then, fail fast with a clear message instead of serving a broken app.
CMD ["sh", "-c", "echo 'Aegis standalone server entrypoint is not implemented yet. See render.yaml header.' >&2; exit 1"]
