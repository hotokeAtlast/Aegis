// Render Docker build helper: point @hatch/space-sdk at the standalone shim
// (standalone/space-sdk-shim) instead of the Muse-only file path, then run
// bun install. Run ONLY inside the Docker image — never commit its output:
// the repo's package.json must keep the real Muse SDK dependency so the
// Muse artifact build is unaffected.
// Usage: bun standalone/patch-package.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const pkgPath = join(import.meta.dir, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.dependencies["@hatch/space-sdk"] = "file:./standalone/space-sdk-shim";
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log("[aegis] patched package.json to use the standalone space-sdk shim");
