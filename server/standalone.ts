// Aegis standalone server — Render (and any plain Bun host) entrypoint.
//
// This is NOT the Muse space runtime. The space runtime serves the same
// Actions (server/src/actions.ts) through @hatch/space-sdk; this file serves
// those exact actions over plain HTTP so Aegis can run outside Muse:
//   GET  /            -> client/dist/index.html (the React app)
//   GET  /assets/*    -> client/dist/assets/* (built JS/CSS)
//   GET  /healthz     -> {"ok":true} (Render health check)
//   GET  /api/keep-alive, /api/ping
//                    -> {"ok":true, "service":"aegis", ...} (cron keep-alive
//                       endpoint: ping this every 10 minutes from an external
//                       cron service to stop Render's free plan spinning the
//                       service down after 15 minutes idle. Lightweight —
//                       it does not touch the database or run any action.)
//   POST /actions     -> {"action": "<name>", "args": {...}} -> {"data": {...}}
//                        (the exact protocol client/src/api.ts uses via
//                        createActionClient: POST ./actions, read body.data,
//                        throw on body.error)
//
// Database: SQLite via drizzle-orm/bun-sqlite, at DATABASE_PATH
// (Render: /data/app.db on the persistent disk, see render.yaml).
// Migrations in drizzle/ are applied on every boot (idempotent).
// Gemini key: the app's Settings screen stores it in app_settings, exactly
// as in the space app. As a convenience for Render, if GEMINI_API_KEY is set
// in the environment and no key is stored yet, it is seeded into
// app_settings on boot — it is never written to any file in this repo.
//
// Run locally (scratch DB, does not touch the space app's app.db):
//   DATABASE_PATH=/tmp/aegis-test.db PORT=3001 bun run server/standalone.ts
// Run on Render: see Dockerfile / render.yaml (CMD bun run server/standalone.ts).

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";
import { Actions } from "./src/actions";
import * as schema from "./src/schema";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_PATH = process.env.DATABASE_PATH ?? "./app.db";
const CLIENT_DIST = join(import.meta.dir, "..", "client", "dist");
const MIGRATIONS_FOLDER = join(import.meta.dir, "..", "drizzle");

// --- Database ---------------------------------------------------------------
mkdirSync(dirname(DATABASE_PATH), { recursive: true });
const sqlite = new Database(DATABASE_PATH);
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

// Seed a Gemini key from the environment only if none is stored yet.
// (Settings in the app can still change/clear it afterwards.)
if (process.env.GEMINI_API_KEY) {
  const existing = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, "gemini_api_key"))
    .limit(1);
  if (!existing[0]) {
    await db.insert(schema.appSettings).values({
      key: "gemini_api_key",
      value: process.env.GEMINI_API_KEY,
    });
    console.log("[aegis] seeded Gemini key from GEMINI_API_KEY env var");
  }
}

// The context the space actions expect, minus the space-only parts.
// Actions only use ctx.db() and ctx.invalidateQueries() — no agent,
// inference or tool calls — so a no-op invalidation is faithful here.
const ctx = {
  db: () => db,
  invalidateQueries: () => {},
};

// --- Helpers ----------------------------------------------------------------
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

async function serveStatic(pathname: string): Promise<Response | null> {
  const clean = pathname === "/" ? "/index.html" : pathname;
  // Never escape client/dist.
  if (clean.includes("..")) return null;
  const file = Bun.file(join(CLIENT_DIST, clean));
  if (!(await file.exists())) return null;
  const ext = clean.slice(clean.lastIndexOf("."));
  return new Response(file, {
    headers: { "content-type": CONTENT_TYPES[ext] ?? "application/octet-stream" },
  });
}

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

// --- Server -----------------------------------------------------------------
const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      return Response.json({ ok: true });
    }

    // Cron keep-alive endpoint. Any external cron service (e.g. cron-job.org)
    // can GET this every 10 minutes; each hit counts as inbound traffic, so
    // Render's free plan does not spin the service down after 15 min idle.
    // Deliberately database-free and action-free: a ping should never be
    // able to mutate an event, and it should stay cheap even if a cron
    // service retries it aggressively.
    if (req.method === "GET" && (pathname === "/api/keep-alive" || pathname === "/api/ping")) {
      return Response.json({
        ok: true,
        service: "aegis",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      });
    }

    if (req.method === "POST" && pathname === "/actions") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return errorResponse(400, "Invalid JSON body");
      }
      const { action, args } = body as { action?: unknown; args?: unknown };
      if (typeof action !== "string" || !(action in Actions)) {
        return errorResponse(404, `Unknown action: ${String(action)}`);
      }
      const def = (Actions as Record<string, any>)[action];
      try {
        const parsedArgs = def.request.parse(args ?? {});
        const result = await def.handler(ctx as never, parsedArgs);
        const data = def.response.parse(result);
        return Response.json({ data });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Zod validation failures are client errors (the space runtime
        // returned 422 for these); handler failures are 500s, except the
        // plain "Event not found" style errors, which are 400s.
        const status =
          message.includes("Event not found") || message.includes("Minimum budget")
            ? 400
            : message.startsWith("Invalid") || /invalid|required|expected/i.test(message)
              ? 422
              : 500;
        console.error(`[aegis] action ${action} failed:`, message);
        return errorResponse(status, message);
      }
    }

    if (req.method === "GET") {
      if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
      const staticRes = await serveStatic(pathname);
      if (staticRes) return staticRes;
      // SPA fallback: the app is a single page, so unknown paths serve it.
      const index = await serveStatic("/index.html");
      if (index) return index;
      return errorResponse(404, "Client build not found (client/dist missing)");
    }

    return errorResponse(405, "Method not allowed");
  },
});

console.log(`[aegis] standalone server listening on http://0.0.0.0:${server.port}`);
console.log(`[aegis] database: ${DATABASE_PATH}`);
console.log(`[aegis] client: ${CLIENT_DIST}`);
