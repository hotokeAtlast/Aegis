// versioning.ts — plan version snapshots and their recalculation.
// Moved verbatim from server/src/actions.ts. Totals, per-guest cost and
// health are always recomputed from snapshot data in code; stored totals
// are never trusted, so restoring a bad version re-flags it.

import { eq } from "drizzle-orm";
import type { Ctx } from "@hatch/space-sdk";
import * as schema from "./schema";
import { snapshotSchema, type SnapshotData } from "./schemas";
import { DEFAULT_MODEL } from "./settings-store";
import type { rowToEvent } from "./row-mapping";

export type VersionRow = typeof schema.planVersions.$inferSelect;

// --- Milestone 4: Plan versions (snapshots, health recalculated in code) ---
const PER_GUEST_FLOORS_S: Record<string, number> = { wedding: 2000, birthday: 1200, corporate: 1500, other: 1500 };
const CRITICAL_ROLES_S = ["coordinator", "photographer", "security"];

export function buildSnapshot(ev: ReturnType<typeof rowToEvent>): SnapshotData {
  return {
    budgetLines: ev.budgetLines,
    costPerPlateInr: ev.costPerPlateInr,
    venueOptions: ev.venueOptions,
    menu: ev.menu,
    tasks: ev.tasks,
    manpower: ev.manpower,
    risks: ev.risks,
    aiNotes: ev.aiNotes,
    aiModel: ev.aiModel,
    planSource: ev.planSource,
    selectedVenueName: ev.selectedVenueName,
    venueConfirmed: ev.venueConfirmed,
    budgetMinInr: ev.budgetMinInr,
    budgetMaxInr: ev.budgetMaxInr,
    desserts: ev.desserts,
    fruits: ev.fruits,
    dryFruits: ev.dryFruits,
    generationMessage: ev.generationMessage,
    guestCount: ev.guestCount,
    eventType: ev.eventType,
    eventDate: ev.eventDate,
    foodType: ev.foodType,
    vegPercent: ev.vegPercent,
    needsParking: ev.needsParking,
    expectedCars: ev.expectedCars,
  };
}

export function parseSnapshot(json: string | null | undefined, fallback?: SnapshotData): SnapshotData {
  if (!json) return fallback ?? snapshotSchema.parse({});
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return snapshotSchema.parse({
      budgetLines: raw.budgetLines ?? [],
      costPerPlateInr: raw.costPerPlateInr ?? 0,
      venueOptions: raw.venueOptions ?? [],
      menu: raw.menu ?? { courses: [], notes: "", costPerPlateInr: 0 },
      tasks: raw.tasks ?? [],
      manpower: raw.manpower ?? [],
      risks: raw.risks ?? [],
      aiNotes: raw.aiNotes ?? [],
      aiModel: raw.aiModel ?? DEFAULT_MODEL,
      planSource: raw.planSource ?? "template",
      selectedVenueName: raw.selectedVenueName ?? null,
      venueConfirmed: raw.venueConfirmed ?? false,
      budgetMinInr: raw.budgetMinInr ?? 0,
      budgetMaxInr: raw.budgetMaxInr ?? 0,
      desserts: raw.desserts ?? false,
      fruits: raw.fruits ?? false,
      dryFruits: raw.dryFruits ?? false,
      generationMessage: raw.generationMessage ?? null,
      guestCount: raw.guestCount ?? 0,
      eventType: raw.eventType ?? "other",
      eventDate: raw.eventDate ?? "",
      foodType: raw.foodType ?? "veg",
      vegPercent: raw.vegPercent ?? 100,
      needsParking: raw.needsParking ?? false,
      expectedCars: raw.expectedCars ?? 0,
    });
  } catch {
    return fallback ?? snapshotSchema.parse({});
  }
}

