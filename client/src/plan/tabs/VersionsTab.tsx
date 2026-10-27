// VersionsTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { compareSnapshots, formatINR, formatNum } from "../../../../server/src/planner-core";
import type { EventNonNull, VersionT } from "../../types";
import { snapshotMetricsFor } from "../../plan-utils";
import type { Dispatch, SetStateAction } from "react";

export function VersionsTab({
  ev,
  versionsList,
  versionsPending,
  compareA,
  compareB,
  setCompareAId,
  setCompareBId,
  restoreConfirmId,
  setRestoreConfirmId,
  restoreMsg,
  setRestoreMsg,
  restoreMut,
  onSummaryForVersion,
}: {
  ev: EventNonNull;
  versionsList: VersionT[];
  versionsPending: boolean;
  compareA: VersionT | null;
  compareB: VersionT | null;
  setCompareAId: Dispatch<SetStateAction<number | null>>;
  setCompareBId: Dispatch<SetStateAction<number | null>>;
  restoreConfirmId: number | null;
  setRestoreConfirmId: Dispatch<SetStateAction<number | null>>;
  restoreMsg: string;
  setRestoreMsg: Dispatch<SetStateAction<string>>;
  restoreMut: { isPending: boolean; mutate: (versionId: number) => void };
  onSummaryForVersion: (versionId: number) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h3 className="font-serif-display text-2xl">Aegis Plan versions — snapshot history</h3>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Every generate, regenerate and save snapshots the full plan: budget lines, selected venue, menu, manpower
          roster and tasks, plus source, total, per-guest cost and health score. Totals and health below are{" "}
          <strong>recalculated in code from the snapshot</strong>, never just read from storage. Restoring creates a
          brand-new version, so nothing is lost, and Audit re-checks the restored plan — a restore cannot silently hide
          an over-budget or venue-too-small problem.
        </p>
        {versionsPending ? <p className="mt-3 text-[var(--dim)]">Loading versions…</p> : null}
        {versionsList.length === 0 && !versionsPending ? (
          <p className="mt-3 rounded-lg bg-[var(--surface-alt)] p-3 text-sm">
            No snapshots yet for this event. Save any section or regenerate and a version will appear here. Older plans
            from Milestones 1–3 are backfilled with a snapshot of their current state.
          </p>
        ) : null}
        {restoreMsg ? (
          <div role="status" className="mt-3 rounded-lg border notice-info p-3 text-sm">
            {restoreMsg}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {versionsList.map((v) => {
            const m = snapshotMetricsFor(ev, v.snapshot);
            const isCurrent = v.versionNumber === ev.planVersion;
            return (
              <div
                key={v.id}
                className={`rounded-xl border p-4 ${isCurrent ? "border-[var(--accent-strong)] ring-1 ring-[var(--accent-strong)]" : "border-[var(--border)]"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      Version {v.versionNumber}{" "}
                      {isCurrent ? (
                        <span className="ml-1 rounded-full bg-[#0F4C4C] px-2 py-0.5 text-xs text-white">Current</span>
                      ) : null}{" "}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${v.source === "ai" ? "notice-success" : "notice-warning"}`}
                      >
                        {v.source === "ai" ? "✨ AI-generated" : "📋 Template"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-[var(--dim)]">
                      {v.label || "Plan snapshot"} •{" "}
                      {new Date(v.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-2 text-sm">
                      Total <strong>{formatINR(m.total)}</strong> • Per guest <strong>{formatINR(m.perGuest)}</strong> •
                      Health <strong>{m.health}/100</strong> • Venue <strong>{m.selectedVenue?.name ?? "None"}</strong>{" "}
                      • {m.flags.filter((f) => !f.resolved).length} unresolved flag(s)
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <input
                        type="radio"
                        name="compare-a"
                        aria-label={`Compare A version ${v.versionNumber}`}
                        checked={(compareA?.id ?? null) === v.id}
                        onChange={() => setCompareAId(v.id)}
                      />{" "}
                      Compare A
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      <input
                        type="radio"
                        name="compare-b"
                        aria-label={`Compare B version ${v.versionNumber}`}
                        checked={(compareB?.id ?? null) === v.id}
                        onChange={() => setCompareBId(v.id)}
                      />{" "}
                      Compare B
                    </label>
                    <button
                      onClick={() => {
                        onSummaryForVersion(v.id);
                      }}
                      aria-label={`View summary for version ${v.versionNumber}`}
                      className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
                    >
                      Summary for v{v.versionNumber}
                    </button>
                    {!isCurrent ? (
                      restoreConfirmId === v.id ? (
                        <span
                          role="alertdialog"
                          aria-label={`Restore version ${v.versionNumber}?`}
                          className="flex flex-col gap-1"
                        >
                          <span className="text-xs font-semibold text-danger-strong">
                            Restore v{v.versionNumber}? Current plan stays in history as a new version.
                          </span>
                          <button
                            onClick={() => restoreMut.mutate(v.id)}
                            disabled={restoreMut.isPending}
                            aria-label={`Confirm restore version ${v.versionNumber}`}
                            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {restoreMut.isPending ? "Restoring & recalculating…" : `Yes, restore v${v.versionNumber}`}
                          </button>
                          <button
                            onClick={() => setRestoreConfirmId(null)}
                            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setRestoreConfirmId(v.id);
                            setRestoreMsg("");
                          }}
                          aria-label={`Restore version ${v.versionNumber}`}
                          className="rounded-full bg-[#B45309] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          Restore v{v.versionNumber}
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-[var(--dim)]">This is the live plan</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {compareA && compareB && compareA.id !== compareB.id ? (
        (() => {
          const ma = snapshotMetricsFor(ev, compareA.snapshot);
          const mb = snapshotMetricsFor(ev, compareB.snapshot);
          const cmp = compareSnapshots(compareA.snapshot, compareB.snapshot, {
            guestCount: ev.guestCount,
            eventType: ev.eventType,
            eventDate: ev.eventDate,
            budgetMinInr: ev.budgetMinInr,
            budgetMaxInr: ev.budgetMaxInr,
          });
          const cats = Array.from(
            new Set([
              ...(compareA.snapshot.budgetLines ?? []).map((l) => l.category),
              ...(compareB.snapshot.budgetLines ?? []).map((l) => l.category),
            ]),
          );
          const roles = Array.from(
            new Set([
              ...(compareA.snapshot.manpower ?? []).map((m) => m.role),
              ...(compareB.snapshot.manpower ?? []).map((m) => m.role),
            ]),
          );
          return (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <h3 className="font-serif-display text-2xl">
                Compare — v{compareA.versionNumber} vs v{compareB.versionNumber}
              </h3>
              <p className="mt-1 text-sm text-[var(--dim)]">Side by side, recalculated in code. Change = B − A.</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-[var(--surface-alt)] p-3">
                  <p className="text-xs text-[var(--dim)]">TOTAL</p>
                  <p className="font-bold">
                    {formatINR(ma.total)} → {formatINR(mb.total)}
                  </p>
                  <p
                    className={
                      cmp.totalDiff > 0 ? "text-danger-strong font-semibold" : "text-success-strong font-semibold"
                    }
                  >
                    {cmp.totalDiff >= 0 ? "+" : ""}
                    {formatINR(cmp.totalDiff)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-alt)] p-3">
                  <p className="text-xs text-[var(--dim)]">PER GUEST</p>
                  <p className="font-bold">
                    {formatINR(ma.perGuest)} → {formatINR(mb.perGuest)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--surface-alt)] p-3">
                  <p className="text-xs text-[var(--dim)]">HEALTH</p>
                  <p className="font-bold">
                    {ma.health}/100 → {mb.health}/100
                  </p>
                </div>
              </div>
              <h4 className="mt-5 font-bold">Budget — what changed</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--dim)]">
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3">v{compareA.versionNumber} (A)</th>
                      <th className="py-2 pr-3">v{compareB.versionNumber} (B)</th>
                      <th className="py-2">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map((cat) => {
                      const a = compareA.snapshot.budgetLines.find((l) => l.category === cat);
                      const b = compareB.snapshot.budgetLines.find((l) => l.category === cat);
                      const diff = (b?.plannedInr ?? 0) - (a?.plannedInr ?? 0);
                      return (
                        <tr
                          key={cat}
                          className={`border-b border-[var(--border)] ${diff !== 0 ? "row-changed font-medium" : ""}`}
                        >
                          <td className="py-2 pr-3">{b?.label ?? a?.label ?? cat}</td>
                          <td className="py-2 pr-3">{formatINR(a?.plannedInr ?? 0)}</td>
                          <td className="py-2 pr-3">{formatINR(b?.plannedInr ?? 0)}</td>
                          <td className="py-2">
                            {diff === 0 ? "— No change" : `${diff > 0 ? "+" : ""}${formatINR(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <h4 className="mt-5 font-bold">Venue</h4>
              <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[compareA, compareB].map((v, idx) => {
                  const m = idx === 0 ? ma : mb;
                  const sel = m.selectedVenue;
                  return (
                    <div key={v.id} className="rounded-xl border border-[var(--border)] p-3">
                      <p className="font-semibold">
                        v{v.versionNumber}: {sel?.name ?? "None"}
                      </p>
                      <p className="text-[var(--dim)]">
                        Capacity {sel ? formatNum(sel.capacity) : "—"} • Parking{" "}
                        {sel ? formatNum(sel.parkingSpaces) : "—"} • Cost {sel ? formatINR(sel.costInr) : "—"} •{" "}
                        {v.snapshot.venueConfirmed ? "Confirmed ✓" : "Not confirmed"}
                      </p>
                    </div>
                  );
                })}
              </div>
              {ma.selectedVenue?.name === mb.selectedVenue?.name ? (
                <p className="mt-2 text-sm text-[var(--dim)]">Venue did not change between these versions.</p>
              ) : (
                <p className="mt-2 text-sm font-medium text-warning-strong">
                  Venue changed: {ma.selectedVenue?.name ?? "None"} → {mb.selectedVenue?.name ?? "None"}
                </p>
              )}
              <h4 className="mt-5 font-bold">Menu</h4>
              <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[compareA, compareB].map((v) => (
                  <div key={v.id} className="rounded-xl border border-[var(--border)] p-3">
                    <p className="font-semibold">
                      v{v.versionNumber}: {formatINR(v.snapshot.costPerPlateInr)} / plate
                    </p>
                    <p className="text-[var(--dim)]">
                      {(v.snapshot.menu?.courses ?? []).join(", ") || "No courses"} • Desserts{" "}
                      {v.snapshot.desserts ? "Yes" : "No"} • Fruits {v.snapshot.fruits ? "Yes" : "No"} • Dry fruits{" "}
                      {v.snapshot.dryFruits ? "Yes" : "No"}
                    </p>
                  </div>
                ))}
              </div>
              <h4 className="mt-5 font-bold">Manpower</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--dim)]">
                      <th className="py-2 pr-3">Role</th>
                      <th className="py-2 pr-3">v{compareA.versionNumber}</th>
                      <th className="py-2">v{compareB.versionNumber}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => {
                      const a = compareA.snapshot.manpower.find((m) => m.role === role);
                      const b = compareB.snapshot.manpower.find((m) => m.role === role);
                      const changed =
                        (a?.count ?? 0) !== (b?.count ?? 0) ||
                        (a?.costPerPersonInr ?? 0) !== (b?.costPerPersonInr ?? 0);
                      return (
                        <tr
                          key={role}
                          className={`border-b border-[var(--border)] ${changed ? "row-changed font-medium" : ""}`}
                        >
                          <td className="py-2 pr-3">{b?.label ?? a?.label ?? role}</td>
                          <td className="py-2 pr-3">
                            {a
                              ? `${a.count} × ${formatINR(a.costPerPersonInr)} = ${formatINR(a.count * a.costPerPersonInr)}`
                              : "—"}
                          </td>
                          <td className="py-2">
                            {b
                              ? `${b.count} × ${formatINR(b.costPerPersonInr)} = ${formatINR(b.count * b.costPerPersonInr)}`
                              : "—"}
                            {changed ? " • Changed" : ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <h4 className="mt-5 font-bold">Tasks</h4>
              <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {[compareA, compareB].map((v) => (
                  <div key={v.id} className="rounded-xl border border-[var(--border)] p-3">
                    <p className="font-semibold">
                      v{v.versionNumber}: {(v.snapshot.tasks ?? []).length} tasks
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {(v.snapshot.tasks ?? []).map((t, i) => (
                        <li key={i}>
                          {t.title} — {t.owner || "No owner"} ({(t as { status?: string }).status ?? "todo"})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--dim)]">
          Pick two different versions above with Compare A and Compare B to see a side-by-side diff of budget, venue,
          menu, manpower and tasks. You need at least two versions — save an edit or regenerate to create another.
        </div>
      )}
    </div>
  );
}
