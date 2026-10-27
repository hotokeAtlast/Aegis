// row-mapping.ts — database row -> API event shape.
// Moved verbatim from server/src/actions.ts. rowToEvent sanitises every
// stored array on the way out so a response can never fail validation.

import type { z } from "@hatch/space-sdk";
import type * as schema from "./schema";
import { DEFAULT_MODEL } from "./settings-store";
import type { budgetLineSchema, manpowerSchema } from "./schemas";

export type EventRow = typeof schema.events.$inferSelect;

export function safeParseArray<T>(json: string | null | undefined, fallback: T[]): T[] {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}
export function safeParseObj(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function rowToEvent(row: EventRow) {
  // Sanitise EVERY array on the way out (not just venues/tasks as before):
  // budget lines and manpower used to be raw JSON casts, so any non-integer
  // or malformed stored value would fail the response schema with a 422.
  const manpowerRaw = safeParseArray<Record<string, unknown>>(row.manpowerJson, []);
  const manpower: z.infer<typeof manpowerSchema>[] = manpowerRaw.map((m) => ({
    role: String(m.role || "helper"),
    label: String(m.label || m.role || "Helper"),
    count: Math.max(0, Math.floor(Number(m.count) || 0)),
    costPerPersonInr: Math.max(0, Math.floor(Number(m.costPerPersonInr) || 0)),
  }));
  const budgetLinesRaw = safeParseArray<Record<string, unknown>>(row.budgetLinesJson, []);
  const budgetLines: z.infer<typeof budgetLineSchema>[] = budgetLinesRaw.map((l) => ({
    category: String(l.category ?? "misc"),
    label: String(l.label ?? "Budget"),
    plannedInr: Math.max(0, Math.floor(Number(l.plannedInr) || 0)),
    note: String(l.note ?? ""),
  }));
  const venueOptionsRaw = safeParseArray<Record<string, unknown>>(row.venueOptionsJson, []);
  const venueOptions = venueOptionsRaw.map((v) => ({
    name: String(v.name ?? "Venue"),
    capacity: Math.max(0, Math.floor(Number(v.capacity) || 0)),
    parkingSpaces: Math.max(0, Math.floor(Number(v.parkingSpaces) || 0)),
    costInr: Math.max(0, Math.floor(Number(v.costInr) || 0)),
    kind: String(v.kind ?? ""),
  }));
  const menuObj = safeParseObj(row.menuJson);
  const menu = {
    courses: Array.isArray(menuObj.courses) ? (menuObj.courses as unknown[]).map(String) : [],
    notes: String(menuObj.notes ?? ""),
    costPerPlateInr: Math.max(0, Math.floor(Number(menuObj.costPerPlateInr) || 0)),
  };
  const tasksRaw = safeParseArray<Record<string, unknown>>(row.tasksJson, []);
  const tasks = tasksRaw.map((t) => ({
    title: String(t.title ?? "Task"),
    dueInDaysBefore: Math.floor(Number(t.dueInDaysBefore) || 0),
    owner: t.owner === undefined || t.owner === null ? "Coordinator" : String(t.owner),
    status: String(t.status ?? "todo"),
  }));
  const risks = safeParseArray<unknown>(row.risksJson, []).map(String);
  const aiNotes = safeParseArray<unknown>(row.aiNotesJson, []).map(String);
  return {
    id: row.id,
    plannerName: row.plannerName,
    title: row.title,
    eventType: row.eventType,
    eventDate: row.eventDate,
    city: row.city,
    guestCount: row.guestCount,
    budgetMinInr: row.budgetMinInr,
    budgetMaxInr: row.budgetMaxInr,
    venuePref: row.venuePref,
    needsParking: row.needsParking === 1,
    expectedCars: row.expectedCars,
    areaPreference: row.areaPreference,
    foodType: row.foodType,
    vegPercent: row.vegPercent,
    desserts: row.desserts === 1,
    fruits: row.fruits === 1,
    dryFruits: row.dryFruits === 1,
    dietaryNotes: row.dietaryNotes,
    entertainmentTypes: row.entertainmentTypes,
    entertainmentHours: row.entertainmentHours,
    kidsActivities: row.kidsActivities === 1,
    decorLevel: row.decorLevel,
    manpower,
    budgetLines,
    costPerPlateInr: row.costPerPlateInr,
    planSource: ((row as unknown as Record<string, unknown>).planSource as string) ?? "template",
    planVersion: Number((row as unknown as Record<string, unknown>).planVersion ?? 1),
    venueOptions,
    menu,
    tasks,
    risks,
    aiNotes,
    aiModel: String((row as unknown as Record<string, unknown>).aiModel ?? DEFAULT_MODEL),
    generationMessage: ((row as unknown as Record<string, unknown>).generationMessage as string | null) ?? null,
    selectedVenueName: ((row as unknown as Record<string, unknown>).selectedVenueName as string | null) ?? null,
    venueConfirmed: Number((row as unknown as Record<string, unknown>).venueConfirmed ?? 0) === 1,
    createdAt: row.createdAt.toISOString(),
  };
}
