// App state + goal mirror helpers

let authMode = "signup";
let state = { profile:null, tx:[], feed:[] };
function goalProgressPct(){
  const current = Number(state.profile?.goalCurrent || 0);
  const target = Number(state.profile?.goalTarget || 1500);
  if(!target) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

// ── Multi-goal helpers ─────────────────────────────────────────────
// state.goals is the source of truth. state.profile.goal/goalCurrent/goalTarget
// is a derived MIRROR of the primary (first) goal, so Home / Autopilot / Profile
// and smart alerts keep working unchanged.
function ensureGoals(){
  if(!Array.isArray(state.goals)) state.goals = [];
  return state.goals;
}
function syncPrimaryGoal(){
  ensureGoals();
  const g = state.goals[0];
  if(g){
    state.profile.goal = g.name;
    state.profile.goalCurrent = Number(g.current_amount || 0);
    state.profile.goalTarget = Number(g.target_amount || 0);
    state.profile.deadline = g.deadline || null;
  } else {
    state.profile.goal = "Savings Goal";
    state.profile.goalCurrent = 0;
    state.profile.goalTarget = 0;
    state.profile.deadline = null;
  }
}
function newGoalId(){
  return "g_" + Math.random().toString(36).slice(2, 10);
}
function saveLocal(){localStorage.setItem("lifepilot_supabase_cache", JSON.stringify(state))}

// Structured activity log — merges with transactions in the home timeline.
// state.events = [{ts, type, icon, color, label, detail, amount?}]
function logEvent(type, icon, color, label, detail, amount){
  if(!Array.isArray(state.events)) state.events = [];
  const ev = { ts: Date.now(), type, icon, color, label: label||"", detail: detail||"" };
  if(amount !== undefined) ev.amount = amount;
  state.events.unshift(ev);
  state.events = state.events.slice(0, 50);
  saveLocal();
}
function totalDepositsMonth(){
  const cutoff = new Date(); cutoff.setDate(1); cutoff.setHours(0,0,0,0);
  const c = cutoff.getTime();
  return (state.deposits||[])
    .filter(d => d.ts >= c)
    .reduce((a, d) => a + Number(d.amount||0), 0);
}
function total(){return (state.tx||[]).reduce((a,b)=>a+Number(b.amount||0),0)}
function totalMonth(){
  const cutoff = new Date(); cutoff.setDate(1);
  const c = cutoff.toISOString().slice(0,10);
  return (state.tx||[]).filter(t=>(t.date||"")>=c).reduce((a,b)=>a+Number(b.amount||0),0);
}
function totalWeek(){
  const c = new Date(Date.now()-7*864e5).toISOString().slice(0,10);
  return (state.tx||[]).filter(t=>(t.date||"")>=c).reduce((a,b)=>a+Number(b.amount||0),0);
}
