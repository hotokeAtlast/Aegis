// Plan versions — run with `bun test` from the project root.
// Snapshot metrics are ALWAYS recalculated from snapshot data (never read
// from stored totals): compare diffs and restore re-flagging both depend on
// snapshotMetrics / compareSnapshots in server/src/planner-core.ts.
import { describe, expect, test } from "bun:test";
import { compareSnapshots, snapshotMetrics, type SnapshotLike } from "../server/src/planner-core";

function isoInDays(days: number): string { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

function fixedSnapshot(): SnapshotLike {
  return {
    budgetLines: [
      { category: "venue", label: "Venue", plannedInr: 504000 },
      { category: "food", label: "Food & Catering", plannedInr: 561000 },
      { category: "decor", label: "Decor", plannedInr: 240000 },
      { category: "entertainment", label: "Entertainment", plannedInr: 128000 },
      { category: "photography", label: "Photography", plannedInr: 80000 },
      { category: "manpower", label: "Manpower", plannedInr: 27600 },
      { category: "misc", label: "Misc / Transport", plannedInr: 32000 },
    ],
    costPerPlateInr: 1700,
    venueOptions: [
      { name: "Hyderabad Grand Hall", capacity: 280, parkingSpaces: 52, costInr: 432000 },
      { name: "Hyderabad Lakeview Gardens", capacity: 413, parkingSpaces: 100, costInr: 504000 },
    ],
    menu: { courses: ["Starter", "Main Course", "Dessert", "Dry Fruits Counter"], notes: "", costPerPlateInr: 1700 },
    tasks: [{ title: "Book venue & confirm parking", dueInDaysBefore: 30, owner: "Coordinator", status: "todo" }],
    manpower: [
      { role: "server", label: "Servers", count: 15, costPerPersonInr: 800 },
      { role: "security", label: "Security", count: 3, costPerPersonInr: 1200 },
      { role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 },
      { role: "photographer", label: "Photographer", count: 2, costPerPersonInr: 8000 },
    ],
    selectedVenueName: "Hyderabad Lakeview Gardens", venueConfirmed: true,
    budgetMinInr: 1200000, budgetMaxInr: 2000000,
    desserts: true, fruits: false, dryFruits: true,
    guestCount: 300, eventType: "wedding", eventDate: isoInDays(60),
    foodType: "mixed", vegPercent: 60, needsParking: true, expectedCars: 75,
  };
}

function smallVenueSnapshot(): SnapshotLike {
  const s = fixedSnapshot();
  return { ...s, selectedVenueName: "Hyderabad Grand Hall", budgetLines: s.budgetLines.map(l => l.category === "venue" ? { ...l, plannedInr: 432000 } : l) };
}

describe("snapshot metrics — recalculated, never stored", () => {
  test("fixed snapshot: total ₹15,72,600, per-guest ₹5,242, health 100", () => {
    const m = snapshotMetrics(fixedSnapshot());
    expect(m.total).toBe(1572600);
    expect(m.perGuest).toBe(5242);
    expect(m.plannedGuests).toBe(330);
    expect(m.health).toBe(100);
  });
  test("a JSON round-trip (save → restore) reproduces identical metrics", () => {
    const roundTripped = JSON.parse(JSON.stringify(fixedSnapshot())) as SnapshotLike;
    const m = snapshotMetrics(roundTripped);
    expect(m.total).toBe(1572600);
    expect(m.health).toBe(100);
  });
});

describe("restore recalculation — restoring a bad version re-flags it", () => {
  test("small-venue snapshot scores 65 (venue blocker −25, parking warning −10), not 100", () => {
    const m = snapshotMetrics(smallVenueSnapshot());
    expect(m.health).toBe(65);
    expect(m.flags.find(f => f.id === "VENUE_TOO_SMALL")?.resolved).toBe(false);
    expect(m.flags.find(f => f.id === "PARKING_SHORTFALL")?.resolved).toBe(false);
  });
});

describe("snapshot compare", () => {
  test("compare reports the venue line diff, total diff and venue change", () => {
    const cmp = compareSnapshots(smallVenueSnapshot(), fixedSnapshot());
    const venueDiff = cmp.lineDiffs.find(d => d.category === "venue");
    expect(venueDiff?.diff).toBe(72000); // ₹5,04,000 − ₹4,32,000
    expect(cmp.totalDiff).toBe(72000);
    expect(cmp.venueChanged).toBe(true);
    expect(cmp.healthA).toBe(65);
    expect(cmp.healthB).toBe(100);
  });
  test("compare of a snapshot with itself shows no changes", () => {
    const cmp = compareSnapshots(fixedSnapshot(), fixedSnapshot());
    expect(cmp.totalDiff).toBe(0);
    expect(cmp.venueChanged).toBe(false);
    expect(cmp.lineDiffs.every(d => d.diff === 0)).toBe(true);
    expect(cmp.manpowerDiffs.every(d => !d.changed)).toBe(true);
  });
});
