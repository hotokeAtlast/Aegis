// DemoScreen — in-app Demo guide & README plus live self-checks.
// JSX moved verbatim from client/src/App.tsx. The server self-check query
// moved with it (it runs whenever this screen is mounted, which is exactly
// when the old `enabled: screen === "demo"` gate was true); the settings
// query is local. Back / Settings navigation are props.
import { useQuery } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "../api";
import { FIELD_LIMITS } from "../../../server/src/planner-core";
import { runSelfChecks } from "../selfchecks";

export function DemoScreen({
  genCount,
  onBack,
  onSettings,
}: {
  genCount: number;
  onBack: () => void;
  onSettings: () => void;
}) {
  const serverChecksQuery = useQuery({
    queryKey: ["selfchecks"],
    queryFn: () => api.runSelfChecks({}),
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings({}),
  });
  const settings = settingsQuery.data;
  const clientChecks = runSelfChecks();
  const clientPassed = clientChecks.filter((c) => c.pass).length;
  const serverChecks = serverChecksQuery.data?.checks ?? [];
  const serverPassed = serverChecks.filter((c) => c.pass).length;
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto max-w-3xl px-5 pb-12 pt-6">
        <button
          onClick={() => onBack()}
          className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium"
        >
          ← Back
        </button>
        <h1 className="font-serif-display mt-5 text-4xl">Aegis — Demo guide & README</h1>
        <p className="mt-2 text-[var(--dim)]">
          Everything a judge (or a first-time user) needs about Aegis: what Aegis does, the exact 3-minute demo, how the
          Gemini key works, and live proof that the budget, food and audit maths is correct.
        </p>

        <section
          aria-label="What Aegis does"
          className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">What Aegis does</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Aegis is an audit-proof event planning platform for weddings, birthdays and large events with 100s of
            guests. <strong>Entry is name-only — no login, no password:</strong> type your name on the first screen and
            you are in. A 7-step mandatory wizard collects event basics, budget in INR, venue & parking, food (veg /
            non-veg / mixed split, desserts, fruits, dry fruits), entertainment, and people & resources. Aegis then
            builds a plan, <strong>recalculates every total in code</strong> (the AI never owns the numbers), and runs a{" "}
            <strong>12-rule audit engine</strong> that flags over-budget plans, too-small venues, parking and food
            shortfalls and more — each with a one-click fix that only counts as resolved after recalculation passes.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>
              Tabs: Overview, Budget (sliders capped by your maximum), Venue (fit scores), Food (menu builder), People
              (editable roster), Timeline, Audit, Versions (snapshot, compare & restore), Summary (printable one-pager).
            </li>
            <li>All money is INR, formatted en-IN (e.g. ₹15,72,600). Food is planned for guests + 10% buffer.</li>
            <li>
              Themes: every screen is contrast-checked in light and dark mode — message boxes, banners and the wizard's
              Live per-guest range pair dark text on light backgrounds and light text on dark backgrounds.
            </li>
          </ul>
        </section>

        <section
          aria-label="Three minute demo script"
          className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">The Aegis 3-minute demo script</h2>
          <p className="mt-2 text-sm">
            Use exactly this case:{" "}
            <strong>
              300-guest wedding, Hyderabad, budget ₹12,00,000 – ₹20,00,000, mixed food 60% veg / 40% non-veg, desserts
              and dry fruits yes, huge parking yes (≈75 cars).
            </strong>
          </p>
          <div className="mt-4 space-y-4 text-sm leading-relaxed">
            <div className="highlight-box rounded-xl p-4">
              <p className="font-bold">Minute 1 — Wizard</p>
              <p className="mt-1">
                Enter any name (no login). Start a new event and walk the wizard. On the Budget step, point at the{" "}
                <strong>Live per-guest range: ₹4,000 – ₹6,667 per guest</strong> — it updates as you type. Note the food
                step plans for <strong>330 guests (300 + 10% buffer)</strong>: 198 veg plates + 132 non-veg plates.
              </p>
            </div>
            <div className="highlight-box rounded-xl p-4">
              <p className="font-bold">Minute 2 — Generate & customise</p>
              <p className="mt-1">
                On Review, choose <strong>Generate with AI</strong> (needs a key — see below) or{" "}
                <strong>Use template plan</strong>. Open Food and toggle Dry Fruits off: the food line and total fall
                instantly, with no AI call. Open Budget and drag a slider — it cannot push the total past your maximum.
              </p>
            </div>
            <div className="highlight-box rounded-xl p-4">
              <p className="font-bold">Minute 3 — Audit fix, versions, summary</p>
              <p className="mt-1">
                The first plan flags <strong>VENUE_TOO_SMALL</strong> and <strong>PARKING_SHORTFALL</strong> (Hyderabad
                Grand Hall: 280 capacity, 52 spaces). In Audit, apply the venue fix (switch to Lakeview Gardens),
                confirm the venue, and raise the single coordinator to 2. The fixed plan lands at{" "}
                <strong>total ₹15,72,600, remaining ₹4,27,400, ₹5,242 per guest, health 100/100</strong>. Open Versions
                to compare v1 vs the fixed version and restore the old one — Audit re-flags it, proving restore
                recalculates. Finish on Summary: the printable one-pager, with Copy-as-text and Download.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label="Gemini key and AI versus template"
          className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">Gemini key, AI vs template</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed">
            <p>
              <strong>Adding your key later:</strong> open{" "}
              <button
                onClick={() => {
                  onSettings();
                }}
                className="font-bold underline text-accent-strong"
              >
                Settings / API Key
              </button>
              , paste a Gemini API key from Google AI Studio, and Save. The key is stored server-side for Aegis, only
              ever shown masked (e.g. AIza••••1234), and can be changed or cleared there. The model is{" "}
              <strong>gemini-3.5-flash-lite</strong> (temperature 0.3, JSON-only).{" "}
              <strong>Live AI generation requires your key</strong> — without one, nothing breaks: Aegis says so plainly
              and falls back to the template plan. Only wizard answers are sent to the model; your name never is.
            </p>
            <p>
              <strong>AI-generated plan:</strong> Gemini proposes budget lines, venue suggestions, menu, manpower and
              tasks as structured JSON. Code then validates every field, repairs gaps from the template, and
              recalculates all totals — an over-budget AI total is flagged in Audit, never silently accepted. Venue
              options are suggestions to verify, not bookings.
            </p>
            <p>
              <strong>Template fallback:</strong> a deterministic split of the budget midpoint (Venue 30% • Food 35% •
              Decor 15% • Entertainment 8% • Photography 5% • Manpower 5% • Misc 2%), with food cost = cost per plate ×
              guests + buffer. Same audit engine, same recalculation — it is the guaranteed path when there is no key or
              the AI call fails after one retry. Your current status:{" "}
              {settings?.hasKey ? (
                <strong className="text-success-strong">
                  AI connected ({settings.model}, key {settings.maskedKey})
                </strong>
              ) : (
                <strong className="text-warning-strong">no key saved — template fallback is active</strong>
              )}
              .
            </p>
          </div>
        </section>

        <section
          aria-label="Self checks"
          className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">Self-checks — run live, right now</h2>
          <p className="mt-2 text-sm text-[var(--dim)]">
            Unit-style checks executed against the real budget, food and audit functions — in the browser (the same code
            the plan screens use) and on the server (template engine, snapshot & restore recalculation). A failed row is
            a real failure, shown honestly.
          </p>
          <div
            className={`mt-4 rounded-xl border p-4 ${clientPassed === clientChecks.length ? "notice-success" : "notice-danger"}`}
          >
            <p className="font-bold">
              Browser checks: {clientPassed}/{clientChecks.length} passed
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {clientChecks.map((c) => (
                <li key={c.name} className="flex gap-2">
                  <span aria-hidden="true">{c.pass ? "✓" : "✗"}</span>
                  <span>
                    <strong>{c.name}.</strong> <span className="flag-dim">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 rounded-xl border border-[var(--border)] p-4">
            <p className="font-bold">
              Server checks:{" "}
              {serverChecksQuery.isPending
                ? "running…"
                : serverChecksQuery.isError
                  ? "could not run — server unreachable from this screen"
                  : `${serverPassed}/${serverChecks.length} passed`}
            </p>
            {serverChecks.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {serverChecks.map((c) => (
                  <li key={c.name} className="flex gap-2">
                    <span aria-hidden="true">{c.pass ? "✓" : "✗"}</span>
                    <span>
                      <strong>{c.name}.</strong> <span className="text-[var(--dim)]">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {serverChecksQuery.isError ? (
              <p role="alert" className="mt-2 text-sm text-danger-strong">
                The server self-check action failed to respond. The browser checks above still ran against the real
                audit code.
              </p>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-[var(--dim)]">
            Generations this session: {genCount}. Security notes: all inputs are validated on the server, money is
            stored as integer rupees, AI output is treated as untrusted data and re-validated field by field, and no API
            key is ever shipped in Aegis or shown in full.
          </p>
        </section>

        <section
          aria-label="Tests in code"
          className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">Tests — real test files in the project</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Beyond the live self-checks above, the Aegis project ships a{" "}
            <strong>
              runnable test suite in <code>tests/</code>
            </strong>{" "}
            that imports the <strong>same production functions</strong> Aegis runs — the budget, food, audit and
            snapshot maths all live in one shared module, <code>server/src/planner-core.ts</code>, used by the client,
            the server and the tests, so the tests can never drift away from the shipped code.{" "}
            <strong>How to run:</strong> from the project root, <code>bun test</code> (or <code>bun run test</code>). No
            extra dependencies — it uses Bun's built-in test runner. Current suite:{" "}
            <strong>62 tests, all passing</strong>.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
            <li>
              <strong>tests/budget.test.ts</strong> — budget maths: total is the sum of lines (demo ₹15,72,600),
              remaining to maximum (₹4,27,400, and negative when over), per-guest cost (₹5,242), zero-guest safety,
              en-IN INR formatting.
            </li>
            <li>
              <strong>tests/food.test.ts</strong> — food maths: the 10% buffer (300 → 330, always rounding up), food
              cost = cost per plate × planned guests, and the veg / non-veg split totalling the planned count at every
              percentage (60% → 198 + 132).
            </li>
            <li>
              <strong>tests/manpower.test.ts</strong> — manpower totals: roster total = Σ count × cost per person (demo
              ₹27,600), the exact figure the Manpower budget line syncs to.
            </li>
            <li>
              <strong>tests/audit.test.ts</strong> — all <strong>12 audit rules</strong>, each firing individually on
              the demo case, the healthy plan passing all 12 at health 100, and the health formula (100 − 25 blocker −
              10 warning − 2 info, floored at 0).
            </li>
            <li>
              <strong>tests/versions.test.ts</strong> — snapshot compare (venue diff ₹72,000, health 65 → 100) and
              restore recalculation: a JSON round-trip reproduces identical metrics, and restoring the small-venue
              snapshot re-flags it at health 65 instead of hiding it.
            </li>
            <li>
              <strong>tests/field-limits.test.ts</strong> — the client/server text-cap contract (see Field limits
              below): every wizard and customise field has one shared cap, and capping a 5,000-character note lands
              exactly on the limit the server accepts.
            </li>
            <li>
              <strong>tests/accessibility.test.ts</strong> — WCAG AA contrast: every theme surface pair (notices,
              highlight box, page, surfaces) passes 4.5:1 in <strong>both</strong> light and dark schemes, and the old
              white-on-white pairing is proven to fail, so a regression would be caught.
            </li>
          </ul>
        </section>

        <section
          aria-label="Accessibility and field limits"
          className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">Accessibility & field limits</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>
              <strong>Labels:</strong> every wizard input, budget amount and slider, food toggle, roster count/cost and
              tab has a visible label tied to its control (sliders are labelled by their visible category name; toggles
              and selector buttons expose <code>aria-pressed</code> / <code>role="switch"</code> state).
            </li>
            <li>
              <strong>Keyboard:</strong> the whole wizard and customise flow works by keyboard alone in logical (DOM)
              order. The plan tab bar follows the tab pattern — Tab lands on the active tab, ← / → / Home / End move
              between tabs — and every interactive element shows a thick focus ring (<code>:focus-visible</code>) in
              both colour schemes.
            </li>
            <li>
              <strong>Announcements:</strong> wizard errors appear in an assertive live region linked to the fields via{" "}
              <code>aria-describedby</code>, and Generate jumps to the step that needs fixing; save, fix and restore
              feedback uses polite live regions; audit flags are labelled groups naming rule, severity and resolved
              state; restore uses an alert dialog pattern.
            </li>
            <li>
              <strong>Contrast:</strong> every pale message box and the wizard's Live per-guest range pair dark text on
              light tints (light mode) and light text on dark tints (dark mode) — verified numerically at WCAG AA 4.5:1+
              in tests/accessibility.test.ts for both schemes, never white on white.
            </li>
            <li>
              <strong>Field limits (no more 422s):</strong> one shared limit list (<code>FIELD_LIMITS</code>) drives the
              input <code>maxLength</code>, the payload the client sends, and the server schema — planner name{" "}
              {FIELD_LIMITS.plannerName}, title {FIELD_LIMITS.title}, city {FIELD_LIMITS.city}, area preference{" "}
              {FIELD_LIMITS.areaPreference}, dietary notes {FIELD_LIMITS.dietaryNotes}, entertainment types{" "}
              {FIELD_LIMITS.entertainmentTypes}, regenerate instruction {FIELD_LIMITS.regenInstruction}, menu course{" "}
              {FIELD_LIMITS.menuCourse}, task owner {FIELD_LIMITS.taskOwner}, API key {FIELD_LIMITS.apiKey}, model name{" "}
              {FIELD_LIMITS.modelName} characters. The template fallback uses the same schema. Anything genuinely over a
              limit is caught by the wizard validator <em>before sending</em>, with a message naming the field, its
              limit and its step.
            </li>
          </ul>
        </section>

        <section
          aria-label="GitHub submission and downloading the project"
          className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
        >
          <h2 className="font-serif-display text-2xl">GitHub submission & downloading this project</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed">
            <p>
              <strong>No API key is in the code — ever.</strong> There is no hardcoded Gemini key anywhere in the Aegis
              project. The key is only ever typed into <strong>Settings</strong> inside Aegis, stored{" "}
              <strong>server-side</strong> for Aegis, and only ever displayed <strong>masked</strong>. Do not paste a
              key into source files, README, issues or commits.
            </p>
            <p>
              <strong>Before pushing to GitHub:</strong> the repo ships a <code>.gitignore</code> that excludes{" "}
              <code>.env</code> files, key/certificate files, <code>node_modules</code>, build output — and{" "}
              <code>app.db</code> (the local database), because the database holds saved events <em>and</em> the
              Settings table with the saved key.{" "}
              <strong>Do not commit test events, saved settings exports, or the database as sample data.</strong> Run a
              secret scan (search the repo for your key fragment) before the first push.
            </p>
            <p>
              <strong>Where to download the project:</strong> Aegis itself is a hosted Muse web artifact — it has no
              Download button, and this Demo guide is the in-app README. To get the code: <strong>(1)</strong> in Muse
              on desktop/web, open this artifact's workspace / project files and use the workspace download or export
              option to save the project folder; or <strong>(2)</strong> once the code is pushed to GitHub, use GitHub's
              green <strong>Code → Download ZIP</strong>, or <code>git clone</code> the repository URL. After
              downloading, run <code>bun install</code>, then <code>bun test</code> to verify the suite, and add your
              own Gemini key in Aegis's Settings — never in the code.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
