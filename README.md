# Aegis — Plan it. Budget it. Audit it.

Aegis is an audit-proof event planning, management and audit platform for
weddings, birthdays and large events with 100s of guests, built for
Challenge 5 of Virtual Prompt Wars. One wrong venue, food or budget call
can ruin a 300-person occasion — Aegis's job is to catch it before you
commit.

The same content is available in Aegis in-app: open **Demo guide & README**
from the entry screen, Home, or any plan.

## What Aegis does

- **Name-only entry.** No login, no password — type your name and you are in.
- **7-step mandatory wizard:** event basics (10–2,000 guests), budget in INR
  with a live per-guest range, venue & parking, food (veg / non-veg / mixed
  split, desserts, fruits, dry fruits), entertainment, people & resources,
  then review & generate.
- **GenAI plan, code-verified totals.** Gemini proposes a structured JSON
  plan; Aegis validates every field, repairs gaps from a template, and
  recalculates every total in code. The AI never owns the numbers.
- **Customise page:** Overview, Budget (editable lines + sliders capped by
  your maximum), Venue (capacity/parking fit scores), Food (menu builder,
  cost per plate × guests + 10% buffer), People (editable roster synced to
  the budget line), Timeline (owners & status).
- **12-rule audit engine** with a plan health score
  (100 − 25 per blocker − 10 per warning − 2 per info). One-click fixes only
  count as resolved after recalculation passes; blockers cannot be dismissed.
- **Plan versions:** every generate / regenerate / save snapshots the full
  plan. Compare two versions side by side; restore creates a new version and
  re-runs all 12 audit rules, so a restore can never hide a problem.
- **Summary:** a printable one-page export for the current plan or any
  version, with copy-as-text and download.
