// Auth + Supabase data load/save

function setAuthMode(mode){
  authMode = mode;
  $("signupTab").classList.toggle("active", mode==="signup");
  $("loginTab").classList.toggle("active", mode==="login");
  $("signupFields").classList.toggle("hidden", mode==="login");
  $("profileFields").classList.toggle("hidden", mode==="login");
  $("authButton").textContent = mode==="signup" ? "Create Account" : "Login";
}

async function handleAuth(){
  const email = $("email").value.trim();
  const password = $("password").value;
  if(!email || !password) return toast("Missing details","Enter email and password.");

  if(authMode === "signup"){
    const fullName = $("name").value.trim() || "New User";
    const { data, error } = await supabaseClient.auth.signUp({
      email, password, options: { data: { full_name: fullName } }
    });
    if(error) return toast("Signup failed", error.message);

    const user = data.user;
    if(user){
      const profile = {
        id:user.id, email, full_name:fullName, dob:$("dob").value || null,
        age:calcAge($("dob").value) || 18,
        life_stage:$("stage").value, income:Number($("income").value||400),
        goal:$("goal").value||"Savings Goal", goal_current:Number($("goalCurrent").value||0), goal_target:Number($("goalTarget").value||1500), risk:$("risk").value
      };
      const { error:profileError } = await supabaseClient.from("profiles").upsert(profile);
      if(profileError) return toast("Profile save failed", profileError.message);

      state = {
        profile: { name:profile.full_name, email:profile.email, verified:true, dob:profile.dob, age:profile.age, stage:profile.life_stage, income:profile.income, goal:profile.goal, goalCurrent:Number(profile.goal_current||0), goalTarget:Number(profile.goal_target||1500), risk:profile.risk },
        tx:[],
        feed:[["Now","LifePilot account created and synced with Supabase."]]
      };
      await saveFeedToSupabase("LifePilot account created and synced with Supabase.");
      saveLocal(); renderApp(); toast("Account created","Your data is now cloud-synced.");
    } else {
      toast("Check email","Confirm your email, then login.");
    }
  } else {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error) return toast("Login failed", error.message);
    await loadFromSupabase();
    renderApp(); toast("Logged in","Your LifePilot data is synced.");
  }
}

async function loadFromSupabase(){
  const { data:{ user } } = await supabaseClient.auth.getUser();
  if(!user) return false;

  let { data:profile, error:profileError } = await supabaseClient.from("profiles").select("*").eq("id", user.id).single();

  if(profileError && profileError.code === "PGRST116"){
    const fallbackProfile = {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "LifePilot User",
      dob: null,
      age: 18,
      life_stage: "Student",
      income: 400,
      goal: "Savings Goal",
      goal_current: 0,
      goal_target: 1500,
      risk: "Balanced"
    };

    const { data:newProfile, error:createProfileError } = await supabaseClient
      .from("profiles")
      .upsert(fallbackProfile)
      .select()
      .single();

    if(createProfileError){
      console.log("Auto profile creation failed:", createProfileError);
      toast("Profile sync issue", createProfileError.message);
    } else {
      profile = newProfile;
    }
  } else if(profileError) {
    console.log(profileError);
  }

  const { data:expenses } = await supabaseClient.from("expenses").select("*").eq("user_id", user.id).order("spent_at", { ascending:false });
  const { data:feeds } = await supabaseClient.from("feed_events").select("*").eq("user_id", user.id).order("created_at", { ascending:false }).limit(30);
  const { data:goalRows } = await supabaseClient.from("goals").select("*").eq("user_id", user.id).order("created_at", { ascending:true });
  const { data:prefRow } = await supabaseClient.from("preferences").select("*").eq("user_id", user.id).single();

  let goals = (goalRows||[]).map(g=>({
    id:g.id, name:g.name, target_amount:Number(g.target_amount||0),
    current_amount:Number(g.current_amount||0), deadline:g.deadline||null, status:g.status||"on_track"
  }));

  // Migrate a legacy single goal from profiles → goals table on first load.
  if(goals.length === 0 && profile?.goal && Number(profile?.goal_target||0) > 0){
    const { data:migrated } = await supabaseClient.from("goals").insert({
      user_id:user.id, name:profile.goal,
      target_amount:Number(profile.goal_target||0), current_amount:Number(profile.goal_current||0)
    }).select().single();
    if(migrated) goals = [{id:migrated.id, name:migrated.name, target_amount:Number(migrated.target_amount), current_amount:Number(migrated.current_amount), deadline:migrated.deadline, status:migrated.status}];
  }

  // Reconstruct preferences from the flat Supabase row (life_notes is jsonb, already parsed)
  let loadedPrefs = {};
  if(prefRow){
    const {user_id, updated_at, ...fields} = prefRow;
    loadedPrefs = fields;
  }

  state = {
    profile: {
      name:profile?.full_name || user.user_metadata?.full_name || user.email,
      email:user.email,
      verified:true,
      dob:profile?.dob || null,
      age:profile?.dob ? calcAge(profile.dob) : (profile?.age || 18),
      stage:profile?.life_stage || "Student",
      income:Number(profile?.income || 400),
      risk:profile?.risk || "Balanced"
    },
    goals,
    tx:(expenses||[]).map(e=>({ id:e.id, amount:Number(e.amount), category:e.category, merchant:e.merchant, date:(e.spent_at||"").slice(0,10), source:e.source })),
    feed:(feeds||[]).map(f=>[new Date(f.created_at).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}), f.message]),
    preferences: loadedPrefs
  };
  syncPrimaryGoal();
  await DB.loadDeposits(user.id);
  saveLocal(); return true;
}

