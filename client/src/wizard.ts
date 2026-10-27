// wizard.ts — wizard state, defaults and validation (pure, no React).
// Moved verbatim from client/src/App.tsx: the option lists, manpower
// defaults, initial wizard state and the per-step validator. The validator
// is pure — it takes the wizard state and planner name as arguments — so
// WizardScreen and any future caller validate identically.
import { FIELD_LIMITS } from "../../server/src/planner-core";

export const ENTERTAINMENT_OPTS = ["DJ", "Live Music", "Anchor / MC", "Dance Performance", "Photo Booth", "Games Host"];
export const MANPOWER_DEFS = [
  { role: "server", label: "Servers", cost: 800 },
  { role: "security", label: "Security", cost: 1200 },
  { role: "valet", label: "Valet", cost: 900 },
  { role: "photographer", label: "Photographer", cost: 8000 },
  { role: "decorator", label: "Decorator", cost: 5000 },
  { role: "coordinator", label: "Coordinator", cost: 6000 },
];

export type ManpowerRow = { role: string; label: string; count: number; costPerPersonInr: number; selected: boolean };

export type WizardState = {
  title: string;
  eventType: string;
  eventDate: string;
  city: string;
  guestCount: number;
  budgetMinInr: number;
  budgetMaxInr: number;
  venuePref: string;
  needsParking: boolean;
  expectedCars: number;
  areaPreference: string;
  foodType: string;
  vegPercent: number;
  desserts: boolean;
  fruits: boolean;
  dryFruits: boolean;
  dietaryNotes: string;
  entertainmentTypes: string[];
  entertainmentHours: number;
  kidsActivities: boolean;
  manpower: ManpowerRow[];
  decorLevel: string;
};

export function defaultManpower(guests: number): ManpowerRow[] {
  return MANPOWER_DEFS.map((d) => {
    let count = 2;
    if (d.role === "server") count = Math.max(2, Math.ceil(guests / 20));
    if (d.role === "security") count = Math.max(2, Math.ceil(guests / 100));
    if (d.role === "valet") count = 4;
    if (d.role === "photographer") count = 2;
    if (d.role === "decorator") count = 3;
    if (d.role === "coordinator") count = 2;
    return { role: d.role, label: d.label, count, costPerPersonInr: d.cost, selected: true };
  });
}

export function initialWizard(): WizardState {
  return {
    title: "",
    eventType: "wedding",
    eventDate: "",
    city: "",
    guestCount: 300,
    budgetMinInr: 1200000,
    budgetMaxInr: 2000000,
    venuePref: "either",
    needsParking: true,
    expectedCars: 75,
    areaPreference: "",
    foodType: "mixed",
    vegPercent: 60,
    desserts: true,
    fruits: false,
    dryFruits: true,
    dietaryNotes: "",
    entertainmentTypes: ["DJ"],
    entertainmentHours: 4,
    kidsActivities: false,
    manpower: defaultManpower(300),
    decorLevel: "premium",
  };
}

export function validateWizardStep(step: number, wiz: WizardState, plannerName: string): string {
  if (step === 0) {
    if (!plannerName.trim()) return "Your name was lost — go back to the start and enter it again.";
    if (plannerName.length > FIELD_LIMITS.plannerName)
      return `Your name is too long — keep it under ${FIELD_LIMITS.plannerName} characters. Shorten it on the entry screen.`;
    if (!wiz.title.trim()) return "Please give your event a title.";
    if (wiz.title.length > FIELD_LIMITS.title)
      return `Event title is too long — keep it under ${FIELD_LIMITS.title} characters (Event title field, Event step).`;
    if (!wiz.eventDate) return "Please pick an event date.";
    if (!wiz.city.trim()) return "Please enter a city.";
    if (wiz.city.length > FIELD_LIMITS.city)
      return `City is too long — keep it under ${FIELD_LIMITS.city} characters (City field, Event step).`;
    if (!Number.isFinite(wiz.guestCount) || wiz.guestCount < 10 || wiz.guestCount > 2000)
      return "Guests must be between 10 and 2,000.";
  }
  if (step === 1) {
    if (!wiz.budgetMinInr || wiz.budgetMinInr <= 0) return "Enter a minimum budget in INR.";
    if (!wiz.budgetMaxInr || wiz.budgetMaxInr <= 0) return "Enter a maximum budget in INR.";
    if (wiz.budgetMinInr >= wiz.budgetMaxInr) return "Minimum budget must be less than maximum budget.";
  }
  if (step === 2) {
    if (wiz.needsParking && (!wiz.expectedCars || wiz.expectedCars < 1))
      return "Enter expected cars, or turn parking off.";
    if (wiz.areaPreference.length > FIELD_LIMITS.areaPreference)
      return `Area preference is too long — keep it under ${FIELD_LIMITS.areaPreference} characters (Area preference field, Venue step).`;
  }
  if (step === 3) {
    if (wiz.foodType === "mixed" && (wiz.vegPercent < 0 || wiz.vegPercent > 100))
      return "Veg / non-veg split must total 100%.";
    if (wiz.dietaryNotes.length > FIELD_LIMITS.dietaryNotes)
      return `Dietary notes are too long — keep them under ${FIELD_LIMITS.dietaryNotes} characters (Dietary restrictions field, Food step).`;
  }
  if (step === 4) {
    if (wiz.entertainmentTypes.length === 0) return "Pick at least one entertainment type.";
    if (wiz.entertainmentTypes.join(", ").length > FIELD_LIMITS.entertainmentTypes)
      return `Too many entertainment types selected — the combined list must stay under ${FIELD_LIMITS.entertainmentTypes} characters (Entertainment step).`;
    if (!Number.isFinite(wiz.entertainmentHours) || wiz.entertainmentHours < 1 || wiz.entertainmentHours > 12)
      return "Enter entertainment duration in hours (1 to 12).";
  }
  if (step === 5) {
    if (!wiz.manpower.some((m) => m.selected)) return "Select at least one people / resource role.";
    if (wiz.manpower.some((m) => m.selected && (!Number.isFinite(m.count) || m.count < 0)))
      return "People counts must be 0 or more — check the People step.";
  }
  return "";
}
