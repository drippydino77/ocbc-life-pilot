# Lumi — OCBC Autonomous Financial Companion

AI-powered financial chatbot for the OCBC Hackathon 2026. Lumi is a proactive financial companion that understands your emotions around money, not just your numbers. The app UI tells users *what* is going on; Lumi tells them *why* and *how* while accounting for the emotional side of financial management.

**Problem statement:** How can OCBC leverage autonomous, decision-making AI across customer journeys to clearly differentiate itself and emerge as the market leader? Focus on seamless integration and personalized financial advice.

## Architecture — stateless, client-authoritative

**The client owns all state; the server is a pure function and persists nothing.**

- The browser sends a `context` snapshot (`profile, goals, transactions, preferences,
  history`) with every request. The agent + read tools work off that — no files, no
  per-session memory. `behavioral` insights are **derived** from the sent transactions.
- **Persistence:** guest → `localStorage`; signed-in → **Supabase** (source of truth).
  The full DB schema is one reproducible file: [`supabase/schema.sql`](supabase/schema.sql)
  (tables: `profiles, goals, expenses, feed_events, messages, preferences`, all RLS-scoped).
- **Writes:** Lumi proposes via an `__ACTION__` marker in the `/chat` stream → the client
  shows a confirm card → on confirm the **client** executes the write (localStorage or
  Supabase) and asks the server to phrase the confirmation from the real result.
- **Learning:** a background `/learn` call extracts financially-relevant preferences and
  the client merges + persists them (never blocks the chat reply).

**Endpoints** (all stateless, `POST`): `/opener` `{context}` → greeting · `/chat`
`{message, context}` → SSE tokens (may end with an `__ACTION__` array) · `/confirm-message`
`{actions, result, context}` → SSE · `/learn` `{message}` → preference delta. FastAPI also
serves `frontend/` as static files.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend language | Python 3.12 |
| Frontend | Vanilla HTML/CSS/JS (no framework), served by FastAPI |
| Server | FastAPI — stateless, SSE streaming, also serves `frontend/` |
| LLM provider | OpenRouter (xiaomi/mimo-v2-pro) via OpenAI-compatible API |
| Agent orchestration | LangGraph (StateGraph: agent ↔ read-tool loop) |
| LLM framework | LangChain (ChatOpenAI, `@tool`, messages) |
| RAG vector search | FAISS (Meta) + scikit-learn TF-IDF (local, no cloud vector DB) |
| Persistence | **Supabase** (signed-in, source of truth) / **localStorage** (guest). Server stores nothing. |
| Auth | Supabase Auth (email); all tables RLS-scoped to `auth.uid()` |
| Behavioral insights | Derived on the fly from the transactions in each request (no storage) |
| Environment config | python-dotenv (`backend/.env`) |
| CLI | `backend/main.py` — a stateless dev client (in-memory context) |

## Project Structure (current)

```
OCBC chatbot/
├── backend/                    # all Python — run uvicorn from repo root
│   ├── server.py               # FastAPI: /opener /chat /confirm-message /learn + serves frontend
│   ├── agent.py                # stateless LangGraph agent (reads request context)
│   ├── personality.py          # Lumi's system prompt + the __ACTION__ spec
│   ├── rag.py                  # RAG pipeline — TF-IDF vectorizer + FAISS index
│   ├── main.py                 # stateless CLI dev client (in-memory context)
│   ├── tools/
│   │   ├── request_ctx.py      # contextvar holding the per-request client state
│   │   ├── read_tools.py       # get_goals, get_recent_transactions, get_spending_summary, get_balance
│   │   ├── rag_tool.py         # search_ocbc_info
│   │   ├── behavioral_calc.py  # pure spending analysis over a transactions list
│   │   └── preferences_extract.py # /learn extraction (pure function)
│   ├── ocbc_knowledge/         # 8 markdown docs — OCBC product info for RAG
│   ├── data/rag_index/         # cached FAISS index (the ONLY server-side data)
│   └── requirements.txt  .env
├── frontend/                   # vanilla web app (served by FastAPI)
│   ├── index.html  css/styles.css  assets/lumi.png
│   └── js/                     # ordered <script> modules (functions are global):
│       config, utils, state, supabase, ui, render, profile, goals, insights, expenses, lumi, main
├── supabase/                   # reproducible DB — schema.sql + setup README
├── CLAUDE.md  README.md
└── venv/                       # Windows virtualenv
```

