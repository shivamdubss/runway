import { createClient } from '@supabase/supabase-js';

let serverClient = null;

function getServerSupabase() {
  if (!serverClient) {
    serverClient = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return serverClient;
}

/**
 * Verify the auth token from the request.
 * Returns the user if valid, or sends a 401 response and returns null.
 */
export async function verifyAuth(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return null;
  }

  const token = authHeader.slice(7);
  const supabase = getServerSupabase();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  return user;
}
