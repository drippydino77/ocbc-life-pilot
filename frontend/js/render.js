// Home / Profile / Tx / Feed rendering

function renderApp(){
  $("splash").classList.add("hidden"); $("onboarding").classList.add("hidden"); $("main").classList.remove("hidden");
  $("mascotFab").classList.remove("hidden");
  renderHome(); renderProfile(); renderTx(); renderFeed(); renderInsights(); runNotificationEngine(false);
}

const CAT_COLORS = {
  "Food & Dining":"var(--red)", "Transport":"var(--orange)", "Shopping":"var(--yellow)",
  "Subscriptions":"var(--green)", "Bills":"var(--blue)", "Others":"var(--purple)"
};

function renderHome(){
  const month = totalMonth(), deposits = totalDepositsMonth();
  const allowance = Number(state.profile.income||400);
  const remaining = Math.max(0, allowance - month - deposits);
  const usedPct = allowance ? Math.round((month + deposits)/allowance*100) : 0;

  if($("heroName")) $("heroName").textContent = (state.profile.name||"User").split(" ")[0];
  $("homeAllowance").textContent = money(remaining);
  if($("homeMonthSpent")) $("homeMonthSpent").textContent = money(month);
  if($("homeMonthSaved")) $("homeMonthSaved").textContent = money(deposits);

  // Latest activity — merge transactions + goal events, sorted by recency
  const txItems = (state.tx||[]).map(t => ({
    ts: t.ts || new Date((t.date||"")+"T00:00:00").getTime() || 0,
    dot: CAT_COLORS[t.category]||"var(--purple)",
    label: t.merchant,
    meta: `${t.category} · ${t.date||"Today"}`,
    right: `-${money(t.amount)}`
  }));
  const evtItems = (state.events||[]).map(e => ({
    ts: e.ts||0,
    dot: e.color||"var(--muted2)",
    label: e.label,
    meta: e.detail||"",
    right: e.icon||""
  }));
  const merged = [...txItems, ...evtItems].sort((a,b)=>b.ts-a.ts).slice(0,5);
  const timeline = $("latestTimeline");
  if(timeline){
    if(!merged.length){
      timeline.innerHTML = `<p style="color:var(--muted);font-size:14px;padding:4px 0">Scan a receipt or add an expense to track activity.</p>`;
    } else {
      timeline.innerHTML = merged.map((item,i) => `
        <div class="home-tx-row${i<merged.length-1?' home-tx-border':''}">
          <div class="home-tx-dot" style="background:${item.dot}"></div>
          <div class="home-tx-body">
            <span class="home-tx-merchant">${item.label}</span>
            <span class="home-tx-meta">${item.meta}</span>
          </div>
          <span class="home-tx-amount">${item.right}</span>
        </div>`).join("");
    }
  }

  // Goal carousel — all goals, not just the primary mirror
  renderHomeGoals();
}

function renderHomeGoals(){
  const carousel = $("homeGoalsCarousel");
  const dotsEl = $("homeGoalsDots");
  if(!carousel) return;

  const goals = ensureGoals();
  if(!goals.length){
    carousel.innerHTML = `<p style="color:var(--muted);font-size:14px;padding:4px 0">No goals yet — ask Lumi to create one.</p>`;
    if(dotsEl) dotsEl.innerHTML = "";
    return;
  }

  // JS-driven transform carousel — bypasses .app overflow-x:hidden blocking scrollLeft
  let current = 0;
  const track = document.createElement("div");
  track.className = "goals-track";
  track.innerHTML = goals.map(g => {
    const cur = Number(g.current_amount||0), tgt = Number(g.target_amount||0);
    const pct = tgt > 0 ? Math.min(Math.round(cur/tgt*100), 100) : 0;
    const left = Math.max(tgt-cur, 0);
    return `<div class="home-goal-slide">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h4 style="font-size:15px;font-weight:800;margin:0">${g.name}</h4>
        <span style="font-size:12px;color:var(--muted2)">${pct}%</span>
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div style="display:flex;justify-content:space-between;margin-top:8px">
        <small>${money(cur)} saved</small>
        <small>${money(left)} to go</small>
      </div>
    </div>`;
  }).join("");

  carousel.innerHTML = "";
  carousel.appendChild(track);

  function goTo(idx){
    current = Math.max(0, Math.min(idx, goals.length - 1));
    track.style.transform = `translateX(-${current * 100}%)`;
    if(dotsEl) dotsEl.querySelectorAll(".goal-dot").forEach((d,i) => d.classList.toggle("active", i===current));
  }

  if(dotsEl){
    dotsEl.innerHTML = goals.map((_,i) =>
      `<span class="goal-dot${i===0?' active':''}" data-idx="${i}"></span>`).join("");
    dotsEl.querySelectorAll(".goal-dot").forEach(dot => {
      dot.style.cursor = "pointer";
      dot.onclick = () => goTo(Number(dot.dataset.idx));
    });
  }
}

