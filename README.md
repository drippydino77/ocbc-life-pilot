# 🌟 Lumi — OCBC Autonomous Financial Companion

> An AI-powered financial companion that understands your money **and** your relationship with it.

## What is Lumi?

Lumi is a proactive financial chatbot built for the OCBC hackathon. Unlike traditional banking FAQs, Lumi:

- **Understands your emotions** around money (not just your numbers)
- **Remembers everything** — your goals, habits, preferences, and patterns
- **Takes action** — can create goals, record transactions, and give personalized advice
- **Proactively nudges** — detects spending patterns and alerts you before problems escalate

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   main.py (CLI)                 │
├─────────────────────────────────────────────────┤
│                  agent.py (LangGraph)           │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │   Personality │  │   Memory System          │ │
│  │   (prompts)   │  │  ├─ Conversation (SQLite)│ │
│  │              │  │  ├─ User Profile (JSON)   │ │
│  │              │  │  └─ Behavioral (Analysis) │ │
│  └──────────────┘  └──────────────────────────┘ │
│  ┌──────────────────────────────────────────────┐│
│  │              Tool Calling                     ││
│  │  Read: get_goals, get_balance, get_recent_…  ││
│  │  Write: create_goal, modify_goal, update_…   ││
│  └──────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Activate your venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# Set your OpenRouter API key (already configured in .env)
# OPENROUTER_API_KEY=sk-or-...
# OPENROUTER_MODEL=xiaomi/mimo-v2-pro

# 4. Run Lumi
python main.py
```

## Project Structure

```
OCBC chatbot/
├── main.py              # CLI entry point
├── agent.py             # LangGraph agent with tool calling
├── personality.py       # Lumi's identity and system prompt
├── memory/
│   ├── conversation.py  # Persistent conversation memory (SQLite)
│   ├── user_profile.py  # User profile memory (JSON)
│   └── behavioral.py    # Behavioral pattern analysis
├── tools/
│   ├── read_tools.py    # get_goals, get_balance, get_recent_transactions
│   └── write_tools.py   # create_goal, modify_goal, update_transactions
├── data/                # Runtime data (auto-created)
│   ├── conversations.db # Conversation history
│   ├── user_profile.json
│   ├── behavioral.json
│   └── transactions.json
├── requirements.txt
├── .env.example
└── README.md
```

## Features

### 🧠 Three-Layer Memory System

| Layer | What it stores | Source |
|-------|---------------|--------|
| **Conversation** | Chat history across sessions | User messages + Lumi responses |
| **User Profile** | Personal data, preferences, goals | Sign-up + extracted from chat |
| **Behavioral** | Spending patterns, trends, alerts | Transaction data analysis |

### 🔧 Tool Calling

Lumi has access to financial tools:

**Read Tools** (fetch data):
- `get_goals()` — List all savings goals with progress
- `get_balance()` — Account balances and net worth
- `get_recent_transactions(days)` — Recent transaction history
- `get_spending_summary(period)` — Category-wise spending breakdown

**Write Tools** (take action — always with user confirmation):
- `create_goal(name, target, deadline)` — Create a new savings goal
- `modify_goal(goal_id, updates)` — Update an existing goal
- `update_transactions(desc, amount, category)` — Record a manual transaction

### 👤 User Profile Extraction

Lumi automatically extracts profile data from conversations:
- Name, age, salary, savings goals
- Communication style (formal/casual)
- Financial anxiety level
- Interests (travel, investing, housing, etc.)

### 📊 Behavioral Analysis

Lumi analyzes spending patterns and generates:
- **Alerts**: Overspending warnings, streak detection, concentration risk
- **Insights**: Top spending categories, savings rate, weekly trends
- **Proactive nudges**: Context-aware suggestions based on patterns

## Chat Commands

| Command | Description |
|---------|-------------|
| `quit` | Exit the chat |
| `profile` | View your current profile |
| `analysis` | See behavioral insights and alerts |
| `reset` | Start a new conversation session |

## What's Implemented vs. Planned

See the checklist below the code for a detailed breakdown.

## Next Steps

1. **Frontend**: Build a chat UI for the OCBC app
2. **API integration**: Connect to real OCBC APIs instead of mock data
3. **Proactive notifications**: Scheduled analysis + push notifications
4. **Multi-channel**: Telegram, WhatsApp, in-app integrations
5. **Advanced NLP**: Replace regex-based extraction with LLM-powered profiling
6. **Self-improvement**: Save learnings to README/notes for continuous improvement

## Built For

- OCBC Hackathon 2026
- Problem: "How can OCBC leverage autonomous, decision-making AI across customer journeys?"
