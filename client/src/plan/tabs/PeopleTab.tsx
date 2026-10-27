// PeopleTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { CRITICAL_ROLES, formatINR, formatNum } from "../../../../server/src/planner-core";
import type { EditManpower } from "../../../../server/src/planner-core";
import type { EventNonNull } from "../../types";

export function PeopleTab({
  ev,
  effectiveManpower,
  manpowerTotalLive,
  saveMsg,
  updateMut,
  onManpowerEdit,
  onSave,
}: {
  ev: EventNonNull;
  effectiveManpower: EditManpower[];
  manpowerTotalLive: number;
  saveMsg: string;
  updateMut: { isPending: boolean; isError: boolean; error: unknown };
  onManpowerEdit: (copy: EditManpower[]) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-serif-display text-2xl">Aegis People & manpower — editable roster</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Staff ratio: 1 server per 20 guests = {Math.ceil(ev.guestCount / 20)} servers needed for{" "}
        {formatNum(ev.guestCount)} guests. Editing count or cost recalculates the roster total and the Manpower budget
        line instantly in code — no AI call.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--dim)]">
              <th className="py-2 pr-3">Role</th>
              <th className="py-2 pr-3">Count</th>
              <th className="py-2 pr-3">Cost per person (₹)</th>
              <th className="py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {effectiveManpower.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-[var(--dim)]">
                  No manpower selected.
                </td>
              </tr>
            ) : (
              effectiveManpower.map((m, mi) => (
                <tr key={m.role} className="border-b border-[var(--border)]">
                  <td className="py-3 pr-3">
                    <p className="font-semibold">{m.label}</p>
                    <p className="text-xs text-[var(--dim)]">
                      {m.role}
                      {CRITICAL_ROLES.includes(m.role) ? " • critical role" : ""}
                    </p>
                  </td>
                  <td className="py-3 pr-3">
                    <label className="sr-only" htmlFor={`mp-count-edit-${m.role}`}>
                      {m.label} count
                    </label>
                    <input
                      id={`mp-count-edit-${m.role}`}
                      aria-label={`${m.label} count`}
                      type="number"
                      min={0}
                      value={m.count}
                      onChange={(e) => {
                        const copy = effectiveManpower.map((x, i) =>
                          i === mi ? { ...x, count: Math.max(0, Number(e.target.value) || 0) } : x,
                        );
                        onManpowerEdit(copy);
                      }}
                      className="w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-center"
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <label className="sr-only" htmlFor={`mp-cost-edit-${m.role}`}>
                      {m.label} cost per person
                    </label>
                    <input
                      id={`mp-cost-edit-${m.role}`}
                      aria-label={`${m.label} cost per person in rupees`}
                      type="number"
                      min={0}
                      step={100}
                      value={m.costPerPersonInr}
                      onChange={(e) => {
                        const copy = effectiveManpower.map((x, i) =>
                          i === mi ? { ...x, costPerPersonInr: Math.max(0, Number(e.target.value) || 0) } : x,
                        );
                        onManpowerEdit(copy);
                      }}
                      className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-right"
                    />
                  </td>
                  <td className="py-3 text-right font-semibold">{formatINR(m.count * m.costPerPersonInr)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-between rounded-xl bg-[var(--surface-alt)] p-4">
        <span className="font-semibold">Manpower total (live, also the Budget → Manpower line)</span>
        <strong>{formatINR(manpowerTotalLive)}</strong>
      </div>
      <p className="mt-3 text-sm text-[var(--dim)]">
        Decor level: <span className="capitalize font-medium text-[var(--text)]">{ev.decorLevel}</span> • Entertainment:{" "}
        {ev.entertainmentTypes} ({ev.entertainmentHours}h) • Kids activities: {ev.kidsActivities ? "Yes" : "No"}
      </p>
      <button
        onClick={onSave}
        disabled={updateMut.isPending}
        className="mt-4 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {updateMut.isPending ? "Saving…" : "Save people changes"}
      </button>
      {saveMsg ? (
        <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">
          {saveMsg}
        </p>
      ) : null}
    </div>
  );
}
