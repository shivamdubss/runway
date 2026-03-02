import { handleShareLookup } from './share/[token].js';

export default async function handler(req, res) {
  return handleShareLookup(req, res);
}
