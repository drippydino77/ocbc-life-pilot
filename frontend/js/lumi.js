// Lumi chat widget (SSE streaming + confirm flow)

// Linkify-only for user bubbles — no markdown, just clickable URLs
function _lumiLinkify(text){
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc(text).replace(/https?:\/\/[^\s<"]+/g, url => {
    const display = url.length > 50 ? url.slice(0, 47) + "…" : url;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:underline">${display}</a>`;
  });
}

function _lumiMd(text){
  // Minimal markdown renderer: bold, italic, inline code, links, bullet lists
  const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline = s => {
    // Extract [text](url) links before escaping so URLs aren't mangled
    const links = [];
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, text, url) => {
      links.push({text, url});
      return `\x00LINK${links.length - 1}\x00`;
    });
    s = esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
    // Restore links as clickable anchors
    s = s.replace(/\x00LINK(\d+)\x00/g, (_, i) => {
      const {text, url} = links[i];
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:underline">${esc(text)}</a>`;
    });
    // Linkify bare URLs not already inside an <a>
    s = s.replace(/(?<!href=")https?:\/\/[^\s<"]+/g, url => {
      const display = url.length > 50 ? url.slice(0, 47) + "…" : url;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--blue);text-decoration:underline">${display}</a>`;
    });
    return s;
  };
  const lines = text.split("\n");
  const out = [];
  let inList = false;
  for(const raw of lines){
    const line = raw.trimEnd();
    const bullet = line.match(/^[-*]\s+(.*)/);
    if(bullet){
      if(!inList){ out.push("<ul>"); inList = true; }
      out.push("<li>" + inline(bullet[1]) + "</li>");
    } else {
      if(inList){ out.push("</ul>"); inList = false; }
      out.push(line === "" ? "<br>" : "<p>" + inline(line) + "</p>");
    }
  }
  if(inList) out.push("</ul>");
  return out.join("");
}

let _lumiReady = false;        // opener received, input enabled
let _lumiOpen = false;
let _lumiLoading = false;
let _lumiAccessToken = "";
let _lumiHistory = [];         // [{role:"user"|"assistant", content}] — client-owned chat history
let _lumiPendingImages = [];   // base64 data URLs waiting to be sent with the next message

function _lumiSetInputReady(ready){
  const input = $("lumiInput");
  const btn = input && input.nextElementSibling;
  if(!input) return;
  input.disabled = !ready;
  input.placeholder = ready ? "Ask Lumi anything..." : "Lumi is starting up...";
  if(btn) btn.disabled = !ready;
}

function _lumiSetSendEnabled(enabled){
  const btn = $("lumiInput")?.nextElementSibling;
  if(btn) btn.disabled = !enabled;
}

function _lumiImageAttached(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    _lumiPendingImages = [dataUrl];
    const preview = $("lumiImagePreview");
    if(preview){
      preview.innerHTML = `<img src="${dataUrl}"><span>${file.name}</span><button onclick="_lumiClearImage()" title="Remove">×</button>`;
      preview.classList.remove("hidden");
    }
  };
  reader.readAsDataURL(file);
  input.value = "";  // reset so same file can be re-attached
}

function _lumiClearImage(){
  _lumiPendingImages = [];
  const preview = $("lumiImagePreview");
  if(preview){ preview.innerHTML = ""; preview.classList.add("hidden"); }
}

// The client's state snapshot sent with every request — the server is stateless.
function _lumiContext(){
  const p = state.profile || {};
  return {
    profile: { name:p.name, age:p.age, income:p.income, monthly_budget:p.income, stage:p.stage, risk:p.risk },
    goals: (state.goals||[]).map(g=>({ id:g.id, name:g.name, target_amount:g.target_amount, current_amount:g.current_amount, deadline:g.deadline||null })),
    transactions: (state.tx||[]).map(t=>({ amount:t.amount, category:t.category, merchant:t.merchant, date:t.date })),
    preferences: state.preferences || {},
    feedback: state.feedback || {},
    history: _lumiHistory.slice(-10)
  };
}

