// Boot: init the app

(async function init(){
  const { data:{ session } } = await supabaseClient.auth.getSession();
  if(session){ await loadFromSupabase(); renderApp(); return; }
  const cached=localStorage.getItem("lifepilot_supabase_cache");
  if(cached){ try{
    state=JSON.parse(cached);
    // Migrate older single-goal caches into the multi-goal shape.
    if(!Array.isArray(state.goals)){
      state.goals = (state.profile && state.profile.goalTarget > 0)
        ? [{id:newGoalId(), name:state.profile.goal||"Savings Goal", target_amount:Number(state.profile.goalTarget||0), current_amount:Number(state.profile.goalCurrent||0), deadline:state.profile.deadline||null, status:"on_track"}]
        : [];
      syncPrimaryGoal();
    }
    // Self-heal a stale guest demo: if every transaction is demo data and the
    // newest is >25 days old, regenerate it with current dates (otherwise Lumi
    // would see "zero recent spend" from dates that have aged out of the windows).
    const tx = state.tx || [];
    const allDemo = tx.length > 0 && tx.every(t => t.source === "demo");
    const newest = tx.reduce((m,t)=> t.date > m ? t.date : m, "");
    const stale = newest && ((Date.now() - new Date(newest).getTime()) / 86400000) > 25;
    if(allDemo && stale){ loadLocalDemo(); return; }

    if(state.profile) renderApp();
  }catch(e){} }
})();
