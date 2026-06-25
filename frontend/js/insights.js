// Insights, Save tab, autopilot, alerts

const merchantMap = {
  "guzman y gomez":"Food & Dining", "guzman":"Food & Dining", "gyg":"Food & Dining",
  "mcdonald":"Food & Dining", "macdonald":"Food & Dining", "mcd":"Food & Dining",
  "kfc":"Food & Dining", "subway":"Food & Dining", "burger king":"Food & Dining",
  "jollibee":"Food & Dining", "popeyes":"Food & Dining", "texas chicken":"Food & Dining",
  "five guys":"Food & Dining", "shake shack":"Food & Dining",
  "starbucks":"Food & Dining", "coffee bean":"Food & Dining", "toast box":"Food & Dining",
  "ya kun":"Food & Dining", "yakun":"Food & Dining", "liho":"Food & Dining",
  "koi":"Food & Dining", "boost":"Food & Dining", "mr coconut":"Food & Dining",
  "chicha":"Food & Dining", "gong cha":"Food & Dining", "luckin":"Food & Dining",
  "old chang kee":"Food & Dining", "breadtalk":"Food & Dining", "four leaves":"Food & Dining",
  "paris baguette":"Food & Dining",
  "koufu":"Food & Dining", "kopitiam":"Food & Dining", "food republic":"Food & Dining",
  "encik tan":"Food & Dining", "saizeriya":"Food & Dining", "din tai fung":"Food & Dining",
  "pepper lunch":"Food & Dining", "pastamania":"Food & Dining", "sukiya":"Food & Dining",
  "ajisen":"Food & Dining", "ichiban":"Food & Dining", "monster curry":"Food & Dining",
  "wingstop":"Food & Dining", "collin":"Food & Dining",
  "ntuc":"Groceries", "fairprice":"Groceries", "sheng siong":"Groceries", "giant":"Groceries",
  "cold storage":"Groceries", "don don donki":"Groceries", "donki":"Groceries",
  "7-eleven":"Groceries", "7 eleven":"Groceries", "cheers":"Groceries",
  "grab":"Transport", "gojek":"Transport", "comfortdelgro":"Transport", "comfort":"Transport",
  "tada":"Transport", "ryde":"Transport", "mrt":"Transport", "simplygo":"Transport",
  "ez-link":"Transport", "ezlink":"Transport", "bus":"Transport",
  "shopee":"Shopping", "lazada":"Shopping", "amazon":"Shopping", "qoo10":"Shopping",
  "uniqlo":"Shopping", "cotton on":"Shopping", "zara":"Shopping", "h&m":"Shopping",
  "watsons":"Shopping", "guardian":"Shopping", "popular":"Shopping", "challenger":"Shopping",
  "courts":"Shopping", "ikea":"Shopping", "decathlon":"Shopping",
  "spotify":"Subscriptions", "netflix":"Subscriptions", "youtube":"Subscriptions",
  "disney":"Subscriptions", "icloud":"Subscriptions", "apple":"Subscriptions",
  "google":"Subscriptions", "microsoft":"Subscriptions", "gym":"Subscriptions",
  "anytime fitness":"Subscriptions", "active sg":"Subscriptions",
  "singtel":"Bills", "starhub":"Bills", "m1":"Bills", "circles":"Bills",
  "sp services":"Bills", "utilities":"Bills", "bill":"Bills"
};

function merchantFromText(text){
  const lower = normalizeOCRText(text);
  let best = null;
  for(const key in merchantMap){
    if(lower.includes(key)){
      if(!best || key.length > best.key.length) best = {key, category: merchantMap[key]};
    }
  }
  if(best){
    return {
      merchant: best.key.split(" ").map(w=>w ? w[0].toUpperCase()+w.slice(1) : w).join(" "),
      category: best.category,
      confidence: Math.min(96, 72 + best.key.length)
    };
  }
  return {merchant:"Receipt Upload", category:"Others", confidence:45};
}



