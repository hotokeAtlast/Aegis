# Aegis — Demo script (3 minutes)

Also available in Aegis in-app under **Demo guide & README**, with live
self-checks.

**Case:** 300-guest wedding, Hyderabad, budget ₹12,00,000 – ₹20,00,000,
mixed food 60% veg / 40% non-veg, desserts and dry fruits yes, huge parking
yes (≈75 cars expected).

- **Minute 1 — Wizard.** Type any name (no login), start a new event.
  Budget step: live per-guest range ₹4,000 – ₹6,667. Food step: 330 planned
  guests (300 + 10% buffer) = 198 veg + 132 non-veg plates.
- **Minute 2 — Generate & customise.** Generate with AI (requires a Gemini
  key added in Settings) or use the template fallback. In Food, toggle Dry
  Fruits off — totals update instantly in code. In Budget, sliders cannot
  push the total past the maximum.
- **Minute 3 — Audit → Versions → Summary.** First plan flags
  VENUE_TOO_SMALL and PARKING_SHORTFALL (Hyderabad Grand Hall: 280 capacity,
  52 spaces). Apply the fix (Lakeview Gardens), confirm the venue, raise the
  coordinator from 1 to 2. Result: **total ₹15,72,600, remaining ₹4,27,400,
  ₹5,242 per guest, health 100/100**. Compare v1 vs the fixed version in
  Versions, restore v1 and watch Audit re-flag it, then open the printable
  one-page Summary (copy-as-text / download).

Note: live AI generation requires the user's own Gemini key (Settings).
Without a key, the demo runs on the template plan with identical audit and
recalculation behaviour.

**Before submitting:** run `bun test` in the project root (62 tests:
budget, food, manpower, all 12 audit rules, snapshot compare/restore,
field-limit alignment, WCAG contrast in both schemes). No API key is in
the code — the key lives only in Settings, stored server-side and masked;
the repo's `.gitignore` excludes `.env` files and `app.db` (which holds
saved settings), and test events must not be committed as sample data.
Download the code from the Muse workspace export, or from GitHub via
Code → Download ZIP / `git clone` once pushed.