// Recompute total / per-guest / health from snapshot data in code — never trust stored totals.
export function computeMetrics(snap: SnapshotData): { totalInr: number; perGuestInr: number; healthScore: number } {
  const total = snap.budgetLines.reduce((s, l) => s + Math.max(0, Math.floor(l.plannedInr || 0)), 0);
  const guestCount = snap.guestCount || 1;
  const perGuest = Math.round(total / guestCount);
  const plannedGuests = Math.ceil(guestCount * 1.1);
  const venue = snap.venueOptions.find((v) => v.name === snap.selectedVenueName) ?? snap.venueOptions[0] ?? null;
  const foodLine = snap.budgetLines.find((l) => l.category === "food")?.plannedInr ?? 0;
  const impliedPlates = snap.costPerPlateInr > 0 ? Math.floor(foodLine / snap.costPerPlateInr) : 0;
  const floor = PER_GUEST_FLOORS_S[snap.eventType] ?? 1500;
  const servers = snap.manpower.find((m) => m.role === "server")?.count ?? 0;
  const security = snap.manpower.find((m) => m.role === "security")?.count ?? 0;
  const hasSecurity = !!snap.manpower.find((m) => m.role === "security");
  const reqServers = Math.ceil(guestCount / 20);
  const reqSecurity = Math.max(2, Math.ceil(guestCount / 100));
  const staffLow = servers < reqServers || (hasSecurity && security < reqSecurity);
  const vegPlates =
    snap.foodType === "veg"
      ? plannedGuests
      : snap.foodType === "non-veg"
        ? 0
        : Math.ceil((plannedGuests * snap.vegPercent) / 100);
  const nonVegPlates =
    snap.foodType === "veg" ? 0 : snap.foodType === "non-veg" ? plannedGuests : plannedGuests - vegPlates;
  const platesOk = vegPlates + nonVegPlates === plannedGuests;
  const mixedOk = snap.foodType !== "mixed" || (snap.vegPercent >= 0 && snap.vegPercent <= 100 && platesOk);
  let days = 999;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(`${snap.eventDate}T00:00:00`);
    if (!isNaN(d.getTime())) days = Math.round((d.getTime() - today.getTime()) / 86400000);
  } catch {
    days = 999;
  }
  const flags: { severity: "blocker" | "warning" | "info"; resolved: boolean }[] = [
    { severity: "blocker", resolved: total <= snap.budgetMaxInr },
    { severity: "warning", resolved: total >= Math.floor(snap.budgetMinInr * 0.9) },
    { severity: "blocker", resolved: !!venue && venue.capacity >= plannedGuests },
    { severity: "warning", resolved: !snap.needsParking || (!!venue && venue.parkingSpaces >= snap.expectedCars) },
    { severity: "warning", resolved: impliedPlates >= plannedGuests },
    { severity: "warning", resolved: perGuest >= floor },
    {
      severity: "warning",
      resolved: !snap.desserts || snap.menu.courses.some((c) => c.toLowerCase().includes("dessert")),
    },
    { severity: "warning", resolved: !staffLow },
    { severity: "info", resolved: snap.tasks.filter((t) => !t.owner || !String(t.owner).trim()).length === 0 },
    { severity: "blocker", resolved: !(days <= 14 && !snap.venueConfirmed) },
    { severity: "blocker", resolved: mixedOk },
    {
      severity: "info",
      resolved: snap.manpower.filter((m) => CRITICAL_ROLES_S.includes(m.role) && m.count === 1).length === 0,
    },
  ];
  const unresolved = flags.filter((f) => !f.resolved);
  const health = Math.max(
    0,
    100 -
      unresolved.filter((f) => f.severity === "blocker").length * 25 -
      unresolved.filter((f) => f.severity === "warning").length * 10 -
      unresolved.filter((f) => f.severity === "info").length * 2,
  );
  return { totalInr: total, perGuestInr: perGuest, healthScore: health };
}

export function rowToVersion(row: VersionRow) {
  const snapshot = parseSnapshot(row.snapshotJson);
  const metrics = computeMetrics(snapshot);
  return {
    id: row.id,
    eventId: row.eventId,
    versionNumber: row.versionNumber,
    source: row.source,
    label: row.label,
    totalInr: metrics.totalInr,
    perGuestInr: metrics.perGuestInr,
    healthScore: metrics.healthScore,
    snapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createVersionSnapshot(ctx: Ctx, ev: ReturnType<typeof rowToEvent>, label: string) {
  try {
    const db = ctx.db<typeof schema>();
    const snap = buildSnapshot(ev);
    const metrics = computeMetrics(snap);
    await db.insert(schema.planVersions).values({
      eventId: ev.id,
      versionNumber: ev.planVersion,
      source: ev.planSource,
      label,
      totalInr: metrics.totalInr,
      perGuestInr: metrics.perGuestInr,
      healthScore: metrics.healthScore,
      snapshotJson: JSON.stringify(snap),
    });
  } catch {
    /* versions table may still be migrating on very first call — never break plan flow */
  }
}

export async function ensureVersionHistory(ctx: Ctx, ev: ReturnType<typeof rowToEvent>) {
  try {
    const db = ctx.db<typeof schema>();
    const existing = await db.select().from(schema.planVersions).where(eq(schema.planVersions.eventId, ev.id)).limit(1);
    if (!existing[0]) await createVersionSnapshot(ctx, ev, "Snapshot of current plan (backfilled for Milestone 4)");
  } catch {
    /* ignore */
  }
}
