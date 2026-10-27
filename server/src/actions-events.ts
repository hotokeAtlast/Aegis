// actions-events.ts — event lifecycle actions: template + AI creation,
// regeneration, reads and customise saves.
// Moved verbatim from server/src/actions.ts.

import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { FIELD_LIMITS, capText } from "./planner-core";
import {
  budgetLineInputSchema,
  eventOutSchema,
  intLike,
  manpowerInputSchema,
  menuInputSchema,
  taskInputSchema,
} from "./schemas";
import { createVersionSnapshot, ensureVersionHistory } from "./versioning";
import { rowToEvent } from "./row-mapping";
import { buildTemplatePlan } from "./template";
import { tryGenerateAI } from "./gemini";
import { DEFAULT_MODEL, getSetting } from "./settings-store";
import { validateWizardRanges, wizardRequest, wizardToInsertBase, type WizardArgs } from "./wizard-input";

export const eventActions = {
  createEvent: defineAction({
    request: wizardRequest,
    response: z.object({ event: eventOutSchema }),
    async handler(ctx, args) {
      validateWizardRanges(args);
      const template = buildTemplatePlan({
        guestCount: args.guestCount,
        budgetMinInr: args.budgetMinInr,
        budgetMaxInr: args.budgetMaxInr,
        desserts: args.desserts,
        fruits: args.fruits,
        dryFruits: args.dryFruits,
        decorLevel: args.decorLevel,
        manpower: args.manpower,
        city: args.city,
        venuePref: args.venuePref,
        expectedCars: args.expectedCars,
        needsParking: args.needsParking,
      });
      const db = ctx.db<typeof schema>();
      const result = await db
        .insert(schema.events)
        .values({
          ...wizardToInsertBase(args),
          manpowerJson: JSON.stringify(args.manpower),
          budgetLinesJson: JSON.stringify(template.budgetLines),
          costPerPlateInr: template.costPerPlateInr,
          planSource: "template",
          planVersion: 1,
          venueOptionsJson: JSON.stringify(template.venueOptions),
          menuJson: JSON.stringify(template.menu),
          tasksJson: JSON.stringify(template.tasks),
          risksJson: JSON.stringify([]),
          aiNotesJson: JSON.stringify([]),
          aiModel: DEFAULT_MODEL,
          generationMessage: "Aegis template plan — AI was not used for this version.",
          selectedVenueName: template.venueOptions[0]?.name ?? null,
          venueConfirmed: 0,
        })
        .returning();
      const row = result[0];
      if (!row) throw new Error("Failed to create event");
      const evCreated = rowToEvent(row);
      await createVersionSnapshot(ctx, evCreated, "Initial template plan");
      ctx.invalidateQueries();
      return { event: evCreated };
    },
  }),
  createEventAI: defineAction({
    request: wizardRequest,
    response: z.object({ event: eventOutSchema, usedAI: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      validateWizardRanges(args);
      const db = ctx.db<typeof schema>();
      try {
        const { validated, model } = await tryGenerateAI(ctx, args);
        const result = await db
          .insert(schema.events)
          .values({
            ...wizardToInsertBase(args),
            manpowerJson: JSON.stringify(validated.manpower),
            budgetLinesJson: JSON.stringify(validated.budgetLines),
            costPerPlateInr: validated.costPerPlateInr,
            planSource: "ai",
            planVersion: 1,
            venueOptionsJson: JSON.stringify(validated.venueOptions),
            menuJson: JSON.stringify(validated.menu),
            tasksJson: JSON.stringify(validated.tasks),
            risksJson: JSON.stringify(validated.risks),
            aiNotesJson: JSON.stringify(validated.aiNotes),
            aiModel: model,
            generationMessage: `Generated with Aegis using ${model} (temperature 0.3). All totals recalculated in code.`,
            selectedVenueName: validated.venueOptions[0]?.name ?? null,
            venueConfirmed: 0,
          })
          .returning();
        const row = result[0];
        if (!row) throw new Error("Failed to create event");
        const evAi = rowToEvent(row);
        await createVersionSnapshot(ctx, evAi, `Initial AI plan (${model})`);
        ctx.invalidateQueries();
        return {
          event: evAi,
          usedAI: true,
          message: `Aegis AI plan generated with ${model}. Totals recalculated in code.`,
        };
      } catch (e) {
        const reason = (e as Error).message || "AI generation failed";
        const template = buildTemplatePlan({
          guestCount: args.guestCount,
          budgetMinInr: args.budgetMinInr,
          budgetMaxInr: args.budgetMaxInr,
          desserts: args.desserts,
          fruits: args.fruits,
          dryFruits: args.dryFruits,
          decorLevel: args.decorLevel,
          manpower: args.manpower,
          city: args.city,
          venuePref: args.venuePref,
          expectedCars: args.expectedCars,
          needsParking: args.needsParking,
        });
        const isNoKey = reason.startsWith("NO_KEY");
        const msg = isNoKey
          ? "Aegis AI generation not connected yet — no Gemini API key saved. Showing Aegis template plan as fallback. Add your key in Settings, then Regenerate with AI."
          : `Aegis AI generation failed after one retry (${reason.slice(0, 180)}). Showing Aegis template plan as fallback so you are never left with a blank screen.`;
        const model = (await getSetting(ctx, "gemini_model")) || DEFAULT_MODEL;
        const result = await db
          .insert(schema.events)
          .values({
            ...wizardToInsertBase(args),
            manpowerJson: JSON.stringify(args.manpower),
            budgetLinesJson: JSON.stringify(template.budgetLines),
            costPerPlateInr: template.costPerPlateInr,
            planSource: "template",
            planVersion: 1,
            venueOptionsJson: JSON.stringify(template.venueOptions),
            menuJson: JSON.stringify(template.menu),
            tasksJson: JSON.stringify(template.tasks),
            risksJson: JSON.stringify([]),
            aiNotesJson: JSON.stringify([]),
            aiModel: model,
            generationMessage: msg,
            selectedVenueName: template.venueOptions[0]?.name ?? null,
            venueConfirmed: 0,
          })
          .returning();
        const row = result[0];
        if (!row) throw new Error("Failed to create event");
        const evFb = rowToEvent(row);
        await createVersionSnapshot(ctx, evFb, "Initial template fallback (AI not connected / failed)");
        ctx.invalidateQueries();
        return { event: evFb, usedAI: false, message: msg };
      }
    },
  }),
  regeneratePlan: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      section: z.string().max(FIELD_LIMITS.regenSection).optional(),
      instruction: z.string().max(FIELD_LIMITS.regenInstruction).optional(),
    }),
    response: z.object({ event: eventOutSchema, usedAI: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existingRows = await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error("Event not found");
      const ev = rowToEvent(existing);
      const wizardArgs: WizardArgs = {
        plannerName: ev.plannerName,
        title: ev.title,
        eventType: ev.eventType as WizardArgs["eventType"],
        eventDate: ev.eventDate,
        city: ev.city,
        guestCount: ev.guestCount,
        budgetMinInr: ev.budgetMinInr,
        budgetMaxInr: ev.budgetMaxInr,
        venuePref: ev.venuePref as WizardArgs["venuePref"],
        needsParking: ev.needsParking,
        expectedCars: ev.expectedCars,
        areaPreference: ev.areaPreference,
        foodType: ev.foodType as WizardArgs["foodType"],
        vegPercent: ev.vegPercent,
        desserts: ev.desserts,
        fruits: ev.fruits,
        dryFruits: ev.dryFruits,
        dietaryNotes: ev.dietaryNotes,
        entertainmentTypes: ev.entertainmentTypes,
        entertainmentHours: ev.entertainmentHours,
        kidsActivities: ev.kidsActivities,
        decorLevel: ev.decorLevel as WizardArgs["decorLevel"],
        manpower: ev.manpower,
      };
      try {
        const { validated, model } = await tryGenerateAI(ctx, wizardArgs, args.section, args.instruction);
        // Section-scoped merge: if a single section was requested, keep other sections from previous plan where sensible
        let finalLines = validated.budgetLines;
        let finalVenues = validated.venueOptions;
        let finalMenu = validated.menu;
        let finalManpower = validated.manpower;
        let finalTasks = validated.tasks;
        let finalCost = validated.costPerPlateInr;
        if (args.section && args.section !== "all") {
          if (args.section === "budget") {
            finalVenues = ev.venueOptions.length ? ev.venueOptions : finalVenues;
            finalMenu = ev.menu.courses.length ? ev.menu : finalMenu;
            finalTasks = ev.tasks.length ? ev.tasks : finalTasks;
          } else if (args.section === "venue") {
            finalLines = ev.budgetLines;
            finalMenu = ev.menu.courses.length ? ev.menu : finalMenu;
            finalCost = ev.costPerPlateInr;
            finalManpower = ev.manpower;
            finalTasks = ev.tasks.length ? ev.tasks : finalTasks;
          } else if (args.section === "food") {
            finalVenues = ev.venueOptions.length ? ev.venueOptions : finalVenues;
            /* keep new food line + menu */ const others = ev.budgetLines.filter((l) => l.category !== "food");
            const foodLine = validated.budgetLines.find((l) => l.category === "food");
            finalLines = foodLine
              ? [...others, foodLine].sort(
                  (a, b) =>
                    ["venue", "food", "decor", "entertainment", "photography", "manpower", "misc"].indexOf(a.category) -
                    ["venue", "food", "decor", "entertainment", "photography", "manpower", "misc"].indexOf(b.category),
                )
              : ev.budgetLines;
            finalTasks = ev.tasks.length ? ev.tasks : finalTasks;
          } else if (args.section === "people") {
            finalLines = ev.budgetLines.map((l) =>
              l.category === "manpower" ? (validated.budgetLines.find((x) => x.category === "manpower") ?? l) : l,
            );
            finalVenues = ev.venueOptions.length ? ev.venueOptions : finalVenues;
            finalMenu = ev.menu.courses.length ? ev.menu : finalMenu;
            finalCost = ev.costPerPlateInr;
          }
        }
        const newVersion = ev.planVersion + 1;
        await db
          .update(schema.events)
          .set({
            budgetLinesJson: JSON.stringify(finalLines),
            costPerPlateInr: finalCost,
            manpowerJson: JSON.stringify(finalManpower),
            venueOptionsJson: JSON.stringify(finalVenues),
            menuJson: JSON.stringify(finalMenu),
            tasksJson: JSON.stringify(finalTasks),
            risksJson: JSON.stringify(validated.risks),
            aiNotesJson: JSON.stringify(validated.aiNotes),
            planSource: "ai",
            planVersion: newVersion,
            aiModel: model,
            generationMessage: `Regenerated${args.section ? ` (${args.section})` : ""} with Aegis using ${model} — v${newVersion}. Totals recalculated in code.`,
            selectedVenueName: finalVenues[0]?.name ?? null,
            venueConfirmed: 0,
          })
          .where(eq(schema.events.id, args.id));
        const updated = await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
        const evRegen = rowToEvent(updated[0]!);
        await ensureVersionHistory(ctx, ev);
        await createVersionSnapshot(
          ctx,
          evRegen,
          `Regenerated${args.section ? ` (${args.section})` : ""} with ${model}`,
        );
        ctx.invalidateQueries();
        return { event: evRegen, usedAI: true, message: `Regenerated with Aegis using ${model} — now v${newVersion}.` };
      } catch (e) {
        const reason = (e as Error).message || "AI failed";
        const isNoKey = reason.startsWith("NO_KEY");
        const msg = isNoKey
          ? "Aegis AI not connected yet — no key saved. Your current plan is unchanged. Add a key in Settings to regenerate with AI."
          : `Aegis AI regeneration failed after one retry (${reason.slice(0, 160)}). Your current plan is unchanged — no blank screen, no data lost.`;
        // Keep plan unchanged, only record message so UI can explain
        await db.update(schema.events).set({ generationMessage: msg }).where(eq(schema.events.id, args.id));
        const updated = await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
        ctx.invalidateQueries();
        return { event: rowToEvent(updated[0]!), usedAI: false, message: msg };
      }
    },
  }),
  getEvent: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ event: eventOutSchema.nullable() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
      return { event: rows[0] ? rowToEvent(rows[0]) : null };
    },
  }),
  listEvents: defineAction({
    request: z.object({ plannerName: z.string().optional() }),
    response: z.object({ events: z.array(eventOutSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let rows;
      if (args.plannerName)
        rows = await db
          .select()
          .from(schema.events)
          .where(eq(schema.events.plannerName, args.plannerName))
          .orderBy(desc(schema.events.id));
      else rows = await db.select().from(schema.events).orderBy(desc(schema.events.id)).limit(50);
      return { events: rows.map(rowToEvent) };
    },
  }),
  updatePlan: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      budgetLines: z.array(budgetLineInputSchema),
      costPerPlateInr: intLike,
      desserts: z.boolean(),
      fruits: z.boolean(),
      dryFruits: z.boolean(),
      manpower: z.array(manpowerInputSchema).optional(),
      tasks: z.array(taskInputSchema).optional(),
      menu: menuInputSchema.optional(),
      selectedVenueName: z.string().max(FIELD_LIMITS.venueName).nullable().optional(),
      venueConfirmed: z.boolean().optional(),
      budgetMinInr: intLike.optional(),
      budgetMaxInr: intLike.optional(),
    }),
    response: z.object({ event: eventOutSchema }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existingRows = await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error("Event not found");
      const evExisting = rowToEvent(existing);
      const newMin = args.budgetMinInr ?? evExisting.budgetMinInr;
      const newMax = args.budgetMaxInr ?? evExisting.budgetMaxInr;
      if (newMin >= newMax)
        throw new Error(
          "Minimum budget must be less than maximum budget. Raise the maximum first if you want to save an over-budget total.",
        );
      // Server recalculation: sync manpower line to roster total when manpower supplied.
      // Free-text fields are also re-capped here with the shared FIELD_LIMITS
      // (defence in depth — the request schema already enforces the same caps).
      let lines = args.budgetLines.map((l) => ({
        category: capText(l.category, FIELD_LIMITS.budgetCategory),
        label: capText(l.label, FIELD_LIMITS.budgetLabel),
        note: capText(l.note ?? "", FIELD_LIMITS.budgetNote),
        plannedInr: Math.max(0, Math.floor(l.plannedInr)),
      }));
      const cleanManpower = args.manpower?.map((m) => ({
        role: capText(m.role, FIELD_LIMITS.manpowerRole),
        label: capText(m.label || m.role, FIELD_LIMITS.manpowerLabel),
        count: Math.max(0, Math.floor(m.count || 0)),
        costPerPersonInr: Math.max(0, Math.floor(m.costPerPersonInr || 0)),
      }));
      if (cleanManpower) {
        const mpTotal = cleanManpower.reduce((s, m) => s + m.count * m.costPerPersonInr, 0);
        lines = lines.map((l) => (l.category === "manpower" ? { ...l, plannedInr: mpTotal } : l));
      }
      const cleanCostPerPlate = Math.max(0, Math.floor(args.costPerPlateInr || 0));
      // Sync menu costPerPlate with top-level field
      const menuToSave = args.menu
        ? {
            courses: args.menu.courses.map((c) => capText(c, FIELD_LIMITS.menuCourse)),
            notes: capText(args.menu.notes ?? evExisting.menu.notes, FIELD_LIMITS.menuNotes),
            costPerPlateInr: cleanCostPerPlate,
          }
        : evExisting.menu;
      await ensureVersionHistory(ctx, evExisting);
      const newVersion = evExisting.planVersion + 1;
      const updateSet: Record<string, unknown> = {
        budgetLinesJson: JSON.stringify(lines),
        costPerPlateInr: cleanCostPerPlate,
        desserts: args.desserts ? 1 : 0,
        fruits: args.fruits ? 1 : 0,
        dryFruits: args.dryFruits ? 1 : 0,
        budgetMinInr: Math.round(newMin),
        budgetMaxInr: Math.round(newMax),
        planVersion: newVersion,
        planSource: evExisting.planSource === "ai" ? "ai" : "template",
        generationMessage: `Saved edits in Aegis — saved as v${newVersion}. Totals and audit recalculated in code.`,
      };
      if (cleanManpower) updateSet.manpowerJson = JSON.stringify(cleanManpower);
      if (args.tasks)
        updateSet.tasksJson = JSON.stringify(
          args.tasks.map((t) => ({
            title: capText(t.title, FIELD_LIMITS.taskTitle),
            dueInDaysBefore: Math.floor(t.dueInDaysBefore || 0),
            owner: capText(t.owner ?? "", FIELD_LIMITS.taskOwner),
            status: capText(t.status ?? "todo", FIELD_LIMITS.taskStatus),
          })),
        );
      if (args.menu) updateSet.menuJson = JSON.stringify(menuToSave);
      if (args.selectedVenueName !== undefined)
        updateSet.selectedVenueName =
          args.selectedVenueName === null ? null : capText(args.selectedVenueName, FIELD_LIMITS.venueName);
      if (args.venueConfirmed !== undefined) updateSet.venueConfirmed = args.venueConfirmed ? 1 : 0;
      await db
        .update(schema.events)
        .set(updateSet as never)
        .where(eq(schema.events.id, args.id));
      const updated = await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
      const evSaved = rowToEvent(updated[0]!);
      await createVersionSnapshot(ctx, evSaved, "Saved edits (customise / audit fix)");
      ctx.invalidateQueries();
      return { event: evSaved };
    },
  }),
};
