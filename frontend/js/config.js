// Supabase client + API base URL

const SUPABASE_URL = "https://iaigdkxxscnxcjiudzxc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhaWdka3h4c2NueGNqaXVkenhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMDgwNTUsImV4cCI6MjA5Nzc4NDA1NX0.1RaJBDWtAbq0JKZLFh0xxJrk0g7qOQKairJPGGXPOq0";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// === Lumi Chat Widget ===
const LUMI_API = "";  // same-origin: FastAPI serves this page