// ── Self-improvement: track how Lumi's own proposals fare (confirm vs cancel) ──
// Stored in its own localStorage key so it survives loadFromSupabase rebuilding `state`.
function _lumiLoadFeedback(){
  try{ state.feedback = JSON.parse(localStorage.getItem("lumi_feedback")) || null; }catch(_){ state.feedback = null; }
  if(!state.feedback) state.feedback = { confirmed:{}, cancelled:{}, recentCancels:[] };
}
function _lumiRecordFeedback(actions, outcome){   // outcome: "confirmed" | "cancelled"
  if(!state.feedback) state.feedback = { confirmed:{}, cancelled:{}, recentCancels:[] };
  const bucket = outcome === "cancelled" ? state.feedback.cancelled : state.feedback.confirmed;
  for(const a of actions){
    bucket[a.tool] = (bucket[a.tool] || 0) + 1;
    if(outcome === "cancelled") state.feedback.recentCancels.push({ tool:a.tool, display:a.display || a.tool });
  }
  state.feedback.recentCancels = state.feedback.recentCancels.slice(-5);
  try{ localStorage.setItem("lumi_feedback", JSON.stringify(state.feedback)); }catch(_){}
}

async function _lumiOpenChat(){
  _lumiSetTyping(true);
  _lumiSetInputReady(false);
  try{
    // Capture the JWT so client-side writes can hit Supabase when signed in.
    try{
      const { data:{ session } } = await supabaseClient.auth.getSession();
      if(session?.access_token) _lumiAccessToken = session.access_token;
    } catch(_){}

    _lumiLoadFeedback();
    // Load + render saved history.
    await _lumiLoadHistory();

    // Show a fresh proactive opener if: no history, OR last chat was >24h ago.
    const lastActive = Number(localStorage.getItem("lumi_last_active") || 0);
    const idleMs = Date.now() - lastActive;
    const DAY_MS = 24 * 60 * 60 * 1000;
    if(_lumiHistory.length && idleMs < DAY_MS){
      // Recent returning user — history already rendered, just re-enable input.
      _lumiSetTyping(false);
      _lumiReady = true;
      _lumiSetInputReady(true);
      return;
    }

    const r = await fetch(LUMI_API+"/opener", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ context: _lumiContext() })
    });
    if(!r.ok) throw new Error("Server error "+r.status);
    const data = await r.json();
    _lumiSetTyping(false);
    _lumiAppendBubble("lumi", data.opener);
    _lumiPersistMsg("assistant", data.opener);
    _lumiReady = true;
    _lumiSetInputReady(true);
  } catch(e){
    _lumiSetTyping(false);
    _lumiAppendBubble("lumi", "Hi! I'm Lumi. Make sure the server is running (uvicorn server:app --app-dir backend) then refresh.");
    _lumiReady = true;
    _lumiSetInputReady(true);
    console.error("Lumi server error:", e);
  }
}

// ── SSE helper: POST JSON, read a text/event-stream of {token|result|error|done} ──
async function _lumiStreamPost(url, body, onToken, onResult, onReset){
  const r = await fetch(url, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  if(!r.ok || !r.body) throw new Error("Server error "+r.status);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while(true){
    const {value, done} = await reader.read();
    if(done) break;
    buf += decoder.decode(value, {stream:true});
    let nl;
    while((nl = buf.indexOf("\n\n")) !== -1){
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 2);
      if(!line.startsWith("data:")) continue;
      let payload;
      try{ payload = JSON.parse(line.slice(5).trim()); } catch(_){ continue; }
      if(payload.token !== undefined) onToken(payload.token);
      else if(payload.reset !== undefined && onReset) onReset();
      else if(payload.learned !== undefined) _lumiMergePreferences(payload.learned);
      else if(payload.result !== undefined && onResult) onResult(payload.result);
      else if(payload.error) throw new Error(payload.error);
      else if(payload.done) return;
    }
  }
}

// Fire-and-forget: ask the server what (if anything) to learn from a message,
// then merge it. Runs in the background so it never delays the chat response.
function _lumiLearn(message){
  fetch(LUMI_API+"/learn", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ message })
  }).then(r=>r.json()).then(d=>{ if(d && d.learned) _lumiMergePreferences(d.learned); }).catch(()=>{});
}

