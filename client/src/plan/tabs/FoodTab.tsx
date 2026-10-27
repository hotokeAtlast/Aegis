// FoodTab — plan tab. JSX moved verbatim from client/src/App.tsx;
// data arrives as explicit props from PlanScreen (same values,
// same handlers, only the navigation/callback names changed).
import { FIELD_LIMITS, formatINR, formatNum } from "../../../../server/src/planner-core";
import type { EditLine } from "../../../../server/src/planner-core";
import type { EventNonNull } from "../../types";
import type { Dispatch, SetStateAction } from "react";

export function FoodTab({
  ev,
  plannedGuests,
  vegPlates,
  nonVegDisplay,
  effectiveCourses,
  setEditMenuCourses,
  newCourse,
  setNewCourse,
  editCostPerPlate,
  foodLine,
  editDesserts,
  editFruits,
  editDryFruits,
  saveMsg,
  setSaveMsg,
  updateMut,
  onCostPerPlateChange,
  onFoodToggle,
  onSave,
}: {
  ev: EventNonNull;
  plannedGuests: number;
  vegPlates: number;
  nonVegDisplay: number;
  effectiveCourses: string[];
  setEditMenuCourses: Dispatch<SetStateAction<string[]>>;
  newCourse: string;
  setNewCourse: Dispatch<SetStateAction<string>>;
  editCostPerPlate: number;
  foodLine: EditLine | undefined;
  editDesserts: boolean;
  editFruits: boolean;
  editDryFruits: boolean;
  saveMsg: string;
  setSaveMsg: Dispatch<SetStateAction<string>>;
  updateMut: { isPending: boolean; isError: boolean; error: unknown };
  onCostPerPlateChange: (v: number) => void;
  onFoodToggle: (key: "desserts" | "fruits" | "dryFruits", val: boolean) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h3 className="font-serif-display text-2xl">Aegis Food & menu builder</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <p>
          Type: <strong className="capitalize">{ev.foodType}</strong>
        </p>
        <p>
          Planned guests (with buffer): <strong>{formatNum(plannedGuests)}</strong>
        </p>
        {ev.foodType === "mixed" ? (
          <>
            <p>
              Veg plates:{" "}
              <strong>
                {formatNum(vegPlates)} ({ev.vegPercent}%)
              </strong>{" "}
              = ceil({formatNum(plannedGuests)} × {ev.vegPercent}%)
            </p>
            <p>
              Non-veg plates:{" "}
              <strong>
                {formatNum(nonVegDisplay)} ({100 - ev.vegPercent}%)
              </strong>{" "}
              = planned − veg, so plates total {formatNum(vegPlates + nonVegDisplay)}
            </p>
          </>
        ) : null}
        {ev.foodType === "veg" ? (
          <p>
            Veg plates: <strong>{formatNum(plannedGuests)}</strong>
          </p>
        ) : null}
        {ev.foodType === "non-veg" ? (
          <p>
            Non-veg plates: <strong>{formatNum(plannedGuests)}</strong>
          </p>
        ) : null}
        <p className="col-span-2">
          Menu courses:{" "}
          <strong>{effectiveCourses.length ? effectiveCourses.join(", ") : "No courses yet — add one below"}</strong>
        </p>
        {ev.dietaryNotes ? <p className="col-span-2">Dietary: {ev.dietaryNotes}</p> : null}
      </div>
      <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
        <p className="font-semibold">Menu builder — courses</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {effectiveCourses.map((c, ci) => (
            <span
              key={`${c}-${ci}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-alt)] px-3 py-1.5 text-sm"
            >
              {c}
              <button
                aria-label={`Remove course ${c}`}
                onClick={() => {
                  const copy = effectiveCourses.filter((_, i) => i !== ci);
                  setEditMenuCourses(copy);
                  setSaveMsg("");
                }}
                className="font-bold text-danger-strong"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor="new-course">
            New course name
          </label>
          <input
            id="new-course"
            maxLength={FIELD_LIMITS.menuCourse}
            value={newCourse}
            onChange={(e) => setNewCourse(e.target.value)}
            placeholder="e.g. Dessert, Live Chaat Counter"
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
          />
          <button
            onClick={() => {
              const t = newCourse.trim();
              if (!t) return;
              setEditMenuCourses([...effectiveCourses, t]);
              setNewCourse("");
              setSaveMsg("");
            }}
            aria-label="Add course"
            className="rounded-xl bg-[#0F4C4C] px-4 py-2.5 font-semibold text-white"
          >
            Add course
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">
          If desserts are requested but no Dessert course is here, audit rule MISSING_DESSERT_CHOICE will warn — its
          one-click fix adds Dessert here.
        </p>
      </div>
      <div className="mt-6">
        <label htmlFor="cost-per-plate" className="font-semibold">
          Cost per plate (₹)
        </label>
        <input
          id="cost-per-plate"
          type="number"
          min={0}
          step={10}
          value={editCostPerPlate}
          onChange={(e) => onCostPerPlateChange(Number(e.target.value) || 0)}
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-lg sm:w-56"
        />
        <p className="mt-2 text-sm">
          Food cost = {formatINR(editCostPerPlate)} × {formatNum(plannedGuests)} ={" "}
          <strong>{formatINR(editCostPerPlate * plannedGuests)}</strong>
          {foodLine ? ` (Budget line: ${formatINR(foodLine.plannedInr)})` : ""}
        </p>
      </div>
      <div className="mt-6 space-y-3">
        {[
          { label: "Desserts", val: editDesserts, key: "desserts" as const, desc: "₹150 / plate" },
          { label: "Fruits", val: editFruits, key: "fruits" as const, desc: "₹80 / plate" },
          { label: "Dry Fruits", val: editDryFruits, key: "dryFruits" as const, desc: "₹120 / plate" },
        ].map((row) => (
          <div key={row.key} className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
            <div>
              <p className="font-semibold">{row.label}</p>
              <p className="text-sm text-[var(--dim)]">{row.desc} — toggling updates food total instantly</p>
            </div>
            <button
              role="switch"
              aria-checked={row.val}
              aria-label={row.label}
              onClick={() => onFoodToggle(row.key, !row.val)}
              className={`h-8 w-14 shrink-0 rounded-full p-1 ${row.val ? "bg-[#0F4C4C]" : "bg-gray-300"}`}
            >
              <span className={`block h-6 w-6 rounded-full bg-white transition ${row.val ? "translate-x-6" : ""}`} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onSave}
        disabled={updateMut.isPending}
        className="mt-5 w-full rounded-xl bg-[#0F4C4C] px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {updateMut.isPending ? "Saving…" : "Save food changes"}
      </button>
      {saveMsg ? (
        <p role="status" aria-live="polite" className="mt-2 text-center text-sm text-success-strong">
          {saveMsg}
        </p>
      ) : null}
    </div>
  );
}