function runAutopilotCheck(){
  const merchantRaw = ($("buyMerchant")?.value || "").trim();
  const amount = Number($("buyAmount")?.value || 0);
  if(!amount) return toast("Enter an amount","Type how much the purchase costs.");
  let category = $("buyCategory")?.value || "Others";

  // Auto-detect category from merchant name
  const mLower = merchantRaw.toLowerCase();
  for(const key in merchantMap){
    if(mLower.includes(key)){
      category = merchantMap[key];
      if($("buyCategory")) $("buyCategory").value = category;
      break;
    }
  }

  // Real budget maths — check against what's actually left this month
  const allowance = Number(state.profile?.income || 400);
  const spent = totalMonth();
  const deposits = totalDepositsMonth();
  const remaining = Math.max(0, allowance - spent - deposits);
  const remainingAfter = Math.max(0, remaining - amount);
  const pctOfRemaining = remaining > 0 ? Math.round((amount / remaining) * 100) : 100;

  // Goal delay: how many days does this amount set back the primary goal's monthly contribution?
  const primaryGoal = (state.goals||[]).find(g=>g.id===state.primaryGoalId) || state.goals?.[0];
  let delay = 0;
  if(primaryGoal){
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
    const monthlyContrib = allowance * 0.20; // target 20% savings rate
    delay = monthlyContrib > 0 ? Math.round((amount / monthlyContrib) * daysInMonth) : 0;
  }

  // Category average daily spend this month
  const today2 = new Date();
  const day = today2.getDate();
  const cutoff = `${today2.getFullYear()}-${String(today2.getMonth()+1).padStart(2,"0")}-01`;
  const catSpent = (state.tx||[]).filter(t=>(t.date||"")>=cutoff && t.category===category).reduce((a,t)=>a+Number(t.amount||0),0);
  const catAvgDay = day > 0 ? catSpent / day : 0;

  // Verdict — based on % of remaining budget, not gross income
  let label, severity, msg;
  if(pctOfRemaining <= 15){
    label="Safe to Buy"; severity="low";
    msg=`${money(amount)} is ${pctOfRemaining}% of your remaining budget — well within range.`;
  } else if(pctOfRemaining <= 35){
    label="Caution"; severity="medium";
    msg=`${money(amount)} uses ${pctOfRemaining}% of your remaining budget for this month.`;
  } else {
    label="High Impact"; severity="high";
    msg=`${money(amount)} is ${pctOfRemaining}% of your remaining ${money(remaining)} — this will significantly cut your buffer.`;
  }
  if(remaining === 0){ label="No Budget Left"; severity="high"; msg="You've used your full allowance for this month."; }

  // Render
  $("autopilotResult").classList.remove("hidden");
  $("impactLabel").textContent = label;
  $("impactLabel").className = "";
  $("impactPill").textContent = severity === "high" ? "High Impact" : severity === "medium" ? "Caution" : "Safe";
  $("impactPill").className = `alert-severity sev-${severity}`;
  $("impactText").textContent = msg;
  $("impactRemaining").textContent = money(remaining);
  $("impactAfter").textContent = money(remainingAfter);
  $("impactAllowance").textContent = pctOfRemaining + "% of remaining";
  $("impactDelay").textContent = delay > 0 ? delay + " day" + (delay!==1?"s":"") : "None";

  // Wire "Ask Lumi" button
  const lumiCtx = `I want to buy ${merchantRaw||category} for ${money(amount)} (${category}). My remaining budget this month is ${money(remaining)} and it would use ${pctOfRemaining}% of that. Should I go ahead?`;
  const btn = $("impactLumiBtn");
  if(btn){ btn.onclick = ()=>lumiSendPreset(lumiCtx); }
}