// Merge a learned-preference delta into client-owned state and persist it
// (localStorage always; Supabase when signed in). Next request's context carries it.
async function _lumiMergePreferences(delta){
  if(!delta || !Object.keys(delta).length) return;
  state.preferences = state.preferences || {};
  for(const [k, v] of Object.entries(delta)){
    if(k === "life_notes" && Array.isArray(v)){
      const cur = state.preferences.life_notes || [];
      for(const note of v) if(note && !cur.includes(note)) cur.push(note);
      state.preferences.life_notes = cur;
    } else {
      state.preferences[k] = v;
    }
  }
  saveLocal();
  try{
    const uid = (await supabaseClient.auth.getUser()).data?.user?.id;
    if(uid) await supabaseClient.from("preferences").upsert({ user_id:uid, ...state.preferences, updated_at:new Date().toISOString() });
  }catch(e){ console.error("pref sync failed:", e); }
}

// Append a message to client-owned history; persist to localStorage + (signed-in) Supabase.
function _lumiPersistMsg(role, content){
  _lumiHistory.push({ role, content });
  try{
    localStorage.setItem("lumi_history", JSON.stringify(_lumiHistory.slice(-50)));
    localStorage.setItem("lumi_last_active", String(Date.now()));
  }catch(_){}
  supabaseClient.auth.getUser().then(({data})=>{
    const uid = data?.user?.id;
    if(uid) supabaseClient.from("messages").insert({ user_id:uid, role, content }).then(()=>{}, ()=>{});
  }).catch(()=>{});
}

// Load recent history on chat open: Supabase for signed-in, localStorage for guests.
async function _lumiLoadHistory(){
  let uid = null;
  try{ uid = (await supabaseClient.auth.getUser()).data?.user?.id || null; }catch(_){}
  if(uid){
    try{
      const { data } = await supabaseClient.from("messages").select("role,content").eq("user_id", uid).order("created_at", { ascending:true }).limit(20);
      _lumiHistory = (data||[]).map(m=>({ role:m.role, content:m.content }));
    }catch(_){ _lumiHistory = []; }
  } else {
    try{ _lumiHistory = JSON.parse(localStorage.getItem("lumi_history")||"[]"); }catch(_){ _lumiHistory = []; }
  }
  _lumiHistory.forEach(m=> _lumiAppendBubble(m.role === "user" ? "user" : "lumi", m.content));
}

function _lumiNewStreamingBubble(){
  const container = $("lumiMessages");
  const el = document.createElement("div");
  el.className = "lumi-bubble";
  el.innerHTML = '<div class="lumi-av"></div><div class="text"></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el.querySelector(".text");
}

function _lumiScroll(){ const c = $("lumiMessages"); if(c) c.scrollTop = c.scrollHeight; }

// Hide the __ACTION__ marker (and any partial tail of it) while streaming.
function _lumiSafeVisible(full){
  const marker = "__ACTION__";
  const idx = full.indexOf(marker);
  if(idx !== -1) return full.slice(0, idx).trim();
  for(let k = Math.min(marker.length - 1, full.length); k > 0; k--){
    if(full.endsWith(marker.slice(0, k))) return full.slice(0, full.length - k);
  }
  return full;
}

function lumiSendPreset(text){
  if(!_lumiOpen) toggleMascotChat();
  const input = $("lumiInput");
  if(input) input.value = text;
  setTimeout(()=>sendLumiMessage(), _lumiReady ? 100 : 1800);
}

async function sendLumiMessage(){
  if(_lumiLoading || !_lumiReady) return;
  const input = $("lumiInput");
  const msg = (input.value||"").trim();
  if(!msg) return;
  input.value = "";
  const images = _lumiPendingImages.slice();
  _lumiClearImage();
  _lumiAppendBubble("user", msg, images);
  _lumiPersistMsg("user", msg);
  _lumiLearn(msg);              // background: learn prefs without blocking the reply
  _lumiLoading = true;
  _lumiSetSendEnabled(false);
  _lumiSetTyping(true);

  // Bubble is created LAZILY on the first visible token — so while waiting (or
  // during a tool-call preamble) the user only sees the typing dots, never an
  // empty bubble sitting next to them.
  let full = "", bubble = null;
  try{
    await _lumiStreamPost(LUMI_API+"/chat", {message: msg, context: _lumiContext(), images}, (token)=>{
      full += token;
      const vis = _lumiSafeVisible(full);
      if(vis){
        if(!bubble){ _lumiSetTyping(false); bubble = _lumiNewStreamingBubble(); }
        bubble.innerHTML = _lumiMd(vis);
        _lumiScroll();
      }
    }, null, ()=>{
      // tool-call reset: finalize current bubble (keep it visible) and prepare for next stream
      bubble = null;  // stop updating this bubble, but don't remove it from DOM
      full = "";      // clear buffer for the next independent stream
      _lumiSetTyping(true);
    });
    _lumiSetTyping(false);
    bubble = _lumiFinalizeStream(bubble, full);
    const cut = full.indexOf("__ACTION__");
    const visible = cut !== -1 ? full.slice(0, cut).trim() : full.trim();
    if(visible) _lumiPersistMsg("assistant", visible);
  } catch(e){
    _lumiSetTyping(false);
    if(!bubble) bubble = _lumiNewStreamingBubble();
    bubble.innerHTML = _lumiMd("Sorry, I couldn't reach the server. Is uvicorn running?");
    console.error("Lumi chat error:", e);
  }
  _lumiLoading = false;
  _lumiSetSendEnabled(true);
}

