export const OUTFIT_CATEGORY_ORDER = [
  'Layers',
  'Tops',
  'Dresses & Jumpsuits',
  'Bottoms',
  'Shoes',
  'Accessories',
];

export function compareOutfitItems(a, b) {
  const ai = OUTFIT_CATEGORY_ORDER.indexOf(a.category);
  const bi = OUTFIT_CATEGORY_ORDER.indexOf(b.category);
  const aRank = ai === -1 ? OUTFIT_CATEGORY_ORDER.length : ai;
  const bRank = bi === -1 ? OUTFIT_CATEGORY_ORDER.length : bi;
  return aRank - bRank;
}
