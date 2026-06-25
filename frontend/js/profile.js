// Profile edit modal

function openProfileEditor(){
  const p = state.profile || {};
  $("editName").value = p.name || "";
  $("editDob").value = p.dob || "";
  $("editStage").value = p.stage || "Student";
  $("editIncome").value = p.income || 400;
  $("editRisk").value = p.risk || "Balanced";
  $("profileModal").classList.remove("hidden");
}
function closeProfileEditor(){ $("profileModal").classList.add("hidden"); }
async function saveProfileEdits(){
  const p = state.profile || {};
  const dob = $("editDob").value || null;
  state.profile = {
    ...p,
    name: $("editName").value.trim() || p.name || "LifePilot User",
    dob,
    age: calcAge(dob) || Number(p.age || 18),
    stage: $("editStage").value,
    income: Number($("editIncome").value || 400),
    risk: $("editRisk").value
  };
  await syncProfileNow();
  saveLocal();
  closeProfileEditor();
  renderApp();
  toast("Profile updated","Your allowance and spending style were saved.");
}