function calcHealthScore(){
  const allowance = Number(state.profile.income||400);
  const tt = totalMonth(), deposits = totalDepositsMonth();

  const today = new Date();
  const day = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const cutoff = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
  const monthTx = (state.tx||[]).filter(t=>(t.date||"")>=cutoff);
  const txCount = monthTx.length;

  // ── 1. Spending Control (30 pts) ────────────────────────────────────
  // Measures spend PACE relative to how far through the month we are.
  // Floor at 5 days so a single day-1 purchase doesn't look catastrophic.
  let spendScore;
  if(!tt){
    spendScore = 30; // nothing spent yet — no penalty
  } else if(!allowance){
    spendScore = 0;
  } else {
    const timeElapsed = Math.max(day, 5) / daysInMonth;
    const pace = (tt / allowance) / timeElapsed; // 1.0 = perfectly on track
    if(pace <= 0.70)       spendScore = 30;
    else if(pace <= 1.00)  spendScore = Math.round(30 - (pace-0.70)/0.30 * 10);
    else if(pace <= 1.30)  spendScore = Math.round(20 - (pace-1.00)/0.30 * 10);
    else if(pace <= 1.70)  spendScore = Math.round(10 - (pace-1.30)/0.40 * 10);
    else                   spendScore = 0;
  }

  // ── 2. Savings Rate (25 pts) ─────────────────────────────────────────
  // Compares actual deposits to where they *should* be by this point in the month.
  // Grace period: first 5 days with zero deposits — too early to penalise.
  let savingsScore;
  if(!allowance){
    savingsScore = 0;
  } else if(day <= 5 && deposits === 0){
    savingsScore = 18; // grace — month just started
  } else {
    const targetByNow = allowance * 0.20 * (day / daysInMonth);
    const paceRatio = deposits / Math.max(targetByNow, 0.01);
    if(paceRatio >= 1.50)       savingsScore = 25;
    else if(paceRatio >= 1.00)  savingsScore = Math.round(20 + (paceRatio-1.00)/0.50 * 5);
    else if(paceRatio >= 0.50)  savingsScore = Math.round(12 + (paceRatio-0.50)/0.50 * 8);
    else if(paceRatio >= 0.20)  savingsScore = Math.round(5  + (paceRatio-0.20)/0.30 * 7);
    else                        savingsScore = Math.round(paceRatio/0.20 * 5);
  }

  // ── 3. Spending Balance (20 pts) ─────────────────────────────────────
  // Concentration penalty scaled by transaction count confidence and day.
  // Hard grace only for the first 5 days — after that, txCount feeds into the
  // confidence blend (fewer tx → pulled toward neutral 0.50) but never gives
  // full marks when concentration is genuinely high.
  let balanceScore;
  if(!tt || day < 5){
    balanceScore = 20;
  } else {
    const catTotals = {};
    monthTx.forEach(t=>catTotals[t.category||"Others"]=(catTotals[t.category||"Others"]||0)+Number(t.amount||0));
    const topCatPct = Math.max(0,...Object.values(catTotals)) / tt;
    // Confidence: ramps from 0 → 1 over first 8 transactions
    const confidence = Math.min(1, txCount / 8);
    // Blend actual concentration toward 0.50 (neutral) when confidence is low
    const effConc = topCatPct * confidence + 0.50 * (1 - confidence);
    if(effConc <= 0.35)       balanceScore = 20;
    else if(effConc <= 0.50)  balanceScore = Math.round(20 - (effConc-0.35)/0.15 * 8);
    else if(effConc <= 0.65)  balanceScore = Math.round(12 - (effConc-0.50)/0.15 * 6);
    else if(effConc <= 0.80)  balanceScore = Math.round(6  - (effConc-0.65)/0.15 * 4);
    else                      balanceScore = Math.round(2  - (effConc-0.80)/0.20 * 2);
    balanceScore = Math.max(0, balanceScore);
  }

  // ── 4. Goal Trajectory (25 pts) ──────────────────────────────────────
  // Grace: first 5 days with no deposits — too early to extrapolate pace.
  // No goals: neutral 15 pts (don't penalise, don't reward).
  // Goals without deadlines: flat 12 pts — saving but can't measure trajectory.
  const goals = ensureGoals();
  let goalScore;
  if(!goals.length){
    goalScore = 15; // neutral
  } else if(day <= 5 && deposits === 0){
    goalScore = 18; // grace — month just started
  } else {
    const projectedMonthly = day > 0 ? (deposits / day) * daysInMonth : deposits;
    const unfinished = goals.filter(g=>Number(g.current_amount||0)<Number(g.target_amount||0)).length || 1;
    const perGoalProjected = projectedMonthly / unfinished;
    let totalGoalPts = 0;
    goals.forEach(g=>{
      const cur=Number(g.current_amount||0), tgt=Number(g.target_amount||0);
      if(!tgt){ totalGoalPts+=12; return; }           // no target amount
      if(cur>=tgt){ totalGoalPts+=25; return; }        // already complete
      const remaining=tgt-cur;
      if(g.deadline){
        const mLeft=Math.max(0.5,(new Date(g.deadline)-Date.now())/(30*24*60*60*1000));
        const need=remaining/mLeft;
        const ratio=perGoalProjected/need;
        if(ratio >= 1.00)       totalGoalPts+=25;
        else if(ratio >= 0.70)  totalGoalPts+=Math.round(18+(ratio-0.70)/0.30*7);
        else if(ratio >= 0.40)  totalGoalPts+=Math.round(10+(ratio-0.40)/0.30*8);
        else if(ratio >= 0.10)  totalGoalPts+=Math.round(3 +(ratio-0.10)/0.30*7);
        else                    totalGoalPts+=3;
      } else {
        totalGoalPts += cur > 0 ? 12 : 8; // saving but no deadline to track against
      }
    });
    goalScore = Math.round(totalGoalPts / goals.length);
  }

  const score = spendScore+savingsScore+balanceScore+goalScore;
  return {score, spendScore, savingsScore, balanceScore, goalScore};
}

let insightPeriod='month'; // 'month' | 'week'
function setInsightPeriod(value){
  insightPeriod=value==='This Week'?'week':'month';
  renderInsights();
}

