import { getServerSupabase } from './supabase.js';

/**
 * Verify the auth token from the request.
 * Returns the user if valid, or sends a 401 response and returns null.
 */
export async function verifyAuth(req, res) {
  if (req.user) {
    return req.user;
  }

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

  req.user = user;
  return user;
}
