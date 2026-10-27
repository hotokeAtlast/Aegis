// template.ts — the deterministic template plan (Milestone 1 engine).
// Moved verbatim from server/src/actions.ts. Food = cost per plate x
// guests + 10% buffer; the split targets the budget midpoint.

import type { z } from "@hatch/space-sdk";
import type { budgetLineSchema, manpowerSchema, menuSchema, taskSchema, venueOptionSchema } from "./schemas";

// --- Budget engine (Milestone 1, preserved) ---
export function buildTemplatePlan(args: {
  guestCount: number;
  budgetMinInr: number;
  budgetMaxInr: number;
  desserts: boolean;
  fruits: boolean;
  dryFruits: boolean;
  decorLevel: string;
  manpower: z.infer<typeof manpowerSchema>[];
  city?: string;
  venuePref?: string;
  expectedCars?: number;
  needsParking?: boolean;
}) {
  const plannedGuests = Math.ceil(args.guestCount * 1.1);
  const mid = Math.floor((args.budgetMinInr + args.budgetMaxInr) / 2);
  const shares: Record<string, number> = {
    venue: 0.3,
    food: 0.35,
    decor: 0.15,
    entertainment: 0.08,
    photography: 0.05,
    manpower: 0.05,
    misc: 0.02,
  };
  let foodBudget = Math.round(mid * (shares.food ?? 0.35));
  let costPerPlate = Math.max(400, Math.floor(foodBudget / plannedGuests));
  costPerPlate = Math.round(costPerPlate / 10) * 10;
  foodBudget = costPerPlate * plannedGuests;
  const manpowerCost = args.manpower.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
  const manpowerBudget = manpowerCost > 0 ? manpowerCost : Math.round(mid * (shares.manpower ?? 0.05));
  const lines: z.infer<typeof budgetLineSchema>[] = [
    {
      category: "venue",
      label: "Venue",
      plannedInr: Math.round(mid * (shares.venue ?? 0.3)),
      note: "Hall / ground rental",
    },
    {
      category: "food",
      label: "Food & Catering",
      plannedInr: foodBudget,
      note: `${plannedGuests} plates incl. 10% buffer`,
    },
    {
      category: "decor",
      label: "Decor",
      plannedInr: Math.round(mid * (shares.decor ?? 0.15)),
      note: `Level: ${args.decorLevel}`,
    },
    {
      category: "entertainment",
      label: "Entertainment",
      plannedInr: Math.round(mid * (shares.entertainment ?? 0.08)),
      note: "DJ / music / anchor",
    },
    {
      category: "photography",
      label: "Photography",
      plannedInr: Math.round(mid * (shares.photography ?? 0.05)),
      note: "Photo + video",
    },
    { category: "manpower", label: "Manpower", plannedInr: manpowerBudget, note: "Staff & helpers" },
    {
      category: "misc",
      label: "Misc / Transport",
      plannedInr: Math.round(mid * (shares.misc ?? 0.02)),
      note: "Transport & extras",
    },
  ];
  let total = lines.reduce((s, l) => s + l.plannedInr, 0);
  if (total > args.budgetMaxInr) {
    const excess = total - args.budgetMaxInr;
    const misc = lines.find((l) => l.category === "misc");
    if (misc) {
      const cut = Math.min(misc.plannedInr, excess);
      misc.plannedInr -= cut;
      total -= cut;
    }
  }
  const city = args.city || "City";
  const cars = args.expectedCars || Math.ceil(args.guestCount / 4);
  const venueLine = lines.find((l) => l.category === "venue")?.plannedInr ?? 300000;
  const venueOptions: z.infer<typeof venueOptionSchema>[] = [
    {
      name: `${city} Grand Hall`,
      capacity: Math.floor(plannedGuests * 0.85),
      parkingSpaces: Math.floor(cars * 0.7),
      costInr: Math.round(venueLine * 0.9),
      kind: "Indoor hall",
    },
    {
      name: `${city} Lakeview Gardens`,
      capacity: Math.ceil(plannedGuests * 1.25),
      parkingSpaces: cars + 25,
      costInr: Math.round(venueLine * 1.05),
      kind: args.venuePref === "indoor" ? "Indoor + lawn" : "Outdoor gardens",
    },
    {
      name: `${city} Heritage Convention Centre`,
      capacity: Math.ceil(plannedGuests * 1.6),
      parkingSpaces: Math.ceil(cars * 1.5),
      costInr: Math.round(venueLine * 1.3),
      kind: "Convention centre",
    },
  ];
  const menu: z.infer<typeof menuSchema> = {
    courses: [
      "Starter",
      "Main Course",
      ...(args.desserts ? ["Dessert"] : []),
      ...(args.fruits ? ["Fresh Fruits"] : []),
      ...(args.dryFruits ? ["Dry Fruits Counter"] : []),
    ],
    notes: `Template menu for ${plannedGuests} guests. Cost per plate recalculated in code.`,
    costPerPlateInr: costPerPlate,
  };
  const tasks: z.infer<typeof taskSchema>[] = [
    { title: "Book venue & confirm parking", dueInDaysBefore: 30, owner: "Coordinator", status: "todo" },
    { title: "Finalise decor & entertainment", dueInDaysBefore: 21, owner: "Decorator", status: "todo" },
    { title: "Menu tasting & confirm caterer", dueInDaysBefore: 14, owner: "Coordinator", status: "todo" },
    { title: "Confirm final guest count", dueInDaysBefore: 7, owner: "Coordinator", status: "todo" },
    { title: "Vendor confirmation calls", dueInDaysBefore: 3, owner: "Coordinator", status: "todo" },
    { title: "Rehearsal / setup check", dueInDaysBefore: 1, owner: "Coordinator", status: "todo" },
  ];
  return {
    budgetLines: lines,
    costPerPlateInr: costPerPlate,
    plannedGuests,
    venueOptions,
    menu,
    tasks,
    risks: [] as string[],
    aiNotes: [] as string[],
  };
}
