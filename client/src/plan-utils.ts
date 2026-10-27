// plan-utils.ts — pure plan helpers shared by PlanScreen and its tabs.
// addDays and templateVenues moved verbatim from client/src/App.tsx;
// snapshotMetricsFor and buildSummaryText are App's metricsForSnapshot /
// buildSummaryText with the event passed in explicitly instead of closed
// over, so tabs can use them without reaching into PlanScreen state.
// syncManpower is App's helper with its lines argument made explicit.
// Nothing here changes any number: all maths still lives in planner-core.
import {
  formatINR,
  formatNum,
  plannedGuestsFor,
  snapshotMetrics,
  type EditLine,
  type EditManpower,
  type SnapshotMetrics,
} from "../../server/src/planner-core";
import type { EventNonNull, VersionT } from "./types";

export function addDays(dateStr: string, offset: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function templateVenues(ev: EventNonNull) {
  const planned = plannedGuestsFor(ev.guestCount);
  const venueLine = ev.budgetLines.find((l) => l.category === "venue")?.plannedInr ?? 300000;
  const cars = ev.expectedCars || Math.ceil(ev.guestCount / 4);
  return [
    {
      name: `${ev.city || "City"} Grand Hall`,
      capacity: Math.floor(planned * 0.85),
      parkingSpaces: Math.floor(cars * 0.7),
      costInr: Math.round(venueLine * 0.9),
      kind: "Indoor hall",
    },
    {
      name: `${ev.city || "City"} Lakeview Gardens`,
      capacity: Math.ceil(planned * 1.25),
      parkingSpaces: cars + 25,
      costInr: Math.round(venueLine * 1.05),
      kind: ev.venuePref === "indoor" ? "Indoor + lawn" : "Outdoor gardens",
    },
    {
      name: `${ev.city || "City"} Heritage Convention Centre`,
      capacity: Math.ceil(planned * 1.6),
      parkingSpaces: Math.ceil(cars * 1.5),
      costInr: Math.round(venueLine * 1.3),
      kind: "Convention centre",
    },
  ];
}

// Recalculate total / per-guest / health for a snapshot, falling back to
// the live event's basics for snapshots that predate those fields —
// exactly App's metricsForSnapshot, with the event as a parameter.
export function snapshotMetricsFor(ev: EventNonNull, snap: VersionT["snapshot"]): SnapshotMetrics {
  return snapshotMetrics(snap, {
    guestCount: ev.guestCount,
    eventType: ev.eventType,
    eventDate: ev.eventDate,
    budgetMinInr: ev.budgetMinInr,
    budgetMaxInr: ev.budgetMaxInr,
  });
}

export function buildSummaryText(ev: EventNonNull, snap: VersionT["snapshot"], versionLabel: string): string {
  const m = snapshotMetricsFor(ev, snap);
  const venueTxt = m.selectedVenue
    ? `${m.selectedVenue.name} — capacity ${formatNum(m.selectedVenue.capacity)}, parking ${formatNum(m.selectedVenue.parkingSpaces)} cars, ${formatINR(m.selectedVenue.costInr)}${snap.venueConfirmed ? " (Confirmed)" : " (Not confirmed)"}`
    : "No venue selected";
  const top = [...m.flags.filter((f) => !f.resolved)]
    .sort(
      (a, b) =>
        (a.severity === "blocker" ? 0 : a.severity === "warning" ? 1 : 2) -
        (b.severity === "blocker" ? 0 : b.severity === "warning" ? 1 : 2),
    )
    .slice(0, 3);
  const lines: string[] = [
    `${ev.title} — Aegis Event Plan Summary (${versionLabel})`,
    `${ev.eventType} • ${ev.eventDate} • ${ev.city} • Planned by ${ev.plannerName}`,
    ``,
    `Guests: ${formatNum(snap.guestCount || ev.guestCount)} + 10% buffer = ${formatNum(m.plannedGuests)} for food`,
    `Budget: ${formatINR(snap.budgetMinInr)} – ${formatINR(snap.budgetMaxInr)} | Total planned: ${formatINR(m.total)} | Remaining to max: ${formatINR((snap.budgetMaxInr || 0) - m.total)} | Per guest: ${formatINR(m.perGuest)}`,
    `Health score: ${m.health}/100`,
    ``,
    `Budget breakdown:`,
    ...(snap.budgetLines ?? []).map((l) => `  • ${l.label}: ${formatINR(l.plannedInr)}`),
    ``,
    `Venue: ${venueTxt}`,
    `Menu: ${(snap.menu?.courses ?? []).join(", ") || "—"} | ${formatINR(snap.costPerPlateInr)} per plate × ${formatNum(m.plannedGuests)} = ${formatINR(snap.costPerPlateInr * m.plannedGuests)}`,
    `Food: ${snap.foodType}${snap.foodType === "mixed" ? ` — Veg ${formatNum(m.vegPlates)} plates (${snap.vegPercent}%), Non-veg ${formatNum(m.nonVegPlates)} plates (${100 - snap.vegPercent}%)` : ""} | Desserts: ${snap.desserts ? "Yes" : "No"} | Fruits: ${snap.fruits ? "Yes" : "No"} | Dry fruits: ${snap.dryFruits ? "Yes" : "No"}`,
    `Manpower: ${(snap.manpower ?? []).map((mp) => `${mp.label} ×${mp.count} (${formatINR(mp.count * mp.costPerPersonInr)})`).join(", ") || "—"} | Total ${formatINR((snap.manpower ?? []).reduce((s, mp) => s + mp.count * mp.costPerPersonInr, 0))}`,
    `Tasks: ${(snap.tasks ?? []).length} tasks — ${(snap.tasks ?? []).map((t) => `${t.title} (${t.owner || "No owner"}, ${t.status ?? "todo"})`).join("; ") || "—"}`,
    ``,
    `Top audit flags:`,
    ...(top.length
      ? top.map((f) => `  • [${f.severity.toUpperCase()}] ${f.id}: ${f.message}`)
      : [`  • All 12 audit rules pass.`]),
    ``,
    `Generated with Aegis • Source: ${snap.planSource === "ai" ? "AI-generated" : "Template"} • Model: ${snap.aiModel} • All totals recalculated in code. Venue options are suggestions to verify, not bookings.`,
  ];
  return lines.join("\n");
}
// Sync the Manpower budget line to a roster total (used when the roster
// changes in People and when audit fixes change staff counts).
export function syncManpower(newMp: EditManpower[], linesBase: EditLine[]): EditLine[] {
  const mpTotal = newMp.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
  return linesBase.map((l) => (l.category === "manpower" ? { ...l, plannedInr: mpTotal } : l));
}
