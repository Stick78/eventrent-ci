import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Client principal : utilisé partout dans l'application (connexion, données)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client isolé, dédié uniquement à l'inscription : ne conserve jamais de
// session ni ne communique avec le client principal. Évite tout conflit
// (course de vitesse) entre "créer un compte" et "être connecté".
export const supabaseSignup = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
