// Minimal standalone shim for "@hatch/space-sdk" — server runtime only.
//
// This is NOT the real Muse space SDK, and it does not copy it. It exists
// solely so server/src/actions.ts can run outside Muse on Render, where the
// real SDK (a file dependency at /opt/hatch/... in the Muse environment)
// is not available and must not be shipped to a public repo.
//
// actions.ts uses exactly two runtime exports from the SDK:
//   - defineAction(spec) -> the spec itself, tagged with the action brand
//   - z (zod), re-exported by the SDK
// Everything else actions.ts imports from the SDK is type-only and is
// erased at runtime. The client bundle (client/dist, prebuilt) already
// contains the real SDK client code it needs, so this shim is never used
// by the browser build — only by server/standalone.ts on Render.
// If actions.ts ever uses another SDK runtime export, this shim must grow
// that export (and the Render deploy will fail loudly until it does).
import { z } from "zod";

export { z };

export const ACTION_BRAND = "@hatch/space-sdk/action/v1";

export function defineAction(spec) {
  return {
    __brand: ACTION_BRAND,
    request: spec.request,
    response: spec.response,
    ...(spec.privileged !== undefined ? { privileged: spec.privileged } : {}),
    handler: spec.handler,
  };
}

export function isAction(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "__brand" in value &&
    value.__brand === ACTION_BRAND
  );
}
