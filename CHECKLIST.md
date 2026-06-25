# Lumi — Project Checklist

_Last verified: 2026-06-24. Reflects the stateless/client-authoritative architecture._

---

## 1. Core Architecture (Stateless Server)

- [x] Client owns all state — sends `{profile, goals, transactions, preferences, feedback, history}` with every request
- [x] Server persists nothing — pure function `(context + message) → (response + proposed changes)`
- [x] Per-request context flows via `contextvars` (`tools/request_ctx.py`) — propagates into LangGraph executor threads
- [x] LangGraph `StateGraph`: agent → tools → agent loop (`agent.py`)
- [x] OpenRouter integration via OpenAI-compatible `ChatOpenAI` (`agent.py`)
- [x] `should_continue` — routes to tools or END based on `tool_calls` presence
- [x] `ToolNode` wiring for all read + RAG tools
- [x] Single shared compiled graph (built once at import, state-free)
- [x] Guest: localStorage is source of truth; Signed-in: Supabase is source of truth
- [x] Self-heal stale demo data on boot (`main.js`) — relative `daysAgo()` dates

---

## 2. Endpoints (all stateless `POST`)

- [x] `POST /opener {context}` — proactive greeting based on context snapshot
- [x] `POST /chat {message, context}` — SSE token stream; may end with `__ACTION__` array
- [x] `POST /confirm-message {actions, result, context}` — SSE natural confirmation after client executes writes
- [x] `POST /learn {message}` — LLM preference extraction; returns delta (fire-and-forget from client)
- [x] FastAPI serves `frontend/` as static files — single origin, no CORS

---

## 3. Personality & System Prompt

- [x] `build_system_prompt()` in `personality.py` — dynamically injects profile + behavioral summary + preferences
- [x] `__ACTION__` spec in `personality.py` — single source of truth for write action format
- [x] Behavioral summary derived from `context.transactions` per request (never stored)
- [x] Self-guidance injection: `_self_guidance(feedback)` → appended to system prompt when confirm/cancel patterns emerge
- [x] Recent conversation history appended to system prompt (last 10 turns)
- [x] "Call tools SILENTLY. Never narrate 'let me check…'" instruction in prompt

---

## 4. Read Tools (5 total — server-side, read-only)

- [x] `get_goals()` — reads `context.goals` via contextvar (`tools/read_tools.py`)
- [x] `get_balance()` — **mock** account balances (placeholder for future OCBC API)
- [x] `get_recent_transactions(num_days)` — derived from `context.transactions` with date window
- [x] `get_spending_summary(period)` — category breakdown derived from `context.transactions`
- [x] `search_ocbc_info(query)` — RAG over OCBC knowledge base (`tools/rag_tool.py`)

---

## 5. Write Actions (5 total — client-side execution)

All proposed by Lumi as `__ACTION__[...]` JSON array; executed by the browser, not the server:

- [x] `update_transactions {description, amount, category}` — adds expense to client state
- [x] `delete_transaction {description, amount}` — matched by merchant + amount
- [x] `create_goal {name, target_amount, deadline, monthly_contribution}`
- [x] `modify_goal {goal_id, updates}`
- [x] `delete_goal {goal_id, name}`
- [x] Multi-action confirm: one card lists all actions; one confirm runs all sequentially
- [x] `_lumiExecuteClientWrite()` branches for all 5 actions (`frontend/js/lumi.js`)

---

## 6. Self-Improvement Loop

- [x] `_lumiRecordFeedback(actions, outcome)` — increments confirmed/cancelled per tool type on confirm/cancel
- [x] `state.feedback` persisted to localStorage + Supabase `preferences` table
- [x] `_self_guidance(feedback)` in `agent.py` — generates caution text when tool cancelled ≥2× and ≥ confirms
- [x] `recentCancels` array (last 5) — "don't re-propose unless asked again" guidance
- [x] Feedback included in every `context` payload sent to server

---

## 7. Preference Learning

- [x] `POST /learn` endpoint — fire-and-forget from client (never blocks chat reply)
- [x] `preferences_extract.py` — pure LLM extraction returning preference delta dict
- [x] Fields: `communication_style`, `financial_anxiety_level`, `risk_attitude`, `savings_commitment`, `life_notes[]`
- [x] `_lumiMergePreferences(delta)` — client merges delta into existing prefs, persists to localStorage + Supabase
- [x] Preferences injected into system prompt every turn via `_preferences_summary()`

