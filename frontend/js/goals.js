// Multi-goal CRUD

// ── Goal CRUD ──────────────────────────────────────────────────────
let _editingGoalId = null;
let _savingGoal = false;

function openGoalModal(goalId){
  _editingGoalId = goalId || null;
  const g = goalId ? state.goals.find(x=>x.id===goalId) : null;
  $("goalModalTitle").textContent = g ? "Edit goal" : "New goal";
  $("goalNameInput").value = g ? g.name : "";
  $("goalCurrentInput").value = g ? (g.current_amount||0) : "";
  $("goalTargetInput").value = g ? (g.target_amount||"") : "";
  $("goalDeadlineInput").value = g && g.deadline ? g.deadline : "";
  const _tomorrow = new Date(); _tomorrow.setDate(_tomorrow.getDate() + 1);
  $("goalDeadlineInput").min = _tomorrow.toISOString().slice(0, 10);
  $("goalModal").classList.remove("hidden");
}
function closeGoalModal(){ $("goalModal").classList.add("hidden"); _editingGoalId = null; }

async function saveGoal(){
  if(_savingGoal) return;
  const name = ($("goalNameInput").value||"").trim();
  const target = Number($("goalTargetInput").value||0);
  const current = Number($("goalCurrentInput").value||0);
  const deadline = $("goalDeadlineInput").value || null;
  if(!name) return toast("Name needed","Give your goal a name.");
  if(!target || target <= 0) return toast("Target needed","Enter how much you need to save.");
  if(deadline){
    const today = new Date(); today.setHours(0,0,0,0);
    const minDate = new Date(today); minDate.setDate(minDate.getDate() + 1);
    const picked = new Date(deadline + "T00:00:00");
    if(picked <= today) return toast("Invalid date","Target date must be at least tomorrow.");
  }

  _savingGoal = true;
  ensureGoals();
  try{
    if(_editingGoalId){
      const g = state.goals.find(x=>x.id===_editingGoalId);
      if(g){ g.name=name; g.target_amount=target; g.current_amount=current; g.deadline=deadline; }
      await DB.updateGoal(_editingGoalId, {name, target_amount:target, current_amount:current, deadline});
      logEvent("goal_updated", "✏️", "var(--orange)", `Updated: ${name}`, `Target ${money(target)}`);
      toast("Goal updated", `"${name}" was saved.`);
    } else {
      const goal = {id:newGoalId(), name, target_amount:target, current_amount:current, deadline, status:"on_track"};
      const saved = await DB.saveGoal(goal);
      if(saved) goal.id = saved.id;
      state.goals.push(goal);
      logEvent("goal_created", "🎯", "var(--green)", `Goal created: ${name}`, `Target ${money(target)}`);
      toast("Goal created", `Now saving for "${name}".`);
    }
    syncPrimaryGoal();
    saveLocal();
    closeGoalModal();
    renderApp();
  } catch(e){
    console.error(e);
    toast("Error","Could not save goal. Try again.");
  } finally {
    _savingGoal = false;
  }
}

async function deleteGoalById(goalId){
  const g = state.goals.find(x=>x.id===goalId);
  if(!g) return;
  if(!confirm(`Delete "${g.name}"? This can't be undone.`)) return;
  try{
    await DB.deleteGoal(goalId);
    state.goals = state.goals.filter(x=>x.id!==goalId);
    logEvent("goal_deleted", "🗑️", "var(--muted2)", `Goal deleted: ${g.name}`, `Was ${money(g.current_amount||0)} of ${money(g.target_amount||0)}`);
    syncPrimaryGoal();
    saveLocal();
    renderApp();
    toast("Goal deleted", `"${g.name}" was removed.`);
  } catch(e){
    console.error(e);
    toast("Error","Could not delete goal.");
  }
}

async function logGoalDeposit(goalId){
  const input = $("dep_"+goalId);
  const amount = parseFloat(input?.value||0);
  if(!amount || amount <= 0) return toast("Enter an amount","Type how much you're depositing.");
  const g = state.goals.find(x=>x.id===goalId);
  if(!g) return;
  const newCurrent = Number(g.current_amount||0) + amount;
  try{
    await DB.updateGoal(goalId, {current_amount:newCurrent});
    g.current_amount = newCurrent;
    await DB.saveDeposit({ goalId, goalName:g.name, amount });
    logEvent("goal_deposit", "💰", "var(--blue)", `Deposited ${money(amount)} → ${g.name}`, `${money(newCurrent)} of ${money(g.target_amount||0)} saved`);
    syncPrimaryGoal();
    saveLocal();
    renderApp();
    toast("Deposit logged", `${money(amount)} added to "${g.name}".`);
    if(Number(g.target_amount||0) > 0 && newCurrent >= g.target_amount) toast("Goal reached! 🎉", `You hit your target for "${g.name}"!`);
  } catch(e){
    console.error(e);
    toast("Error","Could not save deposit. Try again.");
  }
}
