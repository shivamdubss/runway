import { createClient } from '@supabase/supabase-js';

let serverClient = null;

export function getServerSupabase() {
  if (!serverClient) {
    serverClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return serverClient;
}