function renderInsights(){
  const cats=["Food & Dining","Transport","Shopping","Subscriptions","Bills","Others"];
  const colors=["var(--red)","var(--orange)","var(--yellow)","var(--green)","var(--blue)","var(--purple)"];

  const tt=totalMonth(), deposits=totalDepositsMonth();
  const allowance=Number(state.profile.income||400);
  const allocated=tt+deposits, remaining=Math.max(0,allowance-allocated);
  const usedPct=allowance?Math.min(100,Math.round(allocated/allowance*100)):0;

  const today=new Date(), day=today.getDate();
  const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
  const daysLeft=Math.max(1,daysInMonth-day);
  const daily=day?tt/day:tt;
  // Use max(day,5) floor so day-1 projections aren't inflated by one big purchase
  const projectedSpend=(tt/Math.max(day,5))*daysInMonth;
  const surplus=allowance-projectedSpend; // positive = under budget, negative = over
  const dailyTarget=allowance/daysInMonth; // constant target pace for the whole month

  // Month-scoped totals — used by health score factor cards (always monthly)
  const cutoff=new Date(); cutoff.setDate(1); const c=cutoff.toISOString().slice(0,10);
  const monthTx=(state.tx||[]).filter(t=>(t.date||"")>=c);
  const knownCats=new Set(cats.slice(0,-1));
  const catFilter=(tx,cat,i,len)=>i===len-1?(!tx.category||!knownCats.has(tx.category)):tx.category===cat;
  const totals=cats.map((cat,i)=>({cat,sum:monthTx.filter(x=>catFilter(x,cat,i,cats.length)).reduce((a,b)=>a+Number(b.amount||0),0)}));
  const top=totals.slice().sort((a,b)=>b.sum-a.sum)[0]||{cat:"None",sum:0};
  const merchantTotals={}; monthTx.forEach(x=>merchantTotals[x.merchant]=(merchantTotals[x.merchant]||0)+Number(x.amount||0));
  const topMerchant=Object.keys(merchantTotals).sort((a,b)=>merchantTotals[b]-merchantTotals[a])[0]||"None";

  // Period-scoped totals — used by Spending tab charts (switches with dropdown)
  const periodStart=insightPeriod==='week'
    ? new Date(Date.now()-6*24*60*60*1000).toISOString().slice(0,10)
    : c;
  const periodTx=insightPeriod==='week'?(state.tx||[]).filter(t=>(t.date||"")>=periodStart):monthTx;
  const periodTotal=periodTx.reduce((a,b)=>a+Number(b.amount||0),0);
  const periodTotals=cats.map((cat,i)=>({cat,sum:periodTx.filter(x=>catFilter(x,cat,i,cats.length)).reduce((a,b)=>a+Number(b.amount||0),0)}));
  const periodTop=periodTotals.slice().sort((a,b)=>b.sum-a.sum)[0]||{cat:"None",sum:0};
  const pMerch={}; periodTx.forEach(x=>pMerch[x.merchant]=(pMerch[x.merchant]||0)+Number(x.amount||0));
  const periodTopMerchant=Object.keys(pMerch).sort((a,b)=>pMerch[b]-pMerch[a])[0]||"None";

  const {score:scoreVal,spendScore,savingsScore,balanceScore,goalScore}=calcHealthScore();
  const risk=scoreVal>=75?"Excellent":scoreVal>=60?"Good":scoreVal>=45?"Fair":scoreVal>=30?"Needs Work":"At Risk";
  const scoreColor=scoreVal>=75?"var(--green)":scoreVal>=55?"var(--yellow)":scoreVal>=35?"var(--orange)":"var(--red)";

  $("overviewScore").style.background=`conic-gradient(${scoreColor} ${scoreVal}%, rgba(255,255,255,.10) 0)`;
  $("overviewScore").innerHTML=`<span>${scoreVal}<small>/100</small></span>`;
  $("overviewStatus").textContent=risk;

  // Score breakdown list with colour-coded dots + info tooltips
  const SCORE_FACTORS = [
    { key:"spend",   label:"Spending control", val:spendScore,   max:30,
      info:"Your monthly expenses vs your allowance. Under 60% spent = full 30 pts; over 120% = 0." },
    { key:"savings", label:"Savings rate",      val:savingsScore, max:25,
      info:"Goal deposits as % of your monthly allowance. Depositing 20%+ of income = full 25 pts." },
    { key:"balance", label:"Spending balance",  val:balanceScore, max:20,
      info:"Penalty when one category dominates. Under 35% concentration = full 20 pts." },
    { key:"goals",   label:"Goal trajectory",   val:goalScore,    max:25,
      info:"Your deposit pace this month, projected against each goal's deadline. Depositing more directly raises this." },
  ];
  function dotColor(val, max){ const p=val/max; return p>=0.75?"var(--green)":p>=0.5?"var(--yellow)":p>=0.25?"var(--orange)":"var(--red)"; }
  const bd=$("scoreBreakdown");
  if(bd){
    bd.innerHTML=SCORE_FACTORS.map(f=>`
      <div class="score-row">
        <div class="score-dot" style="background:${dotColor(f.val,f.max)}"></div>
        <span class="score-label">${f.label}</span>
        <span class="score-pts">${f.val}<span class="score-max">/${f.max}</span></span>
        <button class="score-info-btn" data-key="${f.key}" title="${f.info}" aria-label="About ${f.label}">ⓘ</button>
        <div class="score-tooltip" id="stip_${f.key}">${f.info}</div>
      </div>`).join("");
    bd.querySelectorAll(".score-info-btn").forEach(btn=>{
      btn.addEventListener("click", e=>{
        e.stopPropagation();
        const tip=document.getElementById("stip_"+btn.dataset.key);
        const open=!tip.classList.contains("visible");
        bd.querySelectorAll(".score-tooltip").forEach(t=>t.classList.remove("visible"));
        if(open) tip.classList.add("visible");
      });
    });
    document.addEventListener("click", ()=>bd.querySelectorAll(".score-tooltip").forEach(t=>t.classList.remove("visible")), {once:false});
  }

  // ── Factor cards ────────────────────────────────────────────────────
  const spendRate = allowance > 0 ? tt/allowance : 0;
  const spendPct = Math.round(spendRate*100);
  const topCatPct = tt > 0 ? top.sum/tt : 0;
  const projectedMonthly = day > 0 ? (deposits/day)*daysInMonth : deposits;
  const targetDeposit = allowance*0.20;

  // Most urgent goal with a deadline
  const goalsWithDeadline = ensureGoals().filter(g=>g.deadline && Number(g.current_amount||0)<Number(g.target_amount||0));
  const urgentGoal = goalsWithDeadline.sort((a,b)=>new Date(a.deadline)-new Date(b.deadline))[0]||null;
  let urgentNeed=0, urgentShortfall=0;
  if(urgentGoal){
    const rem=Number(urgentGoal.target_amount||0)-Number(urgentGoal.current_amount||0);
    const mLeft=Math.max(0.5,(new Date(urgentGoal.deadline)-Date.now())/(30*24*60*60*1000));
    urgentNeed=rem/mLeft;
    const perGoal=projectedMonthly/Math.max(1,goalsWithDeadline.length);
    urgentShortfall=Math.max(0,urgentNeed-perGoal);
  }

  function dotColor(val,max){const p=val/max;return p>=0.75?"var(--green)":p>=0.5?"var(--yellow)":p>=0.25?"var(--orange)":"var(--red)";}

  const factors=[
    {
      key:"spend", label:"Spending Control", val:spendScore, max:30,
      insight: spendRate>1.0 ? `${money(tt)} spent — ${spendPct}% of allowance, over budget by ${money(tt-allowance)}.`
              : spendRate>0.8 ? `${money(tt)} spent — ${spendPct}% of allowance. Tight with ${daysLeft} days left.`
              : spendRate>0.5 ? `${money(tt)} spent — ${spendPct}% of allowance. Comfortable pace.`
              : tt>0 ? `Only ${spendPct}% of allowance used. Excellent control.`
              : "No expenses recorded this month yet.",
      action:  spendRate>1.0 ? "Avoid all non-essential purchases for the rest of the month."
              : spendRate>0.8 ? `Limit spending to essentials for the next ${daysLeft} day${daysLeft!==1?"s":""}.`
              : "Keep this pace — you're well within budget."
    },
    {
      key:"savings", label:"Savings Rate", val:savingsScore, max:25,
      insight: deposits===0 ? "No goal deposits made this month yet."
              : `${money(deposits)} deposited to goals — ${Math.round(deposits/allowance*100)}% of income (target: 20%).`,
      action:  deposits===0 ? "Make your first deposit — even S$20 builds the habit."
              : deposits<targetDeposit ? `Add ${money(targetDeposit-deposits)} more this month to hit the 20% savings target.`
              : "You're above the 20% savings target — great pace."
    },
    {
      key:"balance", label:"Spending Balance", val:balanceScore, max:20,
      insight: !tt ? "No spending recorded this month yet."
              : topCatPct>0.65 ? `${top.cat} dominates at ${Math.round(topCatPct*100)}% of all spending — very concentrated.`
              : topCatPct>0.50 ? `${top.cat} is ${Math.round(topCatPct*100)}% of spending — slightly heavy.`
              : topCatPct>0.35 ? `${top.cat} is your biggest category at ${Math.round(topCatPct*100)}% — watch for drift.`
              : "Spending is well distributed across categories.",
      action:  topCatPct>0.50 ? `Check if ${top.cat} includes any one-off costs you could reduce.`
              : topCatPct>0.35 ? `Monitor ${top.cat} closely over the next two weeks.`
              : "Balance looks healthy — maintain spending variety."
    },
    {
      key:"goals", label:"Goal Trajectory", val:goalScore, max:25,
      insight: !ensureGoals().length ? "No savings goals set yet."
              : !urgentGoal ? `${money(projectedMonthly>0?projectedMonthly:0)}/month projected — goals without deadlines are hard to track.`
              : urgentShortfall>0 ? `${urgentGoal.name} needs ${money(urgentNeed)}/month — you're projecting ${money(projectedMonthly/Math.max(1,goalsWithDeadline.length))}.`
              : `Deposit pace of ${money(projectedMonthly)}/month covers your goal timelines.`,
      action:  !ensureGoals().length ? "Create a savings goal to unlock trajectory tracking."
              : !urgentGoal ? "Add deadlines to your goals for accurate trajectory scoring."
              : urgentShortfall>0 ? `Deposit ${money(urgentShortfall)} more this month to stay on track for ${urgentGoal.name}.`
              : "Maintain your deposit pace — you're on schedule."
    }
  ];

  // Next best action = weakest factor by relative score
  const weakest=factors.slice().sort((a,b)=>(a.val/a.max)-(b.val/b.max))[0];

  const fc=$("factorCards");
  if(fc){
    fc.innerHTML=factors.map(f=>`
      <div class="factor-card">
        <div class="factor-card-top">
          <div class="score-dot" style="background:${dotColor(f.val,f.max)}"></div>
          <span class="factor-card-name">${f.label}</span>
          <span class="factor-card-badge">${f.val}/${f.max}</span>
        </div>
        <p class="factor-card-insight">${f.insight}</p>
        <p class="factor-card-action">${f.action}</p>
      </div>`).join("");
  }
  const na=$("nextActionCard");
  if(na) na.innerHTML=`
    <div class="next-action-header"><span style="color:var(--green);font-size:16px">✦</span><b>Next Best Action</b></div>
    <p>${weakest.action}</p>`;

  $("totalSpent").textContent=money(periodTotal);

  // Donut chart — built from period-scoped percentages
  let cumPct=0;
  const segments=periodTotals.map((t,i)=>{
    const pct=periodTotal>0?t.sum/periodTotal*100:0;
    const seg=pct>0?`${colors[i]} ${cumPct.toFixed(1)}% ${(cumPct+pct).toFixed(1)}%`:null;
    cumPct+=pct; return seg;
  }).filter(Boolean);
  const donutEl=document.getElementById("donutChart");
  if(donutEl) donutEl.style.background=segments.length
    ? `conic-gradient(${segments.join(",")})`
    : "conic-gradient(rgba(255,255,255,.08) 0 100%)";

  $("legend").innerHTML=cats.map((cat,i)=>{const sum=periodTotals.find(t=>t.cat===cat).sum; const pct=periodTotal?Math.round(sum/periodTotal*100):0; return `<div class="legend-row"><span><i class="dot" style="background:${colors[i]}"></i>${cat}</span><span>${money(sum)}</span><span>${pct}%</span></div>`;}).join("");
  $("topCategory").textContent=periodTop.cat; $("topMerchant").textContent=periodTopMerchant;
  $("incomeRemaining").textContent=money(remaining); $("incomeUsedBar").style.width=usedPct+"%"; $("incomeUsedText").textContent=usedPct+"% allowance allocated";
  $("incomeAllowance").textContent=money(allowance); $("dailyBurn").textContent=money(daily); $("safePerDay").textContent=money(dailyTarget); $("projectedLeft").textContent=(surplus>=0?"+":"")+money(Math.abs(surplus));
  renderDailyChart(insightPeriod);
  renderSaveTab();
}

