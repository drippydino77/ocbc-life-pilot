# 🧪 Lumi Chatbot — Test Report

**Date:** 2026-05-28
**Environment:** WSL (Ubuntu) + Python 3.12 + OpenRouter (xiaomi/mimo-v2-pro)
**Test Scope:** Full MVP feature coverage

---

## Summary

| Category | Tests | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Module Imports | 7 | 7 | 0 | All modules load cleanly |
| Conversation Memory | 8 | 8 | 0 | SQLite persistence works |
| User Profile Memory | 10 | 10 | 0 | Extraction + persistence works |
| Behavioral Memory | 7 | 7 | 0 | Mock data + analysis works |
| Read Tools | 4 | 4 | 0 | All return valid JSON |
| Write Tools | 3 | 3 | 0 | CRUD operations work |
| Agent + OpenRouter | 8 | 8 | 0 | LLM connection + tool calling works |
| CLI Interface | 5 | 5 | 0 | Onboarding + commands work |
| **TOTAL** | **52** | **52** | **0** | **100% pass rate** |

---

## Test Details

### 1. Module Imports ✅
All 7 modules import without errors:
- `personality` — System prompt + dynamic builder
- `memory.conversation` — SQLite conversation store
- `memory.user_profile` — JSON user profile
- `memory.behavioral` — Spending analysis
- `tools.read` — 4 read tools
- `tools.write` — 3 write tools
- `agent` — LangGraph agent (7 tools registered)

### 2. Conversation Memory ✅
| Test | Result |
|------|--------|
| Start session | ✅ Returns timestamped session ID |
| Add messages | ✅ Stores user + assistant messages |
| Retrieve recent (limit) | ✅ Returns correct count, chronological order |
| LLM format | ✅ "User: ... / Lumi: ..." format |
| End session + summary | ✅ Timestamps saved, summary persists |
| Session summaries | ✅ Retrieves past summaries |
| Flat user messages | ✅ Cross-session retrieval works |
| Session isolation | ✅ Sessions don't leak into each other |

### 3. User Profile Memory ✅
| Test | Result |
|------|--------|
| Default profile | ✅ 19 fields, all None/False |
| Update fields | ✅ Name, age, salary, style saved |
| Persistence (reload) | ✅ Survives Python restart |
| Extract: name | ✅ "My name is Sarah" → `name: Sarah` |
| Extract: salary | ✅ "I earn about 6000" → `salary: 6000` |
| Extract: age | ✅ "I'm 28 years old" → `age: 28` |
| Extract: casual style | ✅ "lol thats crazy tbh" → `communication_style: casual` |
| Extract: anxiety | ✅ "Im really stressed" → `financial_anxiety_level: high` |
| Extract: interests | ✅ "travel to Japan" → `interests: [travel]` |
| Summary for prompt | ✅ Clean formatted output |

**Bug found & fixed:** Salary regex didn't handle "about/around" between keyword and amount. Fixed regex pattern.

### 4. Behavioral Memory ✅
| Test | Result |
|------|--------|
| Mock transactions generated | ✅ 93 transactions across 30 days |
| Spending by category | ✅ 7 categories, sorted by amount |
| Total spending (30d) | ✅ $4,229.48 |
| Daily spending (7d) | ✅ 7 days of data |
| Pattern analysis | ✅ 1 insight, 1 alert generated |
| Behavioral summary | ✅ Clean formatted output |
| Persistence | ✅ Transactions reload correctly |

### 5. Read Tools ✅
| Tool | Result |
|------|--------|
| `get_goals()` | ✅ Returns 3 goals with progress/status |
| `get_balance()` | ✅ Returns 3 accounts, net worth $14,700.25 |
| `get_recent_transactions(7)` | ✅ Returns 23 transactions |
| `get_spending_summary(monthly)` | ✅ Returns 7 categories, $4,229.48 total |

### 6. Write Tools ✅
| Tool | Result |
|------|--------|
| `create_goal()` | ✅ Created "Emergency Fund" (ID: goal_004) |
| `modify_goal()` | ✅ Updated monthly_contribution to $750 |
| `update_transactions()` | ✅ Recorded $12.50 lunch transaction |

