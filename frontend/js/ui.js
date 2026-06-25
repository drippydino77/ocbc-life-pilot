// Navigation, tabs, toasts, modals

function goOnboarding(){$("splash").classList.add("hidden"); $("onboarding").classList.remove("hidden")}
function goSplash(){$("onboarding").classList.add("hidden"); $("splash").classList.remove("hidden")}


function setInsightTab(tab,btn){
  const panels={overview:$("insightOverview"),spending:$("insightSpending"),income:$("insightIncome"),save:$("insightSave")};
  Object.values(panels).forEach(p=>p&&p.classList.add("hidden"));
  if(panels[tab]) panels[tab].classList.remove("hidden");
  document.querySelectorAll("#insightTabs button").forEach(b=>b.classList.remove("active"));
  if(btn) btn.classList.add("active");
}

function showTab(id){
  document.querySelectorAll(".tab").forEach(t=>t.classList.add("hidden"));
  $(id).classList.remove("hidden");
  document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active"));
  const btn=document.querySelector(`.nav button[data-tab="${id}"]`); if(btn) btn.classList.add("active");
  if(id==="ai") renderAiPage();
}

function toast(t,b){const el=$("toast"); el.innerHTML=`<b>${t}</b><span>${b}</span>`; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3300);}

function toggleMascotChat(forceClose){
  const panel = $("mascotChatPanel");
  if(forceClose === false || _lumiOpen){
    panel.classList.add("hidden");
    _lumiOpen = false;
    return;
  }
  panel.classList.remove("hidden");
  _lumiOpen = true;
  if(!_lumiReady) _lumiOpenChat();
  else setTimeout(()=>{ const m=$("lumiMessages"); if(m) m.scrollTop=m.scrollHeight; }, 50);
}
