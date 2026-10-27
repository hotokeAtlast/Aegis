// actions-versions.ts — plan version listing and restore.
// Moved verbatim from server/src/actions.ts. Restore recalculates in
// code and saves as a new version; it never hides problems.

import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { eventOutSchema, versionOutSchema } from "./schemas";
import {
  buildSnapshot,
  createVersionSnapshot,
  ensureVersionHistory,
  parseSnapshot,
  rowToVersion,
  type VersionRow,
} from "./versioning";
import { rowToEvent } from "./row-mapping";

export const versionActions = {
  listVersions: defineAction({
    request: z.object({ eventId: z.number().int().positive() }),
    response: z.object({ versions: z.array(versionOutSchema) }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const evRows = await db.select().from(schema.events).where(eq(schema.events.id, args.eventId)).limit(1);
      if (!evRows[0]) return { versions: [] };
      const ev = rowToEvent(evRows[0]);
      await ensureVersionHistory(ctx, ev);
      const rows = await db
        .select()
        .from(schema.planVersions)
        .where(eq(schema.planVersions.eventId, args.eventId))
        .orderBy(desc(schema.planVersions.versionNumber), desc(schema.planVersions.id));
      // Dedupe by versionNumber keeping latest snapshot for that version
      const seen = new Set<number>();
      const deduped: VersionRow[] = [];
      for (const r of rows) {
        if (!seen.has(r.versionNumber)) {
          seen.add(r.versionNumber);
          deduped.push(r);
        }
      }
      deduped.sort((a, b) => b.versionNumber - a.versionNumber);
      return { versions: deduped.map(rowToVersion) };
    },
  }),
  restoreVersion: defineAction({
    request: z.object({ eventId: z.number().int().positive(), versionId: z.number().int().positive() }),
    response: z.object({ event: eventOutSchema, message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const evRows = await db.select().from(schema.events).where(eq(schema.events.id, args.eventId)).limit(1);
      const existing = evRows[0];
      if (!existing) throw new Error("Event not found");
      const evCurrent = rowToEvent(existing);
      await ensureVersionHistory(ctx, evCurrent);
      const vRows = await db
        .select()
        .from(schema.planVersions)
        .where(eq(schema.planVersions.id, args.versionId))
        .limit(1);
      const vRow = vRows[0];
      if (!vRow || vRow.eventId !== args.eventId) throw new Error("Version not found for this event");
      const snap = parseSnapshot(vRow.snapshotJson, buildSnapshot(evCurrent));
      // Recalculate in code — do not trust stored totals: sync manpower line to roster, food line to costPerPlate × planned guests
      const plannedGuests = Math.ceil(evCurrent.guestCount * 1.1);
      let lines = snap.budgetLines.map((l) => ({ ...l, plannedInr: Math.max(0, Math.floor(l.plannedInr || 0)) }));
      if (snap.manpower.length) {
        const mpTotal = snap.manpower.reduce((s, m) => s + Math.max(0, m.count) * Math.max(0, m.costPerPersonInr), 0);
        lines = lines.map((l) => (l.category === "manpower" ? { ...l, plannedInr: mpTotal } : l));
      }
      if (snap.costPerPlateInr > 0 && lines.some((l) => l.category === "food")) {
        lines = lines.map((l) =>
          l.category === "food" ? { ...l, plannedInr: snap.costPerPlateInr * plannedGuests } : l,
        );
      }
      const allVersions = await db
        .select()
        .from(schema.planVersions)
        .where(eq(schema.planVersions.eventId, args.eventId));
      const maxVersion = Math.max(
        evCurrent.planVersion,
        ...allVersions.map((v) => v.versionNumber),
        snap ? vRow.versionNumber : 0,
      );
      const newVersion = maxVersion + 1;
      const restoreMsg = `Restored in Aegis from v${vRow.versionNumber} — totals and all 12 audit rules recalculated in code. This restored state is saved as v${newVersion}, so the previous plan is still in history. If the restored version is over budget or the venue is too small, Audit will flag it — restore does not hide problems.`;
      await db
        .update(schema.events)
        .set({
          budgetLinesJson: JSON.stringify(lines),
          costPerPlateInr: snap.costPerPlateInr,
          manpowerJson: JSON.stringify(snap.manpower),
          venueOptionsJson: JSON.stringify(snap.venueOptions),
          menuJson: JSON.stringify({
            courses: snap.menu.courses,
            notes: snap.menu.notes ?? "",
            costPerPlateInr: snap.costPerPlateInr,
          }),
          tasksJson: JSON.stringify(snap.tasks),
          risksJson: JSON.stringify(snap.risks),
          aiNotesJson: JSON.stringify(snap.aiNotes),
          aiModel: snap.aiModel || evCurrent.aiModel,
          planSource: snap.planSource || evCurrent.planSource,
          planVersion: newVersion,
          generationMessage: restoreMsg,
          selectedVenueName: snap.selectedVenueName,
          venueConfirmed: snap.venueConfirmed ? 1 : 0,
          desserts: snap.desserts ? 1 : 0,
          fruits: snap.fruits ? 1 : 0,
          dryFruits: snap.dryFruits ? 1 : 0,
          budgetMinInr: snap.budgetMinInr > 0 ? snap.budgetMinInr : evCurrent.budgetMinInr,
          budgetMaxInr: snap.budgetMaxInr > 0 ? snap.budgetMaxInr : evCurrent.budgetMaxInr,
        })
        .where(eq(schema.events.id, args.eventId));
      const updated = await db.select().from(schema.events).where(eq(schema.events.id, args.eventId)).limit(1);
      const evRestored = rowToEvent(updated[0]!);
      await createVersionSnapshot(ctx, evRestored, `Restored from v${vRow.versionNumber}`);
      ctx.invalidateQueries();
      return { event: evRestored, message: restoreMsg };
    },
  }),
};
