"""
Lumi FastAPI server — stateless, client-authoritative.

The browser owns all state and sends a `context` snapshot with each request; the
server persists nothing. One shared agent instance.

Routes:
  GET  /health           → {"status": "ok"}
  POST /opener           → {"opener": str}                    (proactive greeting)
  POST /chat             → SSE stream of response tokens
  POST /confirm-message  → SSE stream of a post-write confirmation message

SSE format (text/event-stream), one JSON object per `data:` line:
  {"token": "..."}   — a response token
  {"error": "..."}   — something failed
  {"done": true}     — stream finished

Run with:
  uvicorn server:app --app-dir backend --reload
"""

import os
import asyncio
import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent import LumiAgent

FRONTEND_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

app = FastAPI(title="Lumi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo only
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_cache_static(request, call_next):
    """Stop the browser caching the frontend JS/CSS during development."""
    response = await call_next(request)
    if request.method == "GET":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


# Single shared stateless agent (holds only the compiled graph).
agent = LumiAgent()


# === Request models ===

class OpenerRequest(BaseModel):
    context: dict = {}


class ChatRequest(BaseModel):
    message: str
    context: dict = {}
    images: list = []   # list of base64 data URLs e.g. ["data:image/jpeg;base64,..."]


class ConfirmMessageRequest(BaseModel):
    actions: list = []   # [{tool, display, params}, ...] — one or more
    result: dict = {}    # {"ok": bool, "reason": str?, "count": int}
    context: dict = {}


class LearnRequest(BaseModel):
    message: str = ""


# === Helpers ===

def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj)}\n\n"


# === Routes ===

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/opener")
async def opener(req: OpenerRequest):
    text = await asyncio.to_thread(agent.get_opener, req.context)
    return {"opener": text}


@app.post("/chat")
async def chat(req: ChatRequest):
    async def gen():
        try:
            async for event in agent.achat_stream(req.message, req.context, req.images):
                yield _sse(event)   # {"token": ...} or {"learned": ...}
        except Exception as e:
            yield _sse({"error": str(e)})
        yield _sse({"done": True})

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/learn")
async def learn(req: LearnRequest):
    """Extract a learned-preference delta. The client fires this in the background
    after a message, so chat latency is unaffected."""
    delta = await asyncio.to_thread(agent.learn, req.message)
    return {"learned": delta}


@app.post("/confirm-message")
async def confirm_message(req: ConfirmMessageRequest):
    """Stream Lumi's confirmation AFTER the client already executed the write."""
    async def gen():
        try:
            async for token in agent.aconfirm_message(req.actions, req.result, req.context):
                yield _sse({"token": token})
        except Exception as e:
            yield _sse({"error": str(e)})
        yield _sse({"done": True})

    return StreamingResponse(gen(), media_type="text/event-stream")


# Static frontend (mounted last so API routes win).
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
