# Lumi — MVP Status

_Last verified: 2026-06-24_

## Feature Status Table

| Feature | Status | Evidence |
|---|---|---|
| **Web UI (FastAPI + vanilla JS)** | ✅ Done | Full FastAPI server + web app (Home/Add/AI/Insights/Profile tabs, Lumi chat widget). |
| **LLM-based profile extraction** | ✅ Done (reframed) | Regex extraction is gone. `/learn` does LLM-based **preference** extraction (anxiety, risk, savings habits, life notes). Profile itself comes from signup. |
| **Emotional state tracking across sessions** | ✅ Basic done | `financial_anxiety_level` is a learned preference persisted to the `preferences` table (signed-in) / localStorage (guest), carries across sessions. |
| **Spending anomaly detection** | 🟡 Basic done | `behavioral_calc.py` flags spending spikes (>20% over weekly avg), category concentration (>40%), and low savings rate. Rule-based, not ML. |
| **Proactive push notifications** | 🟡 In-app only | `generateSmartAlerts` + AI feed + Lumi's proactive `/opener` all exist — but **in-app only**, not OS/browser push notifications. |
| **Real OCBC API integration** | ❌ Not done | `get_balance` is still mock; transactions/goals are user-entered, not pulled from OCBC. (Expected — no real API access in hackathon.) |
| **Self-improvement loop** | ✅ Basic done | Confirm/cancel feedback loop: `_lumiRecordFeedback()` → `state.feedback` → `_self_guidance()` injects caution into system prompt when patterns emerge. |
| **Multi-channel (Telegram/WhatsApp)** | ❌ Not done | Web only. |

## Verdict on the Core MVP

**The core MVP is implemented.** The original pitch was "a proactive financial companion that understands your emotions, tells you *why/how*, personalized." All of that is live:

- ✅ **Proactive** — opener + smart alerts driven by real data
- ✅ **Emotional** — anxiety tracking + the personality is prompted to acknowledge feelings
- ✅ **Personalized** — uses profile, multi-goal, transactions, learned preferences
- ✅ **Goals** — full multi-goal CRUD (create/modify/delete/deposit, chained actions)
- ✅ **Transactions** — manual + OCR (Tesseract) + Lumi-recorded
- ✅ **OCBC product knowledge** — RAG over 8 docs (TF-IDF + FAISS)
- ✅ **Auth + cloud sync** — Supabase, RLS, reproducible schema

## What's Left for Production

| Feature | Priority | Notes |
|---------|----------|-------|
| Real OCBC API integration | High | `get_balance` is mock; transactions/goals are user-entered |
| OS/browser push notifications | Medium | Alerts are in-app only |
| Deeper self-improvement (reflection, outcome-driven nudges) | Medium | Basic confirm/cancel loop exists; richer self-critique is future work |
| Multi-channel (Telegram/WhatsApp) | Low | Web only |
| ML-based anomaly detection | Low | Current detection is rule-based |
