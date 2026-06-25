// db.js — Modular persistence layer
// Pattern: DB.save<Entity>(data) → local write immediately + Supabase if signed in
//          DB.load<Entity>(uid)  → Supabase read → updates state
// To add a new persistent entity: add save/load methods here. Callers stay clean.

const DB = {
  async _uid(){
    try{ return (await supabaseClient.auth.getUser()).data?.user?.id||null; }catch(_){ return null; }
  },

  // ── Deposits ────────────────────────────────────────────────────────────
  // Stored in feed_events as "__DEP__<JSON>" — no schema migration needed.
  async saveDeposit({ goalId, goalName, amount }){
    if(!Array.isArray(state.deposits)) state.deposits=[];
    const dep={ goalId, goalName, amount:Number(amount), ts:Date.now(), date:new Date().toISOString().slice(0,10) };
    state.deposits.unshift(dep);
    state.deposits=state.deposits.slice(0,200);
    saveLocal();
    const uid=await this._uid();
    if(uid){
      try{ await supabaseClient.from("feed_events").insert({ user_id:uid, message:`__DEP__${JSON.stringify(dep)}` }); }
      catch(e){ console.error("DB.saveDeposit:", e); }
    }
    return dep;
  },

  async loadDeposits(uid){
    try{
      const { data }=await supabaseClient.from("feed_events")
        .select("message, created_at")
        .eq("user_id", uid)
        .like("message", "__DEP__%")
        .order("created_at", { ascending:false })
        .limit(200);
      state.deposits=(data||[]).map(r=>{
        try{ return JSON.parse(r.message.slice(7)); }catch(_){ return null; }
      }).filter(Boolean);
    }catch(e){ console.error("DB.loadDeposits:", e); }
  },

  // ── Expenses ────────────────────────────────────────────────────────────
  async saveExpense(expense){
    const uid=await this._uid();
    if(!uid) return;
    const { data, error }=await supabaseClient.from("expenses").insert({
      user_id:uid, merchant:expense.merchant, category:expense.category,
      amount:expense.amount, spent_at:expense.date||new Date().toISOString().slice(0,10),
      source:expense.source||"manual"
    }).select().single();
    if(error){ toast("Cloud save failed", error.message); return; }
    if(data) expense.id=data.id;
  },

  async deleteExpense(id){
    if(!id) return;
    const uid=await this._uid();
    if(!uid) return;
    try{ await supabaseClient.from("expenses").delete().eq("id", id); }
    catch(e){ console.error("DB.deleteExpense:", e); }
  },

  // ── Goals ────────────────────────────────────────────────────────────────
  async saveGoal(goal, uid){
    uid=uid||(await this._uid());
    if(!uid) return null;
    const { data, error }=await supabaseClient.from("goals")
      .insert({ user_id:uid, name:goal.name, target_amount:goal.target_amount, current_amount:goal.current_amount||0, deadline:goal.deadline||null })
      .select().single();
    if(error) throw error;
    return data;
  },

  async updateGoal(id, updates){
    const uid=await this._uid();
    if(!uid||String(id).startsWith("g_")) return;
    const { error }=await supabaseClient.from("goals").update(updates).eq("id", id);
    if(error) throw error;
  },

  async deleteGoal(id){
    const uid=await this._uid();
    if(!uid||String(id).startsWith("g_")) return;
    const { error }=await supabaseClient.from("goals").delete().eq("id", id);
    if(error) throw error;
  },

  // ── Feed events ──────────────────────────────────────────────────────────
  async saveFeedEvent(message){
    const uid=await this._uid();
    if(!uid) return;
    try{ await supabaseClient.from("feed_events").insert({ user_id:uid, message }); }
    catch(e){ console.error("DB.saveFeedEvent:", e); }
  },
};
