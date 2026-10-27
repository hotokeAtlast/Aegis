// wizard-input.ts — the wizard request schema and its readable range
// checks. Moved verbatim from server/src/actions.ts. Numbers arrive via
// intLike (decimals rounded, JSON null from a cleared field becomes 0
// and is caught by the range checks, never an opaque 422); text caps
// come from FIELD_LIMITS, the same constants the client uses.

import { z } from "@hatch/space-sdk";
import { FIELD_LIMITS } from "./planner-core";
import { intLike, manpowerInputSchema } from "./schemas";

// Wizard request: deliberately forgiving. Numbers arrive via intLike
// (decimals are rounded, JSON null from a cleared/NaN field becomes 0 and is
// then caught by the handlers' readable range checks — never an opaque 422).
// Text caps come from FIELD_LIMITS in planner-core.ts — the SAME constants
// the client uses for its maxLength attributes, its payload capText calls and
// its pre-send validator — so client and server can never drift apart again
// (the residual-422 fix). The template fallback (createEvent) uses this exact
// same wizardRequest schema, so it is covered by the same aligned caps.
export const wizardRequest = z.object({
  plannerName: z.string().min(1).max(FIELD_LIMITS.plannerName),
  title: z.string().min(1).max(FIELD_LIMITS.title),
  eventType: z.enum(["wedding", "birthday", "corporate", "other"]),
  eventDate: z.string().min(1).max(FIELD_LIMITS.eventDate),
  city: z.string().min(1).max(FIELD_LIMITS.city),
  guestCount: intLike,
  budgetMinInr: intLike,
  budgetMaxInr: intLike,
  venuePref: z.enum(["indoor", "outdoor", "either"]),
  needsParking: z.boolean(),
  expectedCars: intLike.default(0),
  areaPreference: z.string().max(FIELD_LIMITS.areaPreference).optional().nullable(),
  foodType: z.enum(["veg", "non-veg", "mixed"]),
  vegPercent: intLike.default(100),
  desserts: z.boolean(),
  fruits: z.boolean(),
  dryFruits: z.boolean(),
  dietaryNotes: z.string().max(FIELD_LIMITS.dietaryNotes).optional().nullable(),
  entertainmentTypes: z.string().max(FIELD_LIMITS.entertainmentTypes).default(""),
  entertainmentHours: intLike.default(3),
  kidsActivities: z.boolean().default(false),
  decorLevel: z.enum(["simple", "premium", "luxury"]).default("simple"),
  manpower: z.array(manpowerInputSchema).default([]),
});

export type WizardArgs = z.infer<typeof wizardRequest>;

export function validateWizardRanges(args: WizardArgs) {
  // Readable, field-specific errors (shown to the user as-is) instead of the
  // opaque 422 that strict schema ranges used to produce.
  if (!args.plannerName.trim()) throw new Error("Please enter your name before generating a plan.");
  if (!args.title.trim()) throw new Error("Please give your event a title.");
  if (!args.city.trim()) throw new Error("Please enter a city.");
  // Length backstop with readable, field-specific messages. The schema caps
  // above use the same FIELD_LIMITS as the client, so this only fires for
  // non-browser callers — and it names the field and its limit, never a 422.
  if (args.title.length > FIELD_LIMITS.title)
    throw new Error(`Event title is too long — keep it under ${FIELD_LIMITS.title} characters (Event step).`);
  if (args.city.length > FIELD_LIMITS.city)
    throw new Error(`City is too long — keep it under ${FIELD_LIMITS.city} characters (Event step).`);
  if ((args.areaPreference ?? "").length > FIELD_LIMITS.areaPreference)
    throw new Error(
      `Area preference is too long — keep it under ${FIELD_LIMITS.areaPreference} characters (Venue step).`,
    );
  if ((args.dietaryNotes ?? "").length > FIELD_LIMITS.dietaryNotes)
    throw new Error(
      `Dietary notes are too long — keep them under ${FIELD_LIMITS.dietaryNotes} characters (Food step).`,
    );
  if (args.entertainmentTypes.length > FIELD_LIMITS.entertainmentTypes)
    throw new Error(
      `Entertainment types are too long — keep them under ${FIELD_LIMITS.entertainmentTypes} characters (Entertainment step).`,
    );
  if (!args.guestCount || args.guestCount < 10 || args.guestCount > 2000)
    throw new Error("Guests must be a whole number between 10 and 2,000 — please check the Event step.");
  if (!args.budgetMinInr || !args.budgetMaxInr || args.budgetMinInr <= 0 || args.budgetMaxInr <= 0)
    throw new Error("Enter a minimum and maximum budget in whole rupees on the Budget step.");
  if (args.budgetMinInr >= args.budgetMaxInr) throw new Error("Minimum budget must be less than maximum budget");
}

export function wizardToInsertBase(args: WizardArgs) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v || 0)));
  return {
    plannerName: args.plannerName.trim(),
    title: args.title.trim(),
    eventType: args.eventType,
    eventDate: args.eventDate,
    city: args.city.trim(),
    guestCount: clamp(args.guestCount, 10, 2000),
    budgetMinInr: Math.max(0, Math.round(args.budgetMinInr || 0)),
    budgetMaxInr: Math.max(0, Math.round(args.budgetMaxInr || 0)),
    venuePref: args.venuePref,
    needsParking: args.needsParking ? 1 : 0,
    expectedCars: args.needsParking ? Math.max(0, Math.round(args.expectedCars || 0)) : 0,
    areaPreference: args.areaPreference ?? null,
    foodType: args.foodType,
    vegPercent: args.foodType === "veg" ? 100 : args.foodType === "non-veg" ? 0 : clamp(args.vegPercent, 0, 100),
    desserts: args.desserts ? 1 : 0,
    fruits: args.fruits ? 1 : 0,
    dryFruits: args.dryFruits ? 1 : 0,
    dietaryNotes: args.dietaryNotes ?? null,
    entertainmentTypes: args.entertainmentTypes,
    entertainmentHours: clamp(args.entertainmentHours || 3, 1, 12),
    kidsActivities: args.kidsActivities ? 1 : 0,
    decorLevel: args.decorLevel,
  };
}