function renderDailyChart(period='month'){
  const container=$("dailyChart");
  if(!container) return;

  const CATS=["Food & Dining","Transport","Shopping","Subscriptions","Bills","Others"];
  const COLORS=["var(--red)","var(--orange)","var(--yellow)","var(--green)","var(--blue)","var(--purple)"];
  const MAX_H=108;

  const today=new Date();
  const yr=today.getFullYear(), mo=today.getMonth();

  // build cutoff and group all qualifying tx by date
  const cutoffStr=period==='week'
    ? new Date(Date.now()-6*24*60*60*1000).toISOString().slice(0,10)
    : `${yr}-${String(mo+1).padStart(2,"0")}-01`;

  const CHART_CATS=new Set(["Food & Dining","Transport","Shopping","Subscriptions","Bills"]);
  const byDate={};
  (state.tx||[]).filter(t=>(t.date||"")>=cutoffStr).forEach(t=>{
    if(!byDate[t.date]) byDate[t.date]={};
    const cat=(t.category&&CHART_CATS.has(t.category))?t.category:"Others";
    byDate[t.date][cat]=(byDate[t.date][cat]||0)+Number(t.amount||0);
  });

  // build day entries + labels
  const days=[];
  if(period==='week'){
    for(let i=6;i>=0;i--){
      const d=new Date(Date.now()-i*24*60*60*1000);
      const ds=d.toISOString().slice(0,10);
      const catTotals=byDate[ds]||{};
      const total=Object.values(catTotals).reduce((a,b)=>a+b,0);
      const lbl=d.toLocaleDateString([],{weekday:'short'}); // Mon, Tue …
      days.push({ds,catTotals,total,lbl});
    }
  } else {
    for(let d=1;d<=today.getDate();d++){
      const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const catTotals=byDate[ds]||{};
      const total=Object.values(catTotals).reduce((a,b)=>a+b,0);
      const lastD=today.getDate();
      const lbl=(d===1||d%5===0||d===lastD)?String(d):"";
      days.push({ds,catTotals,total,lbl});
    }
  }

  const maxTotal=Math.max(...days.map(x=>x.total),0.01);

  const labelEl=$("dailyChartLabels");

  container.innerHTML=days.map((day,i)=>{
    const barH=day.total>0?Math.max(Math.round(day.total/maxTotal*MAX_H),4):0;
    const segs=CATS.map((cat,ci)=>{
      const amt=day.catTotals[cat]||0;
      if(!amt) return "";
      const segH=Math.max(Math.round(amt/maxTotal*MAX_H), 2); // min 2px so small amounts stay visible
      return `<div class="dbar-seg" style="height:${segH}px;background:${COLORS[ci]}"></div>`;
    }).join("");
    const bar=day.total>0?`<div class="dbar" style="height:${barH}px">${segs}</div>`:"";
    return `
      <div class="dbar-col" data-idx="${i}">
        <div class="dbar-spacer"></div>
        ${bar}
      </div>`;
  }).join("");

  if(labelEl){
    labelEl.innerHTML=days.map(day=>
      `<div class="dbar-lbl">${day.lbl}</div>`
    ).join("");
  }

  // tooltip
  const tip=$("dailyTooltip");
  if(!tip) return;

  container.querySelectorAll(".dbar-col").forEach(col=>{
    const idx=Number(col.dataset.idx);
    const day=days[idx];
    col.addEventListener("mouseenter",()=>{
      if(!day.total) return;
      const active=CATS.map((cat,ci)=>({cat,color:COLORS[ci],amt:day.catTotals[cat]||0})).filter(x=>x.amt>0);
      const dateLabel=new Date(day.ds+"T12:00:00").toLocaleDateString([],{month:"short",day:"numeric"});
      tip.innerHTML=`
        <div class="dtip-date">${dateLabel}</div>
        ${active.map(x=>`
          <div class="dtip-row">
            <div class="dtip-dot" style="background:${x.color}"></div>
            <span class="dtip-cat">${x.cat}</span>
            <span class="dtip-amt">${money(x.amt)}</span>
          </div>`).join("")}
        <div class="dtip-total"><span>Total</span><b>${money(day.total)}</b></div>`;
      tip.classList.add("visible");
      // position: centre on column, clamp to wrapper
      const colR=col.getBoundingClientRect();
      const wrapR=container.closest(".daily-chart-wrap").getBoundingClientRect();
      const tipW=170;
      let left=colR.left-wrapR.left+colR.width/2;
      left=Math.max(tipW/2,Math.min(wrapR.width-tipW/2,left));
      tip.style.left=left+"px";
    });
    col.addEventListener("mouseleave",()=>tip.classList.remove("visible"));
  });
}