- **Themes:** contrast-safe in light and dark mode. Every notice, banner and
  highlight box (including the wizard's Live per-guest range) pairs its
  background with a readable foreground in both schemes (Milestone 5 fix).

## Architecture (module map)

Structure-only note: the app was split from two large files
(`client/src/App.tsx`, `server/src/actions.ts`) into focused modules with
no behaviour change — same actions, schemas, maths, prompts and strings.
- `client/src/App.tsx` — thin shell: owns all screen/form state, renders one screen at a time.
- `client/src/screens/EntryScreen.tsx` — name-only entry screen.
- `client/src/screens/SettingsScreen.tsx` — Gemini key/model settings, with its query and save/clear mutations.
- `client/src/screens/DemoScreen.tsx` — demo guide, README and live self-checks.
- `client/src/screens/HomeScreen.tsx` — greeting, event list, settings/demo shortcuts.
- `client/src/screens/WizardScreen.tsx` — 7-step wizard, payload normalisation, template/AI create mutations.
- `client/src/plan/PlanScreen.tsx` — plan view: queries, edit sync, regen/restore/save mutations, audit-fix engine, derived totals.
- `client/src/plan/tabs/*.tsx` — one component per plan tab: Overview, Budget, Venue, Food, People, Timeline, Audit, Versions, Summary.
- `client/src/wizard.ts` — wizard state, manpower defaults and the pure per-step validator.
- `client/src/selfchecks.ts` — browser self-checks against the verified demo case.
- `client/src/plan-utils.ts` — pure plan helpers: venue suggestions, snapshot metrics, summary text, manpower-line sync.
- `client/src/types.ts` — event/version/save-payload types derived from the server action contract.
- `client/src/api.ts` — typed RPC client (action types only; no server runtime in the bundle).
- `server/src/actions.ts` — build entry: aggregates the domain action groups, nothing else.
- `server/src/actions-settings.ts` — get/save/clear Gemini settings actions.
- `server/src/actions-events.ts` — template/AI creation, regeneration, reads, customise saves.
- `server/src/actions-versions.ts` — version listing and restore.
- `server/src/actions-checks.ts` — server-side self-checks.
- `server/src/schemas.ts` — all zod request/response schemas and the 422 hardening.
- `server/src/row-mapping.ts` — database row to API event shape (sanitises every stored array).
- `server/src/versioning.ts` — snapshots, metric recalculation, version history.
- `server/src/settings-store.ts` — Gemini key/model persistence and key masking.
- `server/src/template.ts` — deterministic template plan engine.
- `server/src/gemini.ts` — Gemini prompt, API call, response validation, one retry.
- `server/src/wizard-input.ts` — wizard request schema and readable range checks.
- `server/src/planner-core.ts` — the single shared maths module: budget, food, manpower, 12-rule audit, health, snapshot metrics, contrast (also imported by `tests/`).

## AI setup (bring your own key)

1. Open **Settings / API Key** in Aegis.
2. Paste a Gemini API key from Google AI Studio and Save. The key is stored
   server-side for Aegis, only ever shown masked, and can be changed or
   cleared in Settings. No key ships with Aegis.
3. Model: **gemini-3.5-flash-lite**, temperature 0.3, JSON-only output.

Without a key Aegis still works: it says AI is not connected and falls
back to the **template plan** — a deterministic split of the budget midpoint
(Venue 30% • Food 35% • Decor 15% • Entertainment 8% • Photography 5% •
Manpower 5% • Misc 2%), with food = cost per plate × guests + 10% buffer.
Live AI generation requires a user key.

## The 3-minute demo

Case: **300-guest wedding, Hyderabad, ₹12,00,000 – ₹20,00,000, mixed 60%
veg, desserts + dry fruits yes, parking for ≈75 cars.**

1. **Minute 1 — Wizard.** Enter a name, start the event. Budget step shows a
   live per-guest range of ₹4,000 – ₹6,667. Food plans for 330 guests
   (300 + 10% buffer): 198 veg + 132 non-veg plates.
2. **Minute 2 — Generate & customise.** Generate with AI (key required) or
   use the template. Toggle Dry Fruits off in Food and watch the total fall
   instantly — no AI call. Drag a Budget slider: it cannot exceed the max.
3. **Minute 3 — Audit, versions, summary.** The first plan flags
   VENUE_TOO_SMALL + PARKING_SHORTFALL (Hyderabad Grand Hall: 280 capacity,
   52 spaces). Apply the audit fix (Lakeview Gardens), confirm the venue,
   raise the coordinator to 2: **total ₹15,72,600, remaining ₹4,27,400,
   ₹5,242 per guest, health 100/100**. Compare versions, restore v1 and see
   Audit re-flag it, then finish on the printable Summary.

## Tests

Two layers, both against the **same production code** — all planning maths
lives in one shared module, `server/src/planner-core.ts`, imported by the
client, the server actions and the tests, so nothing can drift:

1. **Runnable test suite in `tests/`** (Bun's built-in runner, no extra
   dependencies). From the project root:

   ```bash
   bun install
   bun test        # or: bun run test
   ```

   62 tests, all passing:

   - `tests/budget.test.ts` — total = sum of lines, remaining to maximum
     (negative when over), per-guest cost, zero-guest safety, en-IN INR
     formatting (demo plan: total ₹15,72,600, remaining ₹4,27,400,
     ₹5,242 per guest).
   - `tests/food.test.ts` — 10% guest buffer (300 → 330, rounding up),
     food cost = cost per plate × planned guests, veg/non-veg split
     totalling the planned count at every percentage (60% → 198 + 132).
   - `tests/manpower.test.ts` — roster total = Σ count × cost per person,
     the figure the Manpower budget line syncs to.
   - `tests/audit.test.ts` — all 12 audit rules firing individually, the
     healthy demo plan passing all 12 at health 100, and the health
     formula (100 − 25 blocker − 10 warning − 2 info, floor 0).
   - `tests/versions.test.ts` — snapshot compare diffs and restore
     recalculation: a JSON round-trip reproduces identical metrics, and
     restoring the small-venue snapshot re-flags it at health 65.
   - `tests/field-limits.test.ts` — the shared client/server text-cap
     contract (see Field limits) and capping behaviour.
   - `tests/accessibility.test.ts` — WCAG AA contrast (≥ 4.5:1) for every
     theme surface pair in both light and dark schemes.

2. **Live in-app self-checks** (Demo guide & README screen): the same
   checks executed in the browser and on the server against the demo case,
   shown as pass/fail rows — a failure is displayed, never hidden.

## Accessibility

- Every wizard input, budget amount and slider, food toggle, roster
  count/cost and tab has a visible label associated with its control;
  toggles expose switch/pressed state, audit flags are labelled groups
  (rule, severity, resolved state), and restore uses an alert-dialog
  pattern.
- Fully keyboard-usable in logical order: the plan tab bar implements the
  tab pattern (arrow keys / Home / End, roving tabindex), and every
  interactive element shows a visible `:focus-visible` ring in both
  colour schemes. Motion is disabled under `prefers-reduced-motion`.
- Errors are announced: wizard errors use an assertive live region linked
  to the fields (`aria-describedby`), Generate jumps to the step that
  needs fixing, and save/fix/restore feedback uses polite live regions.
- Contrast: every notice, banner and highlight box (including the wizard's
  Live per-guest range) pairs dark text on light tints in light mode and
  light text on dark tints in dark mode — verified numerically at
  WCAG AA ≥ 4.5:1 for both schemes in `tests/accessibility.test.ts`.

## Field limits (the 422 fix)

One shared limit list, `FIELD_LIMITS` in `server/src/planner-core.ts`,
drives the client inputs' `maxLength`, the payload the client sends, the
client's pre-send validator, and every server action schema — including
the template fallback, which shares the wizard schema. Current caps
(characters): planner name 120, title 200, city 120, area preference 300,
dietary notes 2000, entertainment types 600, manpower role 80 / label 120,
task title 200 / owner 120 / status 40, budget category 40 / label 120 /
note 500, venue name 200, menu course 80 / notes 1000, regenerate
instruction 500, API key 300, model name 80. Over-limit input is caught
before sending with a readable message naming the field, its limit and
its wizard step — never an opaque 422.

## GitHub submission & downloading the project

- **No API key is in the code.** The Gemini key is only ever entered in
  Aegis's Settings screen, stored server-side, and shown masked. Never
  commit a key, and never paste one into source, README or issues.
- The shipped `.gitignore` excludes `.env*`, key/certificate files,
  `node_modules`, build output — and `app.db`, because the local database
  holds saved events **and** the Settings table (including the saved
  key). Do not commit test events or saved-settings exports as sample
  data. Run a secret scan before the first push.
- **Downloading:** Aegis is a hosted Muse web artifact (no in-app
  download button). Get the code from the artifact's workspace/project
  export in Muse, or — once pushed — from GitHub via **Code → Download
  ZIP** or `git clone`. Then `bun install`, `bun test`, and add your own
  key in Settings.

## Deploying on Render

Aegis is a fullstack app, not a static site, so deploy it as a Render
Web Service, not a Static Site. The repo already contains `render.yaml`
(Blueprint: free plan, Singapore) and a `Dockerfile` (Bun).

- **Import:** Render → New → Blueprint → connect this repo. Render
  reads `render.yaml` and creates the service and env vars.
  Set `GEMINI_API_KEY` in the Render dashboard when prompted (it is
  `sync: false` in the yaml, so no key is ever committed); on first
  boot the server seeds it into Settings, where it can be changed or
  cleared in the app. Without a key, Aegis uses its template plan.
- **Free-plan storage caveat:** Render does not support persistent
  disks on the free plan, so the free Blueprint uses `DATABASE_PATH=./app.db`
  on ephemeral storage — saved events and Settings do not survive a
  redeploy or restart. For durable storage, change `plan:` to starter
  (or higher), add a singular `disk:` block (`name: aegis-data`,
  `mountPath: /data`, `sizeGB: 1` — note: `disk:`, not `disks:`), and
  set `DATABASE_PATH=/data/app.db`. That is a paid plan, so it is not
  the default here.
- **How it runs:** `server/standalone.ts` serves the prebuilt client
  in `client/dist` and the same server actions as the Muse app over
  `POST /actions`, with SQLite migrations from `drizzle/` applied on
  boot. The Dockerfile swaps the Muse-only space-sdk dependency for
  `standalone/space-sdk-shim` (a minimal defineAction/z shim, documented
  in that file) inside the image only — the repo's `package.json`
  keeps the real Muse SDK, so the Muse artifact build is unaffected.
- **If you change the client:** rebuild `client/dist` in Muse first,
  then push the new bundle with the source — Render does not rebuild
  the client, because that build needs Muse's SDK tooling.
- **Health check:** `GET /healthz` returns `{"ok":true}`.
- **Keeping it alive on free (cron ping):** Render's free plan spins
  the service down after 15 minutes idle. To keep it awake, point an
  external cron service (e.g. cron-job.org) at
  `GET https://<your-service>.onrender.com/api/keep-alive` every
  10 minutes (`/api/ping` is an alias). It returns
  `{"ok":true,"service":"aegis","timestamp":"...","uptimeSeconds":...}`,
  touches no database and runs no action, so a ping can never mutate
  an event. Note the cost of always-on: a service pinged around the
  clock uses roughly 720 of Render's 750 free instance hours per
  workspace per month, so this only fits if Aegis is your only (or
  main) free service there.

## Milestones

1. Wizard + INR budget engine, template plan.
2. Gemini 3.5 Flash Lite generation (BYO key in Settings), template fallback.
3. Full customise page + 12-rule audit engine with one-click fixes.
4. Plan versions (snapshot / compare / restore) + printable Summary.
5. Contrast-safe themes, polish, live self-checks, demo guide & README.

## Principles

- LLM proposes, code decides: totals, capacities and quantities are always
  recomputed in code.
- Money is integer rupees, formatted `en-IN`; currency is INR only.
- User text is data, never instructions; API keys stay server-side.