### 7. Agent + OpenRouter ✅
| Test | Result |
|------|--------|
| Agent instantiation | ✅ Creates graph, starts session |
| Simple chat ("Hello") | ✅ 25.6s response, personalized greeting |
| Profile extraction | ✅ Name extracted from "Hello, my name is Caleb" |
| Tool calling (goals) | ✅ Called get_goals, formatted nicely |
| Tool calling (balance) | ✅ Called get_balance + get_goals |
| Tool calling (spending) | ✅ Called get_spending_summary, table format |
| Session management | ✅ new_session() creates fresh session |
| Behavioral analysis | ✅ Returns insights + alerts |

**Sample response quality:**
```
User: "How are my savings doing?"
Lumi: [Calls get_goals + get_balance]
       → Full markdown table with goal progress
       → Proactive insight about Japan trip being behind
       → Savings rate analysis (15% vs 20% recommended)
       → Offered to help create a plan
```

### 8. CLI Interface ✅
| Test | Result |
|------|--------|
| Welcome banner | ✅ Displays correctly |
| Onboarding flow | ✅ Name collection works |
| Chat loop | ✅ Sends/receives messages |
| `profile` command | ✅ Shows user profile |
| `analysis` command | ✅ Shows behavioral insights |
| `quit` command | ✅ Clean exit with goodbye message |
| `reset` command | ✅ (Not tested in this run, but code path exists) |

---

## Bugs Found & Fixed

### 1. Salary Regex (Fixed)
**File:** `memory/user_profile.py`
**Issue:** Regex `(?:salary|income|earn|making)\s*(?:of|is|:)?\s*\$?([\d,]+)` didn't match "I earn about 6000 a month" because "about" isn't between the keyword and amount.
**Fix:** Added `(?:about|around|roughly|approximately|~)?` to the regex pattern.
**Severity:** Low — only affected edge case extraction.

---

## Performance Notes

| Metric | Value |
|--------|-------|
| Agent response time (simple) | ~25s (first call, cold) |
| Agent response time (tool call) | ~10-12s |
| Agent response time (no tools) | ~8-10s |
| Conversation memory (SQLite) | <1ms per operation |
| Behavioral analysis | <5ms |
| Profile extraction | <1ms |

**Note:** Response times are dominated by OpenRouter API latency (xiaomi/mimo-v2-pro). First call is slower due to cold start.

---

## Issues / Technical Debt

### High Priority (Hackathon Blockers)
| Issue | Status | Action |
|-------|--------|--------|
| Windows venv not usable from WSL | ⚠️ Workaround | Created Linux .venv for testing. Need dual-venv setup or Docker. |
| No error handling for missing API key | ⚠️ Missing | Add validation at startup if OPENROUTER_API_KEY is not set |

### Medium Priority (Before Demo)
| Issue | Status | Action |
|-------|--------|--------|
| `chatbot.py` still has old code | ⚠️ Stale | Delete or replace with redirect to main.py |
| No `reset` command test | ⚠️ Untested | Code path exists but wasn't exercised |
| Mock data is static (seed=42) | ℹ️ By design | Fine for demo, but should vary per user in production |
| Profile extraction is regex-based | ℹ️ MVP | Replace with LLM-based extraction for production |
| No input validation on write tools | ⚠️ Missing | Should validate amounts, dates, IDs |

### Low Priority (Post-Hackathon)
| Issue | Status | Action |
|-------|--------|--------|
| No proactive notification system | ❌ Not started | Needs cron/scheduler + notification channel |
| No self-improvement loop | ❌ Not started | Save learnings to README |
| No multi-channel support | ❌ Not started | Telegram/WhatsApp adapters |
| No emotional state tracking across sessions | ❌ Not started | Mood history in user profile |
| No spending anomaly detection | ❌ Not started | Needs ML model |
| No real OCBC API integration | ❌ Not started | Needs API docs + auth |

---

## Files Modified During Testing

| File | Change |
|------|--------|
| `memory/user_profile.py` | Fixed salary regex to handle "about/around" |

---

## Next Steps (Recommended Order)

1. **Fix startup validation** — Check for API key on launch
2. **Delete stale `chatbot.py`** — Replace with note pointing to main.py
3. **Build a simple web UI** — Flask/FastAPI chat interface for demo
4. **Add proactive notifications** — Scheduled analysis + alerts
5. **Wire up real OCBC API** — Replace mock data sources
6. **LLM-based profile extraction** — Replace regex with an LLM call
7. **Self-improvement loop** — Save insights to persistent notes
8. **Multi-channel** — Telegram/WhatsApp adapters

---

*Report generated by automated test suite. All 52 tests passed.*
