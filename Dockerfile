# Aegis — Render Docker image (Bun)
#
# How this works, and why there is no client build step here:
# - The React client is shipped prebuilt in client/dist (built in the Muse
#   environment, where the real @hatch/space-sdk build tooling lives).
#   Rebuilding it on Render would need that SDK, which is Muse-only and
#   must not be shipped to this repo. If client/src changes, rebuild
#   client/dist in Muse first, then push the new bundle with the source.
# - The server runs from TypeScript directly (Bun runs TS), so it needs
#   no build step either — just bun install with the standalone shim.
# - standalone/patch-package.mjs swaps the Muse-only space-sdk file
#   dependency for standalone/space-sdk-shim (a minimal, documented
#   reimplementation of defineAction/z, the only SDK runtime exports
#   server/src/actions.ts uses) BEFORE bun install, inside the image
#   only. The repo's package.json is untouched by this, so the Muse
#   artifact build keeps using the real SDK.
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY standalone ./standalone
COPY server ./server
COPY drizzle ./drizzle
COPY client/dist ./client/dist
RUN bun standalone/patch-package.mjs && bun install
EXPOSE 10000
CMD ["bun", "run", "server/standalone.ts"]