// After a stream ends, split off any __ACTION__ marker and show the confirm card.
// Accepts a possibly-null bubble (lazy creation): makes one if there's visible
// text, drops an empty one for a pure-action reply. Returns the final bubble.
function _lumiFinalizeStream(bubble, full){
  const marker = "__ACTION__";
  const idx = full.indexOf(marker);
  const visible = (idx === -1 ? full : full.slice(0, idx)).trim();
  if(visible){
    if(!bubble) bubble = _lumiNewStreamingBubble();
    bubble.innerHTML = _lumiMd(visible);
  } else if(bubble){
    bubble.parentElement.remove();   // empty bubble (pure-action reply) — drop it
    bubble = null;
  }
  if(idx !== -1){
    try{
      const parsed = JSON.parse(full.slice(idx + marker.length).trim());
      const actions = (Array.isArray(parsed) ? parsed : [parsed]).filter(a => a && a.tool);
      if(actions.length) _lumiShowConfirmCard(actions);
    } catch(e){ console.error("Bad __ACTION__ JSON:", e); }
  }
  return bubble;
}

// One card lists every proposed action; one Confirm runs them all.
function _lumiShowConfirmCard(actions){
  const container = $("lumiMessages");
  if(!container) return;
  const card = document.createElement("div");
  card.className = "lumi-confirm-card";
  const items = actions.map(a => `<div class="lumi-confirm-item">• ${a.display || a.tool}</div>`).join("");
  card.innerHTML = `
    ${actions.length > 1 ? '<div class="lumi-confirm-head">Confirm these changes?</div>' : ''}
    <div class="lumi-confirm-text">${items}</div>
    <div class="lumi-confirm-btns">
      <button class="lumi-btn-confirm">Confirm</button>
      <button class="lumi-btn-cancel">Cancel</button>
    </div>`;
  card.querySelector(".lumi-btn-confirm").onclick = async () => {
    card.remove();
    await _lumiConfirmAction(actions);
  };
  card.querySelector(".lumi-btn-cancel").onclick = () => {
    card.remove();
    _lumiRecordFeedback(actions, "cancelled");   // self-improvement signal
    _lumiAppendBubble("lumi", "No worries, cancelled.");
  };
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
}

// On confirm: the CLIENT executes EVERY action (localStorage for guests, Supabase
// when signed in), then asks the stateless server to phrase the confirmation from
// the REAL combined outcome. The server persists nothing and can't hallucinate.
async function _lumiConfirmAction(actions){
  if(_lumiLoading) return;
  _lumiLoading = true;

  _lumiRecordFeedback(actions, "confirmed");   // self-improvement signal
  const results = [];
  for(const a of actions){ results.push(await _lumiExecuteClientWrite(a)); }  // run all, in order
  const ok = results.every(r => r.ok);
  const reason = (results.find(r => !r.ok) || {}).reason || null;
  const result = { ok, reason, count: actions.length };

  _lumiSetTyping(true);
  let full = "", bubble = null;
  try{
    await _lumiStreamPost(LUMI_API+"/confirm-message", {actions, result, context:_lumiContext()}, (token)=>{
      if(!bubble){ _lumiSetTyping(false); bubble = _lumiNewStreamingBubble(); }
      full += token;
      bubble.innerHTML = _lumiMd(full);
      _lumiScroll();
    });
    _lumiSetTyping(false);
    if(bubble) bubble.innerHTML = _lumiMd(full.trim());
    if(full.trim()) _lumiPersistMsg("assistant", full.trim());
  } catch(e){
    _lumiSetTyping(false);
    if(!bubble) bubble = _lumiNewStreamingBubble();
    bubble.innerHTML = _lumiMd(ok ? "Done!" : "That didn't fully save — try again?");
    console.error("Lumi confirm error:", e);
  }
  if(!ok) toast("Couldn't save everything", reason || "Please try again.");
  _lumiLoading = false;
}

