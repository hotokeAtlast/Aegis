// TimelineTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { daysUntilEvent } from "../../../../server/src/planner-core";
import type { EditTask } from "../../../../server/src/planner-core";
import type { EventNonNull } from "../../types";
import { addDays } from "../../plan-utils";
import type { Dispatch, SetStateAction } from "react";

export function TimelineTab({
  ev,
  effectiveTasks,
  setEditTasks,
  setSaveMsg,
  saveMsg,
  updateMut,
  onSave,
}: {
  ev: EventNonNull;
  effectiveTasks: EditTask[];
  setEditTasks: Dispatch<SetStateAction<EditTask[]>>;
  setSaveMsg: Dispatch<SetStateAction<string>>;
  saveMsg: string;
  updateMut: { isPending: boolean; isError: boolean; error: unknown };
  onSave: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-serif-display text-2xl">Aegis Timeline checklist — counting back from {ev.eventDate}</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Each task has an owner and a status. Clear an owner to see NO_TIMELINE_OWNER in Audit — its fix reassigns
        Coordinator. Event is in {daysUntilEvent(ev.eventDate)} day(s).
      </p>
      <div className="mt-5 space-y-3">
        {effectiveTasks.map((t, i) => (
          <div key={`${t.title}-${i}`} className="rounded-xl border border-[var(--border)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{t.title}</p>
                <p className="text-sm text-[var(--dim)]">
                  {addDays(ev.eventDate, -Math.abs(t.dueInDaysBefore))} • {Math.abs(t.dueInDaysBefore)} days before •
                  Due in days before: {t.dueInDaysBefore}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${t.status === "done" ? "notice-success" : t.status === "in_progress" ? "notice-warning" : "bg-[var(--surface-alt)]"}`}
              >
                {t.status === "done" ? "Done" : t.status === "in_progress" ? "In progress" : "To do"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label htmlFor={`task-owner-${i}`} className="text-xs font-semibold">
                  Owner
                </label>
                <input
                  id={`task-owner-${i}`}
                  value={t.owner}
                  onChange={(e) => {
                    const copy = effectiveTasks.map((x, xi) => (xi === i ? { ...x, owner: e.target.value } : x));
                    setEditTasks(copy);
                    setSaveMsg("");
                  }}
                  placeholder="e.g. Coordinator (leave blank to trigger audit info)"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor={`task-status-${i}`} className="text-xs font-semibold">
                  Status
                </label>
                <select
                  id={`task-status-${i}`}
                  value={t.status}
                  onChange={(e) => {
                    const copy = effectiveTasks.map((x, xi) => (xi === i ? { ...x, status: e.target.value } : x));
                    setEditTasks(copy);
                    setSaveMsg("");
                  }}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
                >
                  <option value="todo">To do</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>
          </div>
        ))}
        <div className="rounded-xl bg-[var(--surface-alt)] p-4">
          <p className="font-semibold">Event day — {ev.title}</p>
          <p className="text-sm text-[var(--dim)]">{addDays(ev.eventDate, 0)} • Owner: All</p>
        </div>
      </div>
      <button
        onClick={onSave}
        disabled={updateMut.isPending}
        className="mt-4 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {updateMut.isPending ? "Saving…" : "Save timeline changes"}
      </button>
      {saveMsg ? (
        <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">
          {saveMsg}
        </p>
      ) : null}
    </div>
  );
}