> No `memory/`, `write_tools.py`, `goals_store.py`, or SQLite — removed in the stateless
> refactor. The server keeps no per-user data; everything lives client-side / in Supabase.

## Monorepo Layout

The project is split into `backend/` (Python: agent + FastAPI server) and `frontend/`
(the vanilla web app). The FastAPI server serves the frontend as static files, so a
**single `uvicorn` command runs the whole app** at `http://localhost:8000` — one origin,
no CORS. Server-side data paths (the RAG index) are anchored to `backend/` via `__file__`,
so it runs correctly from any working directory. See the tree in **Project Structure** above.

## Development

Run the full app (API + web UI on one origin, no CORS):

```bash
cd "C:\Users\dripp\Documents\OCBC chatbot"
venv\Scripts\activate
pip install -r backend\requirements.txt
uvicorn server:app --app-dir backend --port 8000
# open http://localhost:8000
```

CLI-only chat (no web UI):

```bash
cd "C:\Users\dripp\Documents\OCBC chatbot\backend"
python main.py
```

### WSL (Linux) setup

The original `venv/` is Windows-only. On WSL, install globally:

```bash
pip install --break-system-packages -r backend/requirements.txt
uvicorn server:app --app-dir backend --port 8000
```

### Environment Variables

`.env` file (already configured):

```
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=xiaomi/mimo-v2-pro
```

The `SUPABASE_URL` / `SUPABASE_ANON_KEY` for the browser live in `frontend/js/config.js`
(the anon key is public by design). The RAG index is auto-built/cached in `backend/data/rag_index/`;
no other server-side data files exist.

## How It Works

### Request Flow (chat)

```
Browser builds context = {profile, goals, transactions, preferences, history}
  │  (from localStorage for guests, or loaded from Supabase for signed-in)
  ▼
POST /chat {message, context}  →  stateless server
  ├── 1. set the request-context contextvar from the payload
  ├── 2. build system prompt: personality + profile + DERIVED behavioral
  │      summary (from context.transactions) + preferences + recent history
  ├── 3. LangGraph agent_node → OpenRouter with the 5 read tools bound
  ├── 4. read tools read the contextvar (NOT files); loop until final answer
  └── 5. stream tokens back as SSE
  ▼
Client renders tokens. If the reply ends with an __ACTION__ marker → confirm card.
In parallel, POST /learn {message} (fire-and-forget) extracts preference deltas.
```

### State & memory (no server storage)

The server is a pure function — it keeps **nothing** between requests. "Memory" is the
client's state, sent with each request and persisted client-side:

| Data | Guest | Signed-in |
|------|-------|-----------|
| profile, goals, transactions | `localStorage` | Supabase (`profiles`, `goals`, `expenses`) |
| chat history | `localStorage` (`lumi_history`) | Supabase `messages` |
| learned preferences | `localStorage` | Supabase `preferences` |
| behavioral insights | **derived** from transactions each request (never stored) |

Preferences are learned via a background `/learn` call (LLM extraction → delta → client
merges + persists). See [`supabase/schema.sql`](supabase/schema.sql) for the full DB.

### Tools

**Read tools (5)** — registered LangChain `@tool`s the model calls during `/chat`; they read
the request context and have no side effects:
- `get_goals()` — goals from `context.goals`
- `get_recent_transactions(num_days)` — transactions in window from `context.transactions`
- `get_spending_summary(period)` — category breakdown (derived)
- `get_balance()` — **mock** account balances (not yet wired to real data)
- `search_ocbc_info(query)` — RAG over the OCBC knowledge base