function renderSaveTab(){
  ensureGoals();
  const income = Number(state.profile.income||0);
  const cutoff = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const monthSpend = (state.tx||[]).filter(t=>t.date>=cutoff).reduce((s,t)=>s+Number(t.amount||0),0);
  const surplus = income - monthSpend;

  // Overall surplus line (shared across goals)
  if($("saveSurplusText")){
    $("saveSurplusText").textContent = surplus > 0
      ? `You have about ${money(surplus)}/month free to put toward goals (income minus last 30 days spending).`
      : income > 0 ? `No surplus this month — ${money(Math.abs(surplus))} over budget. Goal timelines are paused.`
      : "Set your income in Profile to unlock timeline predictions.";
  }
  if($("saveHeadSub")){
    const n = state.goals.length;
    $("saveHeadSub").textContent = n === 0 ? "Start your first savings goal." :
      `Tracking ${n} goal${n!==1?"s":""}.`;
  }

  const list = $("goalsList");
  if(!list) return;
  list.innerHTML = "";

  if(state.goals.length === 0){
    list.innerHTML = `<div class="goals-empty">
      <div style="font-size:30px">🎯</div>
      <p>No goals yet. What are you saving for?</p>
      <button onclick="openGoalModal()">+ Create a goal</button>
    </div>`;
    return;
  }

  // Split the monthly surplus evenly across unfinished goals for timeline estimates.
  const unfinished = state.goals.filter(g => Number(g.current_amount||0) < Number(g.target_amount||0)).length || 1;
  const perGoalSurplus = surplus > 0 ? surplus / unfinished : 0;

  state.goals.forEach(g=>{
    const current = Number(g.current_amount||0);
    const target  = Number(g.target_amount||0);
    const pct = target > 0 ? Math.min(Math.round(current/target*100), 100) : 0;
    const remaining = Math.max(target - current, 0);
    const done = pct >= 100;

    // Timeline for this goal
    let tl = "";
    if(done){
      tl = "Goal reached! 🎉";
    } else if(perGoalSurplus > 0 && remaining > 0){
      const months = Math.ceil(remaining / perGoalSurplus);
      tl = months <= 1 ? "On track to finish within a month." :
           months <= 12 ? `~${months} months at your current saving rate.` :
           `~${Math.ceil(months/12)} year${Math.ceil(months/12)!==1?"s":""} at this rate.`;
    } else if(income > 0){
      tl = "Timeline paused — no spare cash this month.";
    } else {
      tl = "Set your income to see a timeline.";
    }
    // Deadline-based monthly need
    if(g.deadline && remaining > 0){
      const monthsToDL = Math.max((new Date(g.deadline) - Date.now()) / (30*24*60*60*1000), 0.5);
      const need = Math.ceil(remaining / monthsToDL);
      tl += ` Need ${money(need)}/mo for ${new Date(g.deadline).toLocaleDateString([], {month:"short", year:"numeric"})}.`;
    }

    const circ = 2 * Math.PI * 36;
    const card = document.createElement("div");
    card.className = "goal-card" + (done ? " done" : "");
    card.innerHTML = `
      <div class="goal-card-top">
        <div class="goal-ring-wrap">
          <svg viewBox="0 0 84 84" width="84" height="84">
            <circle cx="42" cy="42" r="36" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7"/>
            <circle cx="42" cy="42" r="36" fill="none" stroke="${done?'var(--green)':'url(#ringGrad)'}" stroke-width="7"
              stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-pct/100)}"
              transform="rotate(-90 42 42)" style="transition:stroke-dashoffset .6s ease"/>
          </svg>
          <div class="goal-ring-center"><span>${pct}%</span><small>saved</small></div>
        </div>
        <div class="goal-card-info">
          <h4>${g.name}</h4>
          <div class="goal-card-amounts"><b>${money(current)}</b> of <b>${money(target)}</b> · ${money(remaining)} to go</div>
        </div>
        <div class="goal-card-menu">
          <button class="goal-icon-btn" title="Edit" onclick="openGoalModal('${g.id}')">✎</button>
          <button class="goal-icon-btn" title="Delete" onclick="deleteGoalById('${g.id}')">🗑</button>
        </div>
      </div>
      <div class="goal-card-tl"><span>${done?'✅':'📅'}</span><span>${tl}</span></div>
      <div class="goal-card-deposit">
        <input type="number" min="0" step="0.01" placeholder="Add a deposit (S$)" id="dep_${g.id}"/>
        <button onclick="logGoalDeposit('${g.id}')">Deposit</button>
      </div>`;
    list.appendChild(card);
  });

  // The small goal rings reference the shared gradient def, which lived in the
  // old single ring. Inject a reusable hidden def once if it's missing.
  if(!document.getElementById("goalsGradDef")){
    const svgNS = "http://www.w3.org/2000/svg";
    const defSvg = document.createElementNS(svgNS, "svg");
    defSvg.setAttribute("id", "goalsGradDef");
    defSvg.setAttribute("width", "0"); defSvg.setAttribute("height", "0");
    defSvg.style.position = "absolute";
    defSvg.innerHTML = `<defs><linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="var(--red)"/><stop offset="100%" stop-color="var(--purple)"/></linearGradient></defs>`;
    document.body.appendChild(defSvg);
  }
}

