# Session Handoff

**Project:** Lumi — OCBC Hackathon 2026 AI Financial Companion  
**App URL:** http://localhost:8000  
**Run command:** `cd "C:\Users\dripp\Documents\OCBC chatbot" && venv\Scripts\activate && uvicorn server:app --app-dir backend --port 8000`

---

## What Was Built This Session

### AI Page Refactor (completed, via dev workflow)
Replaced the broken two-tab Autopilot/AI Feed structure with a single-scroll AI page:
- **Smart Alerts** — auto-render on page open (no button). Cards have severity border accent (red/orange/green) + severity pill + "Ask Lumi →" button. Sorted high → medium → low.
- **Purchase Check** — fully rewritten. Now checks against *remaining* budget (`allowance − spent − deposits`) instead of gross income. Old logic triggered "Caution" at $32 on a $400 budget (8% gross). New logic is accurate.
- **Recent AI Activity** — cleaned feed, `__DEP__` deposit records filtered out.
- `lumiSendPreset(text)` — opens Lumi chat and auto-sends a preset message (used by "Ask Lumi →" buttons).

### Chart + Insights Fixes
- Bar chart: week mode labels use `day.lbl`, column index uses array index `i` (not `day.d - 1`)
- Bar chart: top border-radius on bars via CSS `.dbar-seg:last-child { border-radius: 3px 3px 0 0 }`
- Bar chart: zero-height segments get minimum 2px so they don't steal the `:last-child` slot
- Bar chart `byDate` building: unknown categories (e.g. `"Groceries"`) now bucket into `"Others"` via `CHART_CATS` set — prevents them silently disappearing from the chart
- Donut chart: `catFilter` catch-all — transactions with unknown/null category go to "Others"
- Metrics: "Safe spend/day" → "Daily budget target" (`allowance / daysInMonth`); "Projected month-end" → "Projected surplus" (`allowance − (tt / max(day,5)) * daysInMonth`)

### Other Fixes
- `_normalizeCat(cat)` in `lumi.js` — maps any LLM category output (`"transport"`, `"Transportation"`, `"TRANSPORT"`) to the exact canonical CATS string before saving via `update_transactions` action
- Send button fades/disables while Lumi is streaming (both opener and chat)
- Bottom padding on all `.page` elements so the Lumi FAB doesn't overlap content (`padding: 22px 20px 120px`)

---

## Known Open Issue

### Transport transaction shows as "Others" in the donut/pie chart
**Status:** Code fix deployed — new transactions will be correct. Existing saved transaction is broken.  
**Root cause:** The user's specific Transport transaction was already saved with a wrong/empty category in localStorage or Supabase. The `catFilter` catch-all correctly routes it to "Others" because `t.category !== "Transport"`.  
**What the fix covers:** `_normalizeCat()` prevents future Lumi-created transactions from having wrong categories. `CHART_CATS` set in bar chart prevents stale bad-category transactions from disappearing silently.  
**What it doesn't fix:** The existing saved transaction. The user needs to delete it and re-add with the correct "Transport" category selected, OR ask Lumi to "delete the transport transaction and re-log it as Transport".

---

## Files Changed This Session

| File | What changed |
|------|-------------|
| `frontend/index.html` | AI section fully rewritten — 3-section layout; metric labels updated ("Daily budget target", "Projected surplus"); `margin-bottom` on AI page subtitle |
| `frontend/js/insights.js` | `runAutopilotCheck()` rewritten with remaining-budget math; `runNotificationEngine()` simplified (home card only, no `#smartAlertList`); bar chart `byDate` uses `CHART_CATS` set; donut `catFilter` catch-all; metrics formula fix; week mode label/index fix |
| `frontend/js/render.js` | Added `renderAiPage()` with alert cards + sorted by severity; cleaned `renderFeed()` (filters `__DEP__`, no raw format); fixed alert sort bug (`0 \|\| 2 === 2` → `key in order`) |
| `frontend/js/ui.js` | Removed `setAiTab()`; `showTab('ai')` calls `renderAiPage()` instead of `runNotificationEngine()` |
| `frontend/js/lumi.js` | Added `lumiSendPreset(text)`; added `_normalizeCat(cat)`; `update_transactions` uses `_normalizeCat(p.category)`; send button disabled during streaming via `_lumiSetSendEnabled()` |
| `frontend/css/styles.css` | `.dbar-seg:last-child` border-radius; `.page` bottom padding 120px; send button `:disabled` opacity; new AI page styles: `.alert-action-card`, `.sev-border-*`, `.alert-severity`, `.sev-*`, `.lumi-preset-btn`, `.ai-clear-card`, `.purchase-verdict-row` |

---

## Dev Workflow State

All workflows: `.dev-workflows/`  
AI page refactor: `.dev-workflows/completed/ai-page-refactor/` — fully complete (plan → tasks → implement → review).  
No active in-progress workflows.

---

## Architecture Reminder (stateless)

The server persists **nothing**. All state lives in the browser:
- Guest → `localStorage`
- Signed-in → Supabase (source of truth)

Every `/chat` request sends the full context (`profile, goals, transactions, preferences, history`). Lumi proposes writes via `__ACTION__` marker → client confirms → client executes → `/confirm-message` for the reply. Never add server-side persistence.

**`context` object sent to server:**  
`{ profile, goals, transactions, preferences, feedback, history }`

**Lumi's write actions** (client-executed, not server):  
`update_transactions`, `delete_transaction`, `create_goal`, `modify_goal`, `delete_goal`

---

## Suggested Next Steps

1. **Fix the user's stale Transport transaction** — either surface a "fix category" UI on transaction cards, or just ask Lumi to handle it
2. **Transaction edit UI** — currently there's no way to edit a saved transaction's category. Adding an edit icon on `.tx` cards in the Add tab would prevent this class of bug for users
3. **Groceries category** — the OCR merchant directory and merchant rule modal both reference "Groceries" as a category, but the expense form and donut chart don't have it as a tracked category. Either add it as a 6th tracked category (requires updating `CATS` in `insights.js` and `CAT_COLORS` in `render.js`) or remove it from the merchant directory to prevent confusion
4. **Home card Smart Alerts** — currently shows top 2 alerts as compact rows; could link "See all →" directly to the AI tab instead of the current "See all alerts" ghost button