---

## 8. Chat History

- [x] `_lumiHistory` in-memory array (working copy, last 50 turns)
- [x] Guest: persisted to `localStorage` key `lumi_history` (last 50)
- [x] Signed-in: persisted to Supabase `messages` table (role + content, RLS-scoped)
- [x] `_lumiLoadHistory()` — loads from Supabase for signed-in, localStorage for guest on chat open
- [x] `_lumiPersistMsg(role, content)` — writes both localStorage and Supabase (signed-in)
- [x] Last 10 turns sent with each request as `context.history`
- [x] If history exists on open, skip `/opener` greeting

---

## 9. Streaming & UI

- [x] SSE token streaming via `_lumiStreamPost()` — handles `token`, `reset`, `action` events
- [x] Reset signal (`{"reset": True}`) — server emits when tool_call_chunks detected; client discards preamble
- [x] Lazy streaming bubble — created on first visible token, not upfront (avoids empty bubble during tool-call reset)
- [x] `_lumiSafeVisible()` — strips `__ACTION__` marker before rendering
- [x] Three-dot typing indicator shown during wait; hidden when tokens arrive
- [x] Confirm card rendered for `__ACTION__` with per-action list display
- [x] Confirm card shows Lumi confirmation stream after client executes writes

---

## 10. RAG Pipeline

- [x] 8 markdown knowledge base docs in `backend/ocbc_knowledge/` (savings, cards, loans, investments, insurance, digital banking, rewards, promotions)
- [x] TF-IDF vectorization (sklearn, bigrams, sublinear TF) + FAISS `IndexFlatIP`
- [x] Index cached to `backend/data/rag_index/` — rebuilt only when `ocbc_knowledge/` files change
- [x] 109 chunks indexed, ~3343 dimensions, search in <5ms
- [x] No external embedding API — runs fully local

---

## 11. Auth & Persistence (Supabase)

- [x] Supabase Auth (email); all tables RLS-scoped to `auth.uid()`
- [x] Reproducible schema: `supabase/schema.sql` — idempotent, `DROP POLICY IF EXISTS` pattern
- [x] Tables: `profiles`, `goals`, `expenses`, `feed_events`, `messages`, `preferences`
- [x] Indexes on `user_id` for all list-query tables
- [x] Guest fallback: all data in localStorage (`lumi_profile`, `lumi_goals`, `lumi_transactions`, `lumi_history`, `lumi_feedback`)
- [x] `loadLocalDemo()` populates localStorage with relative-date demo data for guests
- [x] Supabase anon key in `frontend/js/config.js` (public by design)

---

## 12. Behavioral Insights

- [x] `behavioral_calc.py` — pure functions over a transactions list (no storage)
- [x] Spending spike detection: >20% over weekly average flags as alert
- [x] Category concentration: >40% in one category flags as alert
- [x] Savings rate estimate from income vs. spend
- [x] `summary_for_prompt()` formats alerts + category breakdown for system prompt injection
- [x] `generateSmartAlerts()` in frontend — rule-based in-app alert badges

---

## 13. Web App (Frontend)

- [x] 5 tabs: Home, Add (expenses + OCR), AI (Insights page), Expenses, Profile
- [x] Lumi chat widget (FAB button → slide-up panel)
- [x] Multi-goal management UI (create/modify/delete/deposit)
- [x] Manual transaction entry + OCR via Tesseract.js
- [x] Proactive smart alert badges on Home/AI tabs
- [x] Onboarding flow for new users
- [x] Page scroll locked (`html,body{overflow:hidden}`); only `.app` phone container scrolls
- [x] No-cache headers on all static files (normal refresh picks up edits)

---

## 14. Not Done (Production / Stretch)

| Feature | Priority | Notes |
|---------|----------|-------|
| Real OCBC API integration | High | `get_balance` is mock; transactions/goals are user-entered |
| OS/browser push notifications | Medium | Alerts are in-app only |
| Deeper self-improvement (reflection, outcome-driven nudges) | Medium | Basic confirm/cancel loop exists |
| Multi-channel (Telegram/WhatsApp) | Low | Web only |
| ML-based anomaly detection | Low | Current detection is rule-based |
| LangGraph human-in-the-loop checkpointing | Low | Currently prompt-enforced only |
