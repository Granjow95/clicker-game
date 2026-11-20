// Client Supabase côté serveur (clé service_role : ne jamais l'envoyer au client ni la logger).
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ENABLED } = require("../config");

let client; // undefined = pas encore créé ; null = désactivé ou création impossible

function getSupabase() {
  if (client !== undefined) return client;
  client = null;
  if (!SUPABASE_ENABLED) return client;
  try {
    const { createClient } = require("@supabase/supabase-js");
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  } catch (err) {
    console.error("Supabase : initialisation impossible :", err?.message);
    client = null;
  }
  return client;
}

// Pour les tests : injecte un faux client (ou null pour tout désactiver).
function setSupabase(fake) {
  client = fake;
}

module.exports = { getSupabase, setSupabase };
