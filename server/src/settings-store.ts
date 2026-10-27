// settings-store.ts — Gemini key / model persistence and key masking.
// Moved verbatim from server/src/actions.ts. The key is stored
// server-side and only ever exposed masked.

import { eq } from "drizzle-orm";
import type { Ctx } from "@hatch/space-sdk";
import * as schema from "./schema";

export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// --- Settings helpers ---
export async function getSetting(ctx: Ctx, key: string): Promise<string | null> {
  try {
    const db = ctx.db<typeof schema>();
    const rows = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}
export async function setSetting(ctx: Ctx, key: string, value: string) {
  const db = ctx.db<typeof schema>();
  const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1);
  if (existing[0]) {
    await db.update(schema.appSettings).set({ value }).where(eq(schema.appSettings.key, key));
  } else {
    await db.insert(schema.appSettings).values({ key, value });
  }
}
export async function deleteSetting(ctx: Ctx, key: string) {
  const db = ctx.db<typeof schema>();
  await db.delete(schema.appSettings).where(eq(schema.appSettings.key, key));
}
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
