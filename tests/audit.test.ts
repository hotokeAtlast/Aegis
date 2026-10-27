// Audit engine — run with `bun test` from the project root.
// All 12 rules, exercised against the verified demo case (300 guests,
// Hyderabad, ₹12,00,000–₹20,00,000, mixed 60% veg) using the production
// computeAuditFlags / healthFromFlags from server/src/planner-core.ts.
import { describe, expect, test } from "bun:test";
import { computeAuditFlags, healthFromFlags, type AuditFlag, type EditLine, type EditManpower, type EditTask } from "../server/src/planner-core";

type AuditInput = Parameters<typeof computeAuditFlags>[0];
function isoInDays(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

function healthyInput(): AuditInput {
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
    total: 1572600, budgetMin: 1200000, budgetMax: 2000000, perGuest: 5242, eventType: "wedding",
    plannedGuests: 330, guestCount: 300,
    selectedVenue: { name: "Hyderabad Lakeview Gardens", capacity: 413, parkingSpaces: 100, costInr: 504000 },
    needsParking: true, expectedCars: 75, foodLineInr: 561000, costPerPlate: 1700,
    desserts: true, menuCourses: ["Starter", "Main Course", "Dessert", "Dry Fruits Counter"],
    manpower: [
      { role: "server", label: "Servers", count: 15, costPerPersonInr: 800 },
      { role: "security", label: "Security", count: 3, costPerPersonInr: 1200 },
      { role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 },
      { role: "photographer", label: "Photographer", count: 2, costPerPersonInr: 8000 },
    ] as EditManpower[],
    tasks: [{ title: "Book venue & confirm parking", dueInDaysBefore: 30, owner: "Coordinator", status: "todo" }] as EditTask[],
    eventDate: isoInDays(60), venueConfirmed: true, foodType: "mixed", vegPercent: 60, vegPlates: 198, nonVegPlates: 132,
    budgetLines: lines,
  };
}

function flagAfter(id: string, mutate: (i: AuditInput) => void): AuditFlag {
  const copy = healthyInput();
  mutate(copy);
  const flag = computeAuditFlags(copy).find(f => f.id === id);
  if (!flag) throw new Error(`Rule ${id} missing from audit output`);
  return flag;
}

describe("audit engine — healthy plan", () => {
  test("the fixed demo plan passes all 12 rules and scores 100/100", () => {
    const flags = computeAuditFlags(healthyInput());
    expect(flags).toHaveLength(12);
    expect(flags.every(f => f.resolved)).toBe(true);
    expect(healthFromFlags(flags)).toBe(100);
  });
  test("health formula: 100 − 25 blocker − 10 warning − 2 info = 63", () => {
    const synthetic: AuditFlag[] = [
      { id: "A", severity: "blocker", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
      { id: "B", severity: "warning", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
      { id: "C", severity: "info", resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false },
    ];
    expect(healthFromFlags(synthetic)).toBe(63);
  });
  test("health never drops below 0", () => {
    const many: AuditFlag[] = Array.from({ length: 8 }, (_, i) => ({ id: `B${i}`, severity: "blocker" as const, resolved: false, message: "", suggestedFix: "", fixLabel: "", canFix: false }));
    expect(healthFromFlags(many)).toBe(0);
  });
});

describe("audit engine — each of the 12 rules fires when it should", () => {
  test("OVER_BUDGET (blocker): total above maximum", () => {
    const f = flagAfter("OVER_BUDGET", i => { i.total = 2100000; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("blocker");
  });
  test("UNDER_BUDGET_MIN (warning): total far below minimum suggests a missing category", () => {
    const f = flagAfter("UNDER_BUDGET_MIN", i => { i.total = 500000; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("warning");
  });
  test("VENUE_TOO_SMALL (blocker): venue holds 280 but 330 are needed", () => {
    const f = flagAfter("VENUE_TOO_SMALL", i => { if (i.selectedVenue) i.selectedVenue.capacity = 280; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("blocker");
  });
  test("PARKING_SHORTFALL (warning): 52 spaces for 75 expected cars", () => {
    const f = flagAfter("PARKING_SHORTFALL", i => { if (i.selectedVenue) i.selectedVenue.parkingSpaces = 52; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("warning");
  });
  test("FOOD_SHORTFALL (warning): food line covers guests without the buffer", () => {
    const f = flagAfter("FOOD_SHORTFALL", i => { i.foodLineInr = 1700 * 300; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("warning");
  });
  test("PER_GUEST_TOO_LOW (warning): ₹1,000 per guest is below the ₹2,000 wedding floor", () => {
    const f = flagAfter("PER_GUEST_TOO_LOW", i => { i.perGuest = 1000; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("warning");
  });
  test("MISSING_DESSERT_CHOICE (warning): desserts requested but no Dessert course", () => {
    const f = flagAfter("MISSING_DESSERT_CHOICE", i => { i.menuCourses = ["Starter", "Main Course"]; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("warning");
  });
  test("STAFF_RATIO_LOW (warning): 5 servers for 300 guests (need 15 at 1 per 20)", () => {
    const f = flagAfter("STAFF_RATIO_LOW", i => { i.manpower = i.manpower.map(m => m.role === "server" ? { ...m, count: 5 } : m); });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("warning");
  });
  test("NO_TIMELINE_OWNER (info): a timeline task with no owner", () => {
    const f = flagAfter("NO_TIMELINE_OWNER", i => { i.tasks = [{ title: "Book venue", dueInDaysBefore: 30, owner: "", status: "todo" }]; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("info");
  });
  test("DATE_TOO_SOON (blocker): event in 5 days with the venue not confirmed", () => {
    const f = flagAfter("DATE_TOO_SOON", i => { i.eventDate = isoInDays(5); i.venueConfirmed = false; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("blocker");
  });
  test("MIXED_FOOD_MISMATCH (blocker): veg 100 + non-veg 100 ≠ 330 planned plates", () => {
    const f = flagAfter("MIXED_FOOD_MISMATCH", i => { i.vegPlates = 100; i.nonVegPlates = 100; });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("blocker");
  });
  test("SINGLE_POINT_FAILURE (info): coordinator is a critical role with only 1 person", () => {
    const f = flagAfter("SINGLE_POINT_FAILURE", i => { i.manpower = i.manpower.map(m => m.role === "coordinator" ? { ...m, count: 1 } : m); });
    expect(f.resolved).toBe(false); expect(f.severity).toBe("info");
  });
});
