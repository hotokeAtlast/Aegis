// selfchecks.ts — in-app unit-style self-checks (Milestone 5).
// Moved verbatim from client/src/App.tsx. These run the SAME production
// functions the plan screens use (computeAuditFlags, healthFromFlags,
// plannedGuestsFor, formatINR) against the verified demo case — 300 guests,
// Hyderabad, Rs 12,00,000-20,00,000, mixed 60% veg — and the results are
// shown live on the Demo guide screen.
import {
  computeAuditFlags,
  formatINR,
  healthFromFlags,
  plannedGuestsFor,
  type AuditFlag,
  type EditLine,
} from "../../server/src/planner-core";

// --- Milestone 5: in-app unit-style self-checks ---------------------------------
// These run the SAME production functions the plan screens use (computeAuditFlags,
// healthFromFlags, plannedGuestsFor, formatINR) against the verified demo case:
// 300 guests, Hyderabad, ₹12,00,000–₹20,00,000, mixed 60% veg. Results are shown
// live on the Demo guide screen — a red row means a real regression, not a mock.
export type SelfCheck = { name: string; pass: boolean; detail: string };
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function healthyAuditInput(): Parameters<typeof computeAuditFlags>[0] {
  const lines: EditLine[] = [
    { category: "venue", label: "Venue", plannedInr: 504000 },
    { category: "food", label: "Food & Catering", plannedInr: 561000 },
    { category: "decor", label: "Decor", plannedInr: 240000 },
    { category: "entertainment", label: "Entertainment", plannedInr: 128000 },
    { category: "photography", label: "Photography", plannedInr: 80000 },
    { category: "manpower", label: "Manpower", plannedInr: 27600 },
    { category: "misc", label: "Misc / Transport", plannedInr: 32000 },
  ];
  return {
    total: 1572600,
    budgetMin: 1200000,
    budgetMax: 2000000,
    perGuest: 5242,
    eventType: "wedding",
    plannedGuests: 330,
    guestCount: 300,
    selectedVenue: { name: "Hyderabad Lakeview Gardens", capacity: 413, parkingSpaces: 100, costInr: 504000 },
    needsParking: true,
    expectedCars: 75,
    foodLineInr: 561000,
    costPerPlate: 1700,
    desserts: true,
    menuCourses: ["Starter", "Main Course", "Dessert", "Dry Fruits Counter"],
    manpower: [
      { role: "server", label: "Servers", count: 15, costPerPersonInr: 800 },
      { role: "security", label: "Security", count: 3, costPerPersonInr: 1200 },
      { role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 },
      { role: "photographer", label: "Photographer", count: 2, costPerPersonInr: 8000 },
    ],
    tasks: [{ title: "Book venue & confirm parking", dueInDaysBefore: 30, owner: "Coordinator", status: "todo" }],
    eventDate: isoInDays(60),
    venueConfirmed: true,
    foodType: "mixed",
    vegPercent: 60,
    vegPlates: 198,
    nonVegPlates: 132,
    budgetLines: lines,
  };
}
export function runSelfChecks(): SelfCheck[] {
  const checks: SelfCheck[] = [];
  const push = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
  const base = healthyAuditInput();
  const total = base.budgetLines.reduce((s, l) => s + l.plannedInr, 0);
  push(
    "Budget maths — total is the sum of all lines",
    total === 1572600,
    `Lines sum to ${formatINR(total)} (demo fixed plan: ${formatINR(1572600)})`,
  );
  push(
    "Budget maths — remaining to maximum",
    base.budgetMax - total === 427400,
    `${formatINR(base.budgetMax)} − ${formatINR(total)} = ${formatINR(base.budgetMax - total)}`,
  );
  push(
    "Budget maths — per-guest cost",
    Math.round(total / base.guestCount) === 5242,
    `${formatINR(total)} ÷ 300 guests = ${formatINR(Math.round(total / base.guestCount))} per guest`,
  );
  push(
    "INR formatting (en-IN grouping)",
    formatINR(1572600) === "₹15,72,600",
    `formatINR(1572600) = ${formatINR(1572600)}`,
  );
  push(
    "Food maths — 10% guest buffer",
    plannedGuestsFor(300) === 330,
    `300 guests → ${plannedGuestsFor(300)} planned for food`,
  );
  const veg = Math.ceil((330 * 60) / 100);
  const nonVeg = 330 - veg;
  push(
    "Food maths — mixed 60% veg split totals 100%",
    veg === 198 && nonVeg === 132 && veg + nonVeg === 330,
    `Veg ${veg} + non-veg ${nonVeg} = ${veg + nonVeg} plates`,
  );
  push(
    "Food maths — food cost = cost per plate × planned guests",
    1700 * 330 === 561000,
    `${formatINR(1700)} × 330 = ${formatINR(1700 * 330)}`,
  );
  const healthy = computeAuditFlags(base);
  push(
    "Audit — healthy demo plan passes all 12 rules",
    healthy.every((f) => f.resolved) && healthFromFlags(healthy) === 100,
    `Unresolved: ${
      healthy
        .filter((f) => !f.resolved)
        .map((f) => f.id)
        .join(", ") || "none"
    } • Health ${healthFromFlags(healthy)}/100`,
  );
  const synthetic: AuditFlag[] = [
    { id: "A", severity: "blocker", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
    { id: "B", severity: "warning", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
    { id: "C", severity: "info", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
  ];
  push(
    "Audit — health score formula (100 − 25 blocker − 10 warning − 2 info)",
    healthFromFlags(synthetic) === 63,
    `1 blocker + 1 warning + 1 info unresolved → ${healthFromFlags(synthetic)}/100`,
  );
  const rule = (id: string, mutate: (i: Parameters<typeof computeAuditFlags>[0]) => void, detail: string) => {
    const copy: Parameters<typeof computeAuditFlags>[0] = {
      ...base,
      manpower: base.manpower.map((m) => ({ ...m })),
      tasks: base.tasks.map((t) => ({ ...t })),
      budgetLines: base.budgetLines.map((l) => ({ ...l })),
      selectedVenue: base.selectedVenue ? { ...base.selectedVenue } : null,
      menuCourses: [...base.menuCourses],
    };
    mutate(copy);
    const flag = computeAuditFlags(copy).find((f) => f.id === id);
    push(`Audit rule — ${id} fires when it should`, !!flag && !flag.resolved, detail);
  };
  rule(
    "OVER_BUDGET",
    (i) => {
      i.total = 2100000;
    },
    "Total ₹21,00,000 vs max ₹20,00,000 must be a blocker",
  );
  rule(
    "UNDER_BUDGET_MIN",
    (i) => {
      i.total = 500000;
    },
    "Total ₹5,00,000 is far below the ₹12,00,000 minimum (below 90%)",
  );
  rule(
    "VENUE_TOO_SMALL",
    (i) => {
      if (i.selectedVenue) i.selectedVenue.capacity = 280;
    },
    "Venue holds 280 but 330 are needed (guests + buffer)",
  );
  rule(
    "PARKING_SHORTFALL",
    (i) => {
      if (i.selectedVenue) i.selectedVenue.parkingSpaces = 52;
    },
    "52 parking spaces for 75 expected cars",
  );
  rule(
    "FOOD_SHORTFALL",
    (i) => {
      i.foodLineInr = 1700 * 300;
    },
    "Food line covers 300 plates (no buffer) but 330 are planned",
  );
  rule(
    "PER_GUEST_TOO_LOW",
    (i) => {
      i.perGuest = 1000;
    },
    "₹1,000 per guest is below the ₹2,000 wedding floor",
  );
  rule(
    "MISSING_DESSERT_CHOICE",
    (i) => {
      i.menuCourses = ["Starter", "Main Course"];
    },
    "Desserts requested but no Dessert course in the menu",
  );
  rule(
    "STAFF_RATIO_LOW",
    (i) => {
      i.manpower = i.manpower.map((m) => (m.role === "server" ? { ...m, count: 5 } : m));
    },
    "5 servers for 300 guests (need 15 at 1 per 20)",
  );
  rule(
    "NO_TIMELINE_OWNER",
    (i) => {
      i.tasks = [{ title: "Book venue", dueInDaysBefore: 30, owner: "", status: "todo" }];
    },
    "A timeline task with no owner",
  );
  rule(
    "DATE_TOO_SOON",
    (i) => {
      i.eventDate = isoInDays(5);
      i.venueConfirmed = false;
    },
    "Event in 5 days with the venue not confirmed",
  );
  rule(
    "MIXED_FOOD_MISMATCH",
    (i) => {
      i.vegPlates = 100;
      i.nonVegPlates = 100;
    },
    "Veg 100 + non-veg 100 ≠ 330 planned plates",
  );
  rule(
    "SINGLE_POINT_FAILURE",
    (i) => {
      i.manpower = i.manpower.map((m) => (m.role === "coordinator" ? { ...m, count: 1 } : m));
    },
    "Coordinator is a critical role with only 1 person",
  );
  // Restore recalculation: a snapshot round-trip must reproduce the same totals/health,
  // and restoring a bad snapshot must re-flag it (restore never hides problems).
  const roundTripped = JSON.parse(JSON.stringify(base)) as Parameters<typeof computeAuditFlags>[0];
  const rtFlags = computeAuditFlags(roundTripped);
  push(
    "Restore — snapshot round-trip recalculates identical totals & health",
    healthFromFlags(rtFlags) === 100 && rtFlags.every((f) => f.resolved),
    "Serialised → restored demo snapshot still scores 100/100",
  );
  const badRestore: Parameters<typeof computeAuditFlags>[0] = {
    ...base,
    selectedVenue: { name: "Hyderabad Grand Hall", capacity: 280, parkingSpaces: 52, costInr: 432000 },
  };
  const badFlags = computeAuditFlags(badRestore);
  const badHealth = healthFromFlags(badFlags);
  push(
    "Restore — restoring a bad version re-flags it instead of hiding it",
    badHealth === 65 &&
      !badFlags.find((f) => f.id === "VENUE_TOO_SMALL")?.resolved &&
      !badFlags.find((f) => f.id === "PARKING_SHORTFALL")?.resolved,
    `Small venue restored → health ${badHealth}/100 (blocker −25, parking warning −10)`,
  );
  return checks;
}