**Write actions (5)** — NOT tools. Lumi proposes them as an `__ACTION__` JSON **array** at the
end of a reply; the client shows one confirm card and **executes them itself** (localStorage /
Supabase), then `/confirm-message` streams Lumi's confirmation from the real result:
- `update_transactions {description, amount, category}`
- `delete_transaction {description, amount}` — matched by merchant + amount
- `create_goal {name, target_amount, deadline, monthly_contribution}`
- `modify_goal {goal_id, updates}`
- `delete_goal {goal_id, name}`

One confirm runs every action in the array (e.g. "I bought the Pi — delete the goal and log it").

### RAG System

- 8 markdown documents covering all OCBC products (savings, cards, loans, investments, insurance, digital banking, rewards, promotions)
- TF-IDF vectorization (scikit-learn) + FAISS inner-product similarity search
- No external API needed for embeddings — runs fully local
- 109 chunks indexed, ~3343 dimensions, search in <5ms
- Cached to `data/rag_index/` — rebuilt only if `ocbc_knowledge/` files change

## Key Architectural Decisions

- **Client-authoritative, stateless server:** the browser owns all state and sends it with each
  request; the server persists nothing. This kills the dual-store desync bug class, gives true
  per-user isolation, and makes the server restart-safe and trivially scalable.
- **Writes execute on the client, not the server:** Lumi *proposes* via `__ACTION__`; the client
  executes (localStorage / Supabase) and already knows the real result — so the post-write
  confirmation message can't hallucinate, and there's no server-side write path to secure.
- **Behavioral insights are derived, not stored:** they're a pure function of the transactions in
  the request, so there's nothing to persist or keep in sync.
- **LangGraph for the read-tool loop:** agent → tools → agent until a final answer. Streaming uses
  `graph.astream(stream_mode="messages")`; per-request data flows through a `contextvar` so it
  propagates into the executor threads LangGraph uses.
- **Preference learning is fire-and-forget (`/learn`):** a separate endpoint, called in the
  background, so the (slow) extraction LLM call never delays the chat reply.
- **TF-IDF over neural embeddings:** scikit-learn TF-IDF + FAISS — free, <5ms, no external API.
  Good enough for 8 structured docs; upgradeable later.
- **`get_balance` is still mock:** the only read tool not backed by real data — placeholder for a
  future OCBC API integration.

## Development Workflow

All feature work MUST follow this workflow. Do NOT skip phases or proceed without required approvals.

**State is persisted in `.dev-workflows/`** so the AI can resume across conversations:

```
.dev-workflows/
  active/{feature-slug}/    — in-progress features
    01-plan.md              — approved plan (scope, user flows, AI workflows)
    02-tasks.md             — task breakdown with status per task
    03-tests.md             — test files and eval criteria per task
    04-review.md            — review notes, divergences, follow-ups
    status.json             — current phase, progress metadata
  completed/{feature-slug}/ — finished features (moved here after review)
  prototypes/{feature-slug}.html — interactive HTML prototypes for flow/UI validation
```

**Phases (each has a slash command):**

1. **`/feature`** — Define feature scope, user flows, AI workflows. **Requires explicit user approval before proceeding.** Creates the workflow folder and `01-plan.md`. Optionally generates an interactive HTML prototype in `.dev-workflows/prototypes/` for the user to validate flows and UI layout in-browser.
2. **`/tasks`** — Break approved plan into tasks, write tests per task. Writes `02-tasks.md` and `03-tests.md`.
3. **`/implement`** — Implement tasks in order, run tests after each. Updates `status.json` progress. Resumes from where it left off if re-entered.
4. **`/review`** — Sanity check against plan, run full test suite, write `04-review.md`. Moves folder to `completed/`.

**Rules:**
- Each command checks `status.json` for prerequisites before starting.
- The plan (Phase 1) MUST be approved by the user before any other phase begins.
- Never skip a phase. Never proceed without the required gate (approval/confirmation).

### Making Changes (paths are under `backend/` and `frontend/`)

1. **Lumi's personality / the `__ACTION__` spec** → `backend/personality.py`
2. **Add/modify a read tool** → `backend/tools/read_tools.py` (add `@tool`, register in `READ_TOOLS`); reads `request_ctx`
3. **Add a write action** → add the spec to `personality.py` AND an executor branch in
   `_lumiExecuteClientWrite` (`frontend/js/lumi.js`); the server never executes writes