async function saveExpenseToSupabase(expense){ await DB.saveExpense(expense); }
async function saveFeedToSupabase(message){ await DB.saveFeedEvent(message); }


async function syncProfileNow(){
  const { data:{ user } } = await supabaseClient.auth.getUser();
  if(!user) return toast("Not logged in","Login first before syncing profile.");
  const profile = {
    id: user.id,
    email: user.email,
    full_name: state.profile?.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "LifePilot User",
    dob: state.profile?.dob || null,
    age: Number(state.profile?.age || 18),
    life_stage: state.profile?.stage || "Student",
    income: Number(state.profile?.income || 400),
    goal: state.profile?.goal || "Savings Goal",
    goal_current: Number(state.profile?.goalCurrent || 0),
    goal_target: Number(state.profile?.goalTarget || 1500),
    risk: state.profile?.risk || "Balanced"
  };
  const { error } = await supabaseClient.from("profiles").upsert(profile);
  if(error) return toast("Profile sync failed", error.message);
  toast("Profile synced","Profile row saved to Supabase.");
}

async function signOut(){
  await supabaseClient.auth.signOut();
  localStorage.removeItem("lifepilot_supabase_cache");
  location.reload();
}

const GUEST_NAMES = ["Alex","Jordan","Riley","Morgan","Casey","Quinn","Avery","Blake","Drew","Jamie","Reese","Skyler","Dakota","Sage","River"];

function getGuestName(){
  const key = "lifepilot_guest_name";
  let n = localStorage.getItem(key);
  if(!n){
    n = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
    localStorage.setItem(key, n);
  }
  return n;
}

function loadLocalDemo(){
  const guestName = getGuestName();
  // Dates relative to TODAY so demo spend always falls inside the recent windows
  // (7d / 30d). Hardcoded dates go stale and make Lumi see "zero spend".
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
  state = {
    profile:{ name:guestName, email:"guest@lifepilot.demo", verified:false, dob:null, age:22, stage:"Young Adult", income:400, risk:"Balanced" },
    goals:[
      {id:newGoalId(), name:"Japan Trip", target_amount:5000, current_amount:1800, deadline:daysAgo(-190), status:"on_track"},
      {id:newGoalId(), name:"Emergency Fund", target_amount:6000, current_amount:2400, deadline:null, status:"on_track"}
    ],
    tx:[
      {amount:88.40,category:"Food & Dining",merchant:"Dining Out",date:daysAgo(0),source:"demo"},
      {amount:42.60,category:"Transport",merchant:"Grab + MRT",date:daysAgo(1),source:"demo"},
      {amount:76.30,category:"Shopping",merchant:"Shopee / Uniqlo",date:daysAgo(3),source:"demo"},
      {amount:20.98,category:"Subscriptions",merchant:"Spotify + iCloud",date:daysAgo(6),source:"demo"},
      {amount:54.20,category:"Food & Dining",merchant:"Hawker + Grab",date:daysAgo(12),source:"demo"},
      {amount:130.00,category:"Shopping",merchant:"Uniqlo",date:daysAgo(20),source:"demo"}
    ],
    feed:[["Now","Demo account loaded. Use Supabase signup/login for real cloud sync."]],
    preferences: {}
  };
  syncPrimaryGoal();
  saveLocal(); renderApp();
}

async function refreshGoalsFromSupabase(){
  try{
    const uid = (await supabaseClient.auth.getUser()).data?.user?.id;
    if(!uid) return false;
    const { data, error } = await supabaseClient.from("goals").select("*").eq("user_id", uid).order("created_at", { ascending:true });
    if(error) throw error;
    state.goals = (data||[]).map(g=>({
      id:g.id, name:g.name, target_amount:Number(g.target_amount||0),
      current_amount:Number(g.current_amount||0), deadline:g.deadline||null, status:g.status||"on_track"
    }));
    syncPrimaryGoal();
    return true;
  } catch(e){
    console.error("Goal refresh failed:", e);
    return false;
  }
}
