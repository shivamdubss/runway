import { verifyAuth } from '../../api/_lib/auth.js';

export async function requireAuth(req, res, next) {
  const user = await verifyAuth(req, res);
  if (!user) return;
  req.user = user;
  next();
}