4. **Add OCBC product info** → edit markdown in `backend/ocbc_knowledge/`, delete `backend/data/rag_index/` to rebuild
5. **Change agent flow** → graph wiring in `backend/agent.py`
6. **Tune behavioral insights** → `backend/tools/behavioral_calc.py` (pure functions over transactions)
7. **Tune preference learning** → `backend/tools/preferences_extract.py`
8. **DB schema** → edit `supabase/schema.sql` (keep idempotent) and re-run it

### Testing

```bash
# Backend imports cleanly (run from repo root)
venv\Scripts\python.exe -c "import sys; sys.path.insert(0,'backend'); import server; print('OK')"

# End-to-end: start the app, then hit the stateless endpoints
uvicorn server:app --app-dir backend --port 8000
#   POST /opener {context}              → greeting
#   POST /chat   {message, context}     → SSE tokens (+ __ACTION__ for writes)
#   POST /confirm-message {actions,...} → SSE confirmation
#   POST /learn  {message}              → {learned: delta}

# Frontend: open http://localhost:8000, "Continue as Guest", chat with the 🌸 widget.
```

### Common Pitfalls

- **FAISS index cache:** after editing `backend/ocbc_knowledge/*.md`, delete `backend/data/rag_index/` to force a rebuild.
- **Date windows:** read tools / behavioral use 7d & 30d windows. Transactions dated outside them won't show as "recent" — by design (the demo data self-heals stale dates in `main.js`).
- **OpenRouter latency:** first call ~25s cold, then ~10s. `/learn` is intentionally fire-and-forget so it never blocks the reply.
- **Browser cache:** the server sends `no-cache` headers so a normal refresh picks up frontend edits — no hard-refresh needed.
- **Stateless contract:** never add server-side persistence. New user data → add it to the `context` the client sends and persist it client-side (localStorage / Supabase).

## Coding Conventions

- Python 3.12 backend, no type checking enforced (no mypy)
- LangChain `@tool` for read tools; writes are client-executed `__ACTION__` actions
- Per-request data flows via a `contextvar` (`tools/request_ctx.py`), never globals or files
- Frontend is vanilla JS split into `frontend/js/*.js` modules loaded as ordered `<script>` tags (functions are global)
- System prompt lives in `personality.py` — single source of truth for agent behavior
- DB schema lives in `supabase/schema.sql` — single source of truth, idempotent
- Knowledge base is plain markdown — easy for non-technical contributors to edit

## Feature Status

**Done (MVP):**
- ✅ Web app (FastAPI + vanilla JS) — Home / Add / AI / Insights / Profile + Lumi chat widget
- ✅ Proactive companion — data-driven opener + in-app smart alerts
- ✅ Multi-goal management — create / modify / delete / deposit, **chained multi-action confirms**
- ✅ Transactions — manual + OCR (Tesseract) + Lumi-recorded
- ✅ RAG over OCBC products (8 docs, TF-IDF + FAISS)
- ✅ Auth + cloud sync — Supabase, RLS, reproducible `schema.sql`
- ✅ LLM preference learning + emotional state (anxiety) tracked across sessions
- ✅ Rule-based spending anomaly flags (spikes, category concentration, low savings rate)
- ✅ Basic self-improvement — Lumi tunes how cautiously it proposes actions from the
  user's confirm/cancel history (`feedback` in context → `_self_guidance` → prompt)

**Not done (production / stretch):**

| Feature | Priority | Notes |
|---------|----------|-------|
| Real OCBC API integration | High | `get_balance` is mock; transactions/goals are user-entered, not pulled from a bank |
| OS / browser push notifications | Medium | Alerts are currently in-app only |
| Deeper self-improvement (reflection, outcome-driven nudges) | Medium | A basic confirm/cancel feedback loop exists; richer self-critique is future work |
| Multi-channel (Telegram / WhatsApp) | Low | Web only |
| ML-based anomaly detection | Low | Current detection is rule-based |
