// actions-checks.ts — server-side unit-style self-checks.
// Moved verbatim from server/src/actions.ts: template engine maths and
// snapshot/restore recalculation against the verified demo case.

import { defineAction, z } from "@hatch/space-sdk";
import { computeMetrics, parseSnapshot } from "./versioning";
import { snapshotSchema } from "./schemas";
import { buildTemplatePlan } from "./template";
import type { manpowerSchema } from "./schemas";

// Milestone 5: server-side unit-style checks — template engine maths and
// snapshot/restore recalculation, run against the verified demo case.
export const checkActions = {
  runSelfChecks: defineAction({
    request: z.object({}),
    response: z.object({ checks: z.array(z.object({ name: z.string(), pass: z.boolean(), detail: z.string() })) }),
    async handler() {
      const checks: { name: string; pass: boolean; detail: string }[] = [];
      const push = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });
      const roster: z.infer<typeof manpowerSchema>[] = [
        { role: "server", label: "Servers", count: 15, costPerPersonInr: 800 },
        { role: "security", label: "Security", count: 3, costPerPersonInr: 1200 },
        { role: "valet", label: "Valet", count: 4, costPerPersonInr: 900 },
        { role: "photographer", label: "Photographer", count: 2, costPerPersonInr: 8000 },
        { role: "decorator", label: "Decorator", count: 3, costPerPersonInr: 5000 },
        { role: "coordinator", label: "Coordinator", count: 2, costPerPersonInr: 6000 },
      ];
      const rosterTotal = roster.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
      const tpl = buildTemplatePlan({
        guestCount: 300,
        budgetMinInr: 1200000,
        budgetMaxInr: 2000000,
        desserts: true,
        fruits: false,
        dryFruits: true,
        decorLevel: "premium",
        manpower: roster,
        city: "Hyderabad",
        venuePref: "either",
        expectedCars: 75,
        needsParking: true,
      });
      const tplTotal = tpl.budgetLines.reduce((s, l) => s + l.plannedInr, 0);
      const foodLine = tpl.budgetLines.find((l) => l.category === "food");
      const mpLine = tpl.budgetLines.find((l) => l.category === "manpower");
      push(
        "Template engine — planned guests include the 10% buffer",
        tpl.plannedGuests === 330,
        `300 guests → ${tpl.plannedGuests} planned`,
      );
      push(
        "Template engine — food line = cost per plate × planned guests",
        !!foodLine && foodLine.plannedInr === tpl.costPerPlateInr * tpl.plannedGuests,
        `₹${tpl.costPerPlateInr} × ${tpl.plannedGuests} = ₹${foodLine?.plannedInr ?? 0}`,
      );
      push(
        "Template engine — manpower line = roster total",
        !!mpLine && mpLine.plannedInr === rosterTotal,
        `Roster total ₹${rosterTotal}, budget line ₹${mpLine?.plannedInr ?? 0}`,
      );
      push(
        "Template engine — total is the sum of lines and inside the maximum",
        tplTotal === tpl.budgetLines.reduce((s, l) => s + l.plannedInr, 0) && tplTotal <= 2000000,
        `Template total ₹${tplTotal} vs max ₹20,00,000`,
      );
      const futureDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      const goodSnap = snapshotSchema.parse({
        budgetLines: tpl.budgetLines,
        costPerPlateInr: tpl.costPerPlateInr,
        venueOptions: tpl.venueOptions,
        menu: tpl.menu,
        tasks: tpl.tasks,
        manpower: roster,
        guestCount: 300,
        eventType: "wedding",
        eventDate: futureDate,
        foodType: "mixed",
        vegPercent: 60,
        needsParking: true,
        expectedCars: 75,
        budgetMinInr: 1200000,
        budgetMaxInr: 2000000,
        desserts: true,
        selectedVenueName: tpl.venueOptions[1]?.name ?? null,
        venueConfirmed: true,
      });
      const good = computeMetrics(goodSnap);
      push(
        "Snapshot metrics — totals recalculated from snapshot data",
        good.totalInr === tplTotal && good.perGuestInr === Math.round(tplTotal / 300),
        `Total ₹${good.totalInr}, per guest ₹${good.perGuestInr}`,
      );
      push(
        "Snapshot metrics — healthy snapshot scores 100/100",
        good.healthScore === 100,
        `Health ${good.healthScore}/100 for the large-venue snapshot`,
      );
      const roundTripped = parseSnapshot(JSON.stringify(goodSnap));
      const rt = computeMetrics(roundTripped);
      push(
        "Restore recalculation — snapshot JSON round-trip reproduces totals & health",
        rt.totalInr === good.totalInr && rt.healthScore === good.healthScore,
        `Round-trip total ₹${rt.totalInr}, health ${rt.healthScore}/100`,
      );
      const badSnap = snapshotSchema.parse({ ...goodSnap, selectedVenueName: tpl.venueOptions[0]?.name ?? null });
      const bad = computeMetrics(badSnap);
      push(
        "Restore recalculation — restoring the small-venue snapshot re-flags it",
        bad.healthScore === 65 && bad.healthScore < good.healthScore,
        `Small venue (capacity 280, parking 52) → health ${bad.healthScore}/100 (venue blocker −25, parking warning −10), not hidden`,
      );
      return { checks };
    },
  }),
};