function generateSmartAlerts(){
  const alerts=[], tx=state.tx||[];
  const allowance=Number(state.profile.income||400);
  // Use month-scoped totals. Deposits are saved, not spent — tracked separately.
  const tt=totalMonth(), deposits=totalDepositsMonth();
  const allocated=tt+deposits;
  const remaining=Math.max(0,allowance-allocated);
  const today=new Date(), day=today.getDate();
  const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
  const daysLeft=Math.max(1,daysInMonth-day);
  const projected=day ? (allocated/day)*daysInMonth : allocated;
  const safePerDay=remaining/daysLeft;
  const usedPct=allowance ? Math.round(allocated/allowance*100) : 0;

  // Category totals — month-scoped too
  const cutoff=new Date(); cutoff.setDate(1); const c=cutoff.toISOString().slice(0,10);
  const monthTx=tx.filter(t=>(t.date||"")>=c);
  const categoryTotals={}; monthTx.forEach(t=>categoryTotals[t.category]=(categoryTotals[t.category]||0)+Number(t.amount||0));
  const top=Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1])[0]||["None",0];

  if(!tx.length){
    alerts.push({icon:"＋",title:"Start tracking",body:"Add or scan your first receipt to activate smart alerts.",type:"Setup",severity:"low"});
  }
  if(tx.length && projected>allowance){
    const depNote=deposits>0?` (includes ${money(deposits)} saved to goals)`:"";
    alerts.push({icon:"⚠️",title:"Allowance pace warning",body:`${money(allocated)} allocated this month (${usedPct}%)${depNote}. At this rate you'll hit ${money(Math.round(projected))} — ${money(Math.round(projected-allowance))} over budget.`,type:"Burn Rate",severity:"high"});
  } else if(tx.length){
    const totalLeft=money(Math.round(remaining));
    const dayStr=daysLeft===1?"1 day":`${daysLeft} days`;
    const depNote=deposits>0?` + ${money(deposits)} saved to goals`:"";
    alerts.push({icon:"✅",title:"Allowance pace looks safe",body:`${money(tt)} spent${depNote} (${usedPct}% of your ${money(allowance)} allowance). ${totalLeft} free cash left for the next ${dayStr}.`,type:"Cashflow",severity:"low"});
  }
  if(tt>0 && top[1]/tt>=.4){
    alerts.push({icon:"⌁",title:`${top[0]} is dominating spend`,body:`${top[0]} makes up ${Math.round(top[1]/tt*100)}% of this month's spending — consider cutting back.`,type:"Category Spike",severity:"medium"});
  }
  if(allowance && tt/allowance>=.7){
    alerts.push({icon:"⌛",title:`Goal may drift`,body:`${usedPct}% of allowance used. Cut non-essentials to protect your ${state.profile.goal||"savings"} timeline.`,type:"Goal Drift",severity:"high"});
  }
  const counts={}; tx.forEach(t=>{const k=(t.merchant||"").toLowerCase(); counts[k]=(counts[k]||0)+1;});
  const recurring=Object.entries(counts).find(([k,v])=>v>=2);
  if(recurring) alerts.push({icon:"↻",title:"Recurring merchant",body:`"${recurring[0]}" appeared ${recurring[1]} times. Check if this is a subscription or ongoing payment.`,type:"Recurring",severity:"medium"});
  return alerts.slice(0,4);
}

function runNotificationEngine(push=false){
  const alerts=generateSmartAlerts(), main=alerts[0];
  const sevColor={high:"var(--red)",medium:"var(--orange)",low:"var(--green)"};
  const homeEl=$("smartAlertHome");
  if(homeEl){
    if(!alerts.length){
      homeEl.innerHTML=`<p style="color:var(--muted);font-size:14px">Alerts will appear after you add expenses.</p>`;
    } else {
      homeEl.innerHTML=alerts.slice(0,2).map(a=>`
        <div class="home-alert-row">
          <div class="home-alert-dot" style="background:${sevColor[a.severity]||'var(--muted2)'}"></div>
          <div class="home-alert-text"><b>${a.title}</b><p>${a.body}</p></div>
        </div>`).join("");
    }
  }
  if(push&&main) toast(main.title,main.body);
}
