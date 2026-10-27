// BudgetTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { formatINR } from "../../../../server/src/planner-core";
import type { EditLine } from "../../../../server/src/planner-core";
import type { Dispatch, SetStateAction } from "react";

export function BudgetTab({
  editLines,
  setEditLines,
  effectiveMin,
  effectiveMax,
  setEditBudgetMin,
  setEditBudgetMax,
  totalPlanned,
  remaining,
  perGuest,
  overBudget,
  raiseMaxChecked,
  setRaiseMaxChecked,
  saveMsg,
  setSaveMsg,
  updateMut,
  onSaveBudget,
}: {
  editLines: EditLine[];
  setEditLines: Dispatch<SetStateAction<EditLine[]>>;
  effectiveMin: number;
  effectiveMax: number;
  setEditBudgetMin: Dispatch<SetStateAction<number>>;
  setEditBudgetMax: Dispatch<SetStateAction<number>>;
  totalPlanned: number;
  remaining: number;
  perGuest: number;
  overBudget: boolean;
  raiseMaxChecked: boolean;
  setRaiseMaxChecked: Dispatch<SetStateAction<boolean>>;
  saveMsg: string;
  setSaveMsg: Dispatch<SetStateAction<string>>;
  updateMut: { isPending: boolean; isError: boolean; error: unknown };
  onSaveBudget: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-serif-display text-2xl">Aegis Budget — editable lines + sliders</h3>
      <p className="mt-1 text-sm text-[var(--dim)]">
        Sliders respect the maximum: a slider can only go up to what is left of the maximum after the other categories.
        Typing a number can go over, but then saving is blocked until you reduce the total or explicitly raise the
        maximum. No AI call on slider moves — all maths is in code.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-budget-min" className="text-sm font-semibold">
            Budget minimum (₹)
          </label>
          <input
            id="edit-budget-min"
            type="number"
            min={0}
            step={1000}
            value={effectiveMin}
            onChange={(e) => {
              setEditBudgetMin(Number(e.target.value) || 0);
              setSaveMsg("");
            }}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
          />
        </div>
        <div>
          <label htmlFor="edit-budget-max" className="text-sm font-semibold">
            Budget maximum (₹)
          </label>
          <input
            id="edit-budget-max"
            type="number"
            min={0}
            step={1000}
            value={effectiveMax}
            onChange={(e) => {
              setEditBudgetMax(Number(e.target.value) || 0);
              setRaiseMaxChecked(false);
              setSaveMsg("");
            }}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
          />
        </div>
      </div>
      <div className="mt-5 space-y-5">
        {editLines.map((l, idx) => {
          const sliderMax = Math.max(l.plannedInr, effectiveMax - (totalPlanned - l.plannedInr));
          return (
            <div key={l.category} className="border-b border-[var(--border)] pb-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p id={`budget-label-${l.category}`} className="font-semibold">
                    {l.label}
                  </p>
                  <p className="text-xs text-[var(--dim)]">{l.note}</p>
                </div>
                <label className="sr-only" htmlFor={`budget-${l.category}`}>
                  {l.label} amount in INR
                </label>
                <input
                  id={`budget-${l.category}`}
                  type="number"
                  min={0}
                  step={500}
                  value={l.plannedInr}
                  onChange={(e) => {
                    const copy = [...editLines];
                    copy[idx] = { ...l, plannedInr: Number(e.target.value) || 0 };
                    setEditLines(copy);
                    setSaveMsg("");
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-right font-medium sm:w-44"
                />
                <span className="text-sm text-[var(--dim)]">
                  {totalPlanned ? Math.round((l.plannedInr / totalPlanned) * 100) : 0}%
                </span>
              </div>
              <input
                id={`budget-slider-${l.category}`}
                aria-labelledby={`budget-label-${l.category}`}
                aria-valuetext={`${l.label}: ${formatINR(l.plannedInr)}`}
                type="range"
                min={0}
                max={sliderMax}
                step={5000}
                value={Math.min(l.plannedInr, sliderMax)}
                onChange={(e) => {
                  const copy = [...editLines];
                  copy[idx] = { ...l, plannedInr: Number(e.target.value) || 0 };
                  setEditLines(copy);
                  setSaveMsg("");
                }}
                className="mt-2 w-full"
              />
              <p className="text-xs text-[var(--dim)]">
                Slider max {formatINR(sliderMax)} — capped so the running total cannot exceed the maximum{" "}
                {formatINR(effectiveMax)} via the slider.
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-[var(--surface-alt)] p-4 text-center">
        <div>
          <p className="text-xs text-[var(--dim)]">TOTAL</p>
          <p className="font-bold">{formatINR(totalPlanned)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--dim)]">REMAINING TO MAX</p>
          <p className={`font-bold ${remaining < 0 ? "text-danger-strong" : "text-success-strong"}`}>
            {formatINR(remaining)}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--dim)]">PER GUEST</p>
          <p className="font-bold">{formatINR(perGuest)}</p>
        </div>
      </div>
      {overBudget ? (
        <div role="alert" className="mt-3 rounded-lg notice-danger p-4 text-sm">
          <p className="font-semibold">
            Warning before save: total {formatINR(totalPlanned)} exceeds maximum {formatINR(effectiveMax)} by{" "}
            {formatINR(totalPlanned - effectiveMax)}.
          </p>
          <p className="mt-1">
            Saving is blocked unless you reduce a category, or explicitly raise the maximum. Code will not silently
            change your maximum.
          </p>
          <label className="mt-3 flex items-start gap-2 font-medium">
            <input
              type="checkbox"
              aria-label="Raise maximum to fit total"
              checked={raiseMaxChecked}
              onChange={(e) => {
                const checked = e.target.checked;
                setRaiseMaxChecked(checked);
                if (checked) setEditBudgetMax(totalPlanned);
              }}
              className="mt-1 h-4 w-4"
            />{" "}
            Raise my maximum budget to {formatINR(totalPlanned)} to fit this total
          </label>
          {raiseMaxChecked ? (
            <p className="mt-2 font-medium">
              Maximum will be saved as {formatINR(effectiveMax)}. You can edit it above before saving.
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        onClick={onSaveBudget}
        disabled={updateMut.isPending}
        className="mt-5 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {updateMut.isPending ? "Saving…" : "Save budget changes"}
      </button>
      {saveMsg ? (
        <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">
          {saveMsg}
        </p>
      ) : null}
      {updateMut.isError ? (
        <p role="alert" className="mt-2 text-center text-sm text-danger-strong">
          {String((updateMut.error as Error)?.message || updateMut.error)}
        </p>
      ) : null}
    </div>
  );
}