// Execute a confirmed write on the client. Guests → localStorage (state); signed-in
// Normalise a category string from the LLM to one of the 6 canonical CATS values.
function _normalizeCat(cat){
  if(!cat) return "Others";
  const c = cat.trim();
  const CATS = ["Food & Dining","Transport","Shopping","Subscriptions","Bills","Others"];
  // Exact match (case-insensitive)
  const exact = CATS.find(x => x.toLowerCase() === c.toLowerCase());
  if(exact) return exact;
  // Fuzzy keyword fallback
  const l = c.toLowerCase();
  if(/food|dine|dining|eat|restaurant|cafe|coffee|meal|hawker|drink|snack/.test(l)) return "Food & Dining";
  if(/transport|travel|ride|taxi|mrt|bus|grab|gojek|commute|train|fare/.test(l)) return "Transport";
  if(/shop|retail|mall|purchase|cloth|apparel|fashion/.test(l)) return "Shopping";
  if(/subscri|membership|stream|netflix|spotify|youtube|disney|gym/.test(l)) return "Subscriptions";
  if(/bill|utilit|telco|electric|water|mobile|phone|internet/.test(l)) return "Bills";
  return "Others";
}

// → Supabase. Returns {ok:true} or {ok:false, reason}. Updates state + UI immediately.
async function _lumiExecuteClientWrite(action){
  const p = action.params || {};

  try{
    if(action.tool === "update_transactions"){
      const tx = { amount:parseFloat(p.amount)||0, category:_normalizeCat(p.category), merchant:p.description||"Unknown", date:new Date().toISOString().slice(0,10), source:"lumi", ts:Date.now() };
      await DB.saveExpense(tx);
      state.tx.unshift(tx);

    } else if(action.tool === "delete_transaction"){
      const desc = (p.description || p.merchant || "").toLowerCase().trim();
      const amt = parseFloat(p.amount);
      if(!desc && isNaN(amt)) throw new Error("need a merchant or amount to identify the transaction");
      const idx = state.tx.findIndex(t =>
        (!desc || (t.merchant||"").toLowerCase().includes(desc)) &&
        (isNaN(amt) || Math.abs(Number(t.amount) - amt) < 0.005)
      );
      if(idx === -1) throw new Error("transaction not found");
      const removed = state.tx[idx];
      await DB.deleteExpense(removed.id);
      logEvent("tx_deleted", "❌", "var(--red)", `Deleted: ${removed.merchant}`, `${money(removed.amount)} · ${removed.category}`);
      state.tx.splice(idx, 1);

    } else if(action.tool === "create_goal"){
      ensureGoals();
      const goal = { id:newGoalId(), name:p.name||"Savings Goal", target_amount:parseFloat(p.target_amount)||0, current_amount:0, deadline:p.deadline||null, status:"on_track" };
      const saved = await DB.saveGoal(goal);
      if(saved) goal.id = saved.id;
      state.goals.push(goal);
      logEvent("goal_created", "🎯", "var(--green)", `Goal created: ${goal.name}`, `Target ${money(goal.target_amount)}`);

    } else if(action.tool === "modify_goal"){
      ensureGoals();
      const u = typeof p.updates === "string" ? JSON.parse(p.updates) : (p.updates || {});
      let g = (p.goal_id && state.goals.find(x=>String(x.id)===String(p.goal_id)))
           || (u.name && state.goals.find(x=>x.name.toLowerCase()===String(u.name).toLowerCase()))
           || state.goals[0];
      if(!g) throw new Error("goal not found");
      const prevAmount = Number(g.current_amount||0);
      if(u.current_amount !== undefined) g.current_amount = u.current_amount;
      if(u.target_amount  !== undefined) g.target_amount  = u.target_amount;
      if(u.name           !== undefined) g.name           = u.name;
      if(u.deadline       !== undefined) g.deadline       = u.deadline;
      const depositAmt = u.current_amount !== undefined ? Number(u.current_amount) - prevAmount : null;
      if(depositAmt !== null && depositAmt > 0){
        await DB.saveDeposit({ goalId:g.id, goalName:g.name, amount:depositAmt });
        logEvent("goal_deposit", "💰", "var(--blue)", `Deposited ${money(depositAmt)} → ${g.name}`, `${money(Number(g.current_amount))} of ${money(Number(g.target_amount||0))} saved`);
      } else {
        logEvent("goal_updated", "✏️", "var(--orange)", `Updated: ${g.name}`, action.display||"");
      }
      const upd = {};
      if(u.current_amount !== undefined) upd.current_amount = u.current_amount;
      if(u.target_amount  !== undefined) upd.target_amount  = u.target_amount;
      if(u.name           !== undefined) upd.name           = u.name;
      if(u.deadline       !== undefined) upd.deadline       = u.deadline;
      await DB.updateGoal(g.id, upd);

    } else if(action.tool === "deposit_goal"){
      ensureGoals();
      const g = (p.goal_id && state.goals.find(x=>String(x.id)===String(p.goal_id)))
             || (p.name && state.goals.find(x=>x.name.toLowerCase()===String(p.name).toLowerCase()));
      if(!g) throw new Error("goal not found");
      const depositAmt = parseFloat(p.amount)||0;
      if(depositAmt <= 0) throw new Error("deposit amount must be positive");
      const newCurrent = Number(g.current_amount||0) + depositAmt;
      g.current_amount = newCurrent;
      await DB.updateGoal(g.id, {current_amount: newCurrent});
      await DB.saveDeposit({ goalId:g.id, goalName:g.name, amount:depositAmt });
      logEvent("goal_deposit", "💰", "var(--blue)", `Deposited ${money(depositAmt)} → ${g.name}`, `${money(newCurrent)} of ${money(Number(g.target_amount||0))} saved`);
      if(Number(g.target_amount||0) > 0 && newCurrent >= Number(g.target_amount||0))
        toast("Goal reached! 🎉", `You hit your target for "${g.name}"!`);

    } else if(action.tool === "delete_goal"){
      ensureGoals();
      const g = (p.goal_id && state.goals.find(x=>String(x.id)===String(p.goal_id)))
             || (p.name && state.goals.find(x=>x.name.toLowerCase()===String(p.name).toLowerCase()));
      if(!g) throw new Error("goal not found");
      await DB.deleteGoal(g.id);
      logEvent("goal_deleted", "🗑️", "var(--muted2)", `Goal deleted: ${g.name}`, `Had ${money(Number(g.current_amount||0))} saved`);
      state.goals = state.goals.filter(x => x.id !== g.id);

    } else if(action.tool === "update_monthly_budget"){
      const newBudget = parseFloat(p.new_budget);
      if(!newBudget || newBudget <= 0) throw new Error("new_budget must be a positive number");
      const old = Number(state.profile.income||0);
      state.profile.income = newBudget;
      logEvent("budget_updated", "💳", "var(--purple)", `Monthly budget updated`, `${money(old)} → ${money(newBudget)}`);
      await syncProfileNow();

    } else {
      throw new Error("unknown action: " + action.tool);
    }
    syncPrimaryGoal();
    saveLocal();
    renderApp();
    return { ok:true };
  } catch(e){
    console.error("Lumi client write failed:", e);
    return { ok:false, reason: e.message || "write failed" };
  }
}

function _lumiAppendBubble(role, text, images){
  const container = $("lumiMessages");
  if(!container) return;
  const el = document.createElement("div");
  if(role === "lumi"){
    el.className = "lumi-bubble";
    el.innerHTML = '<div class="lumi-av"></div><div class="text"></div>';
    el.querySelector(".text").innerHTML = _lumiMd(text);
  } else {
    el.className = "user-bubble";
    let inner = "";
    if(images && images.length){
      inner += images.map(src => `<img src="${src}" style="display:block;max-width:180px;max-height:140px;border-radius:8px;margin-bottom:4px;object-fit:cover">`).join("");
    }
    inner += `<div class="text"></div>`;
    el.innerHTML = inner;
    el.querySelector(".text").innerHTML = _lumiLinkify(text);
  }
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function _lumiSetTyping(on){
  const row = $("lumiTypingRow");
  if(!row) return;
  row.classList.toggle("hidden", !on);
  if(on){
    const m = $("lumiMessages");
    if(m) m.scrollTop = m.scrollHeight;
  }
}