function renderProfile(){
  const p=state.profile||{};
  $("profileName").textContent=p.name||"User";
  $("profileEmail").textContent=(p.email||"user@email.com")+" • synced";
  $("profileEmailRow").textContent=p.email||"user@email.com";
  $("avatar").textContent=(p.name||"U")[0].toUpperCase();
  $("profileDob").textContent=p.dob || "Not set";
  $("profileAge").textContent=p.dob ? calcAge(p.dob) : (p.age||18);
  $("profileStage").textContent=p.stage||"Student";
  $("profileIncome").textContent=money(p.income||400);
  $("profileRisk").textContent=p.risk||"Balanced";
  if($("profileGoal")) $("profileGoal").textContent=p.goal||"Savings Goal";
  if($("profileGoalProgress")) $("profileGoalProgress").textContent=`${money(p.goalCurrent||0)} / ${money(p.goalTarget||1500)}`;
  renderMerchantRules();
}

function renderTx(){
  $("txList").innerHTML=(state.tx||[]).map(x=>`
    <div class="tx"><div class="tx-left"><div class="tx-icon">${iconFor(x.category)}</div><div><b>${x.merchant}</b><small>${x.category} • ${x.date||"Today"}</small></div></div><b>-${money(x.amount)}</b></div>
  `).join("") || "<p>No expenses yet.</p>";
}

function renderFeed(){
  const entries = (state.feed||[]).filter(f=>!String(f[1]||"").startsWith("__DEP__"));
  $("feedList").innerHTML = entries.map(f=>`
    <div class="event"><div class="event-icon">⌁</div><div><small>${f[0]}</small><p>${f[1]}</p></div></div>
  `).join("") || `<p style="color:var(--muted);font-size:14px;padding:4px 0">No AI activity yet. Chat with Lumi to get started.</p>`;
}

function renderAiPage(){
  const alerts = generateSmartAlerts();
  const sevColor = {high:"var(--red)", medium:"var(--orange)", low:"var(--green)"};
  const sevLabel = {high:"High", medium:"Medium", low:"Low"};
  const el = $("aiAlerts");
  if(!el) return;

  if(!alerts.length){
    el.innerHTML=`<div class="ai-clear-card"><span class="ai-clear-icon">✓</span><b>All clear</b><p>No alerts right now — your finances look healthy.</p></div>`;
  } else {
    // Sort: high → medium → low
    const order = {high:0, medium:1, low:2};
    const sorted = [...alerts].sort((a,b)=>{
      const oa = a.severity in order ? order[a.severity] : 2;
      const ob = b.severity in order ? order[b.severity] : 2;
      return oa - ob;
    });
    el.innerHTML = sorted.map((a,i)=>`
      <div class="alert-action-card sev-border-${a.severity}">
        <div class="alert-action-top">
          <span class="alert-action-icon">${a.icon}</span>
          <div class="alert-action-body">
            <div class="alert-action-title-row">
              <b>${a.title}</b>
              <span class="alert-severity sev-${a.severity}">${sevLabel[a.severity]||a.severity}</span>
            </div>
            <p>${a.body}</p>
          </div>
        </div>
        <button class="lumi-preset-btn" data-preset="I got a financial alert: ${a.title}. ${a.body} What should I do?" onclick="lumiSendPreset(this.dataset.preset)">Ask Lumi →</button>
      </div>`).join("");
  }
  renderFeed();
}
