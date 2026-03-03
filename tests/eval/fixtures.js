/**
 * Eval fixtures: sample wardrobes, profiles, weather data, and test scenarios.
 *
 * Item shape matches the frontend format from db.js toFrontendItem():
 * { id, label, name, color, accent, emoji, category }
 */

// ── Wardrobes ────────────────────────────────────────────────

export const WARDROBE_FULL = [
  // Tops
  { id: 'w1',  category: 'Tops',        label: 'Top',         name: 'White Oxford Shirt',      color: 'white',      accent: '#E8E8E8', emoji: '👔' },
  { id: 'w2',  category: 'Tops',        label: 'Top',         name: 'Navy Polo',               color: 'navy',       accent: '#E8E8E8', emoji: '👕' },
  { id: 'w3',  category: 'Tops',        label: 'Top',         name: 'Black Graphic Tee',       color: 'black',      accent: '#E8E8E8', emoji: '👕' },
  { id: 'w4',  category: 'Tops',        label: 'Top',         name: 'Light Blue Linen Shirt',  color: 'light blue', accent: '#E8E8E8', emoji: '👔' },
  { id: 'w5',  category: 'Tops',        label: 'Top',         name: 'Burgundy Henley',         color: 'burgundy',   accent: '#E8E8E8', emoji: '👕' },
  // Layers
  { id: 'w6',  category: 'Layers',      label: 'Layer',       name: 'Charcoal Wool Blazer',    color: 'charcoal',   accent: '#E8E8E8', emoji: '🧥' },
  { id: 'w7',  category: 'Layers',      label: 'Layer',       name: 'Olive Field Jacket',      color: 'olive',      accent: '#E8E8E8', emoji: '🧥' },
  { id: 'w8',  category: 'Layers',      label: 'Layer',       name: 'Cream Cable-Knit Sweater', color: 'cream',     accent: '#E8E8E8', emoji: '🧶' },
  { id: 'w9',  category: 'Layers',      label: 'Layer',       name: 'Navy Puffer Vest',        color: 'navy',       accent: '#E8E8E8', emoji: '🧥' },
  // Bottoms
  { id: 'w10', category: 'Bottoms',     label: 'Bottom',      name: 'Dark Indigo Jeans',       color: 'indigo',     accent: '#E8E8E8', emoji: '👖' },
  { id: 'w11', category: 'Bottoms',     label: 'Bottom',      name: 'Khaki Chinos',            color: 'khaki',      accent: '#E8E8E8', emoji: '👖' },
  { id: 'w12', category: 'Bottoms',     label: 'Bottom',      name: 'Grey Wool Trousers',      color: 'grey',       accent: '#E8E8E8', emoji: '👖' },
  { id: 'w13', category: 'Bottoms',     label: 'Bottom',      name: 'Tan Shorts',              color: 'tan',        accent: '#E8E8E8', emoji: '🩳' },
  // Shoes
  { id: 'w14', category: 'Shoes',       label: 'Shoes',       name: 'Brown Leather Loafers',   color: 'brown',      accent: '#E8E8E8', emoji: '👞' },
  { id: 'w15', category: 'Shoes',       label: 'Shoes',       name: 'White Sneakers',          color: 'white',      accent: '#E8E8E8', emoji: '👟' },
  { id: 'w16', category: 'Shoes',       label: 'Shoes',       name: 'Black Chelsea Boots',     color: 'black',      accent: '#E8E8E8', emoji: '🥾' },
  // Accessories
  { id: 'w17', category: 'Accessories', label: 'Accessories', name: 'Brown Leather Belt',      color: 'brown',      accent: '#E8E8E8', emoji: '👔' },
  { id: 'w18', category: 'Accessories', label: 'Accessories', name: 'Navy Knit Tie',           color: 'navy',       accent: '#E8E8E8', emoji: '👔' },
];

export const WARDROBE_MINIMAL = [
  { id: 'm1', category: 'Tops',    label: 'Top',    name: 'Grey T-Shirt',   color: 'grey',  accent: '#E8E8E8', emoji: '👕' },
  { id: 'm2', category: 'Bottoms', label: 'Bottom', name: 'Blue Jeans',     color: 'blue',  accent: '#E8E8E8', emoji: '👖' },
  { id: 'm3', category: 'Shoes',   label: 'Shoes',  name: 'Black Sneakers', color: 'black', accent: '#E8E8E8', emoji: '👟' },
];

// ── Profiles ─────────────────────────────────────────────────

export const PROFILE_DEFAULT = {
  body: { height: { value: 178, unit: 'cm' }, sizePreference: 'regular' },
  style: {
    genderPreference: 'mens',
    preferredStyles: ['smart casual', 'minimal'],
    colorPreferences: ['navy', 'earth tones'],
  },
  styleContext: { notes: '' },
};

export const PROFILE_FEMININE = {
  body: { height: { value: 165, unit: 'cm' }, sizePreference: 'regular' },
  style: {
    genderPreference: 'feminine',
    preferredStyles: ['classic', 'elegant'],
    colorPreferences: ['black', 'blush'],
  },
  styleContext: { notes: '' },
};

// ── Weather ──────────────────────────────────────────────────

export const WEATHER_HOT = {
  temp: 92, feelsLike: 95, high: 96, low: 82,
  condition: 'clear sky', wind: 5, city: 'Phoenix',
};

export const WEATHER_COLD = {
  temp: 28, feelsLike: 18, high: 32, low: 22,
  condition: 'light snow', wind: 15, city: 'Chicago',
};

export const WEATHER_MILD = {
  temp: 68, feelsLike: 66, high: 72, low: 58,
  condition: 'partly cloudy', wind: 8, city: 'San Francisco',
};

export const WEATHER_RAIN = {
  temp: 55, feelsLike: 50, high: 58, low: 48,
  condition: 'rain', wind: 12, city: 'Seattle',
};

// ── Scenarios ────────────────────────────────────────────────

export const SCENARIOS = [
  {
    name: 'standard-casual',
    description: 'Casual outfit request with full wardrobe, mild weather',
    wardrobeItems: WARDROBE_FULL,
    profile: PROFILE_DEFAULT,
    weather: WEATHER_MILD,
    userMessage: 'I need an outfit for a casual weekend brunch with friends.',
    expectedTraits: { minOutfits: 2, maxOutfits: 3 },
  },
  {
    name: 'hot-weather',
    description: 'Hot weather — should exclude heavy layers',
    wardrobeItems: WARDROBE_FULL,
    profile: PROFILE_DEFAULT,
    weather: WEATHER_HOT,
    userMessage: 'What should I wear today?',
    expectedTraits: {
      minOutfits: 2,
      maxOutfits: 3,
      bannedItems: ['Charcoal Wool Blazer', 'Cream Cable-Knit Sweater', 'Navy Puffer Vest'],
    },
  },
  {
    name: 'cold-weather',
    description: 'Cold weather — should include layers',
    wardrobeItems: WARDROBE_FULL,
    profile: PROFILE_DEFAULT,
    weather: WEATHER_COLD,
    userMessage: 'Heading out for dinner. What works?',
    expectedTraits: {
      minOutfits: 2,
      maxOutfits: 3,
      bannedItems: ['Tan Shorts'],
      requiresLayer: true,
    },
  },
  {
    name: 'minimal-wardrobe',
    description: 'Very limited wardrobe — should not force 3 outfits',
    wardrobeItems: WARDROBE_MINIMAL,
    profile: PROFILE_DEFAULT,
    weather: WEATHER_MILD,
    userMessage: 'What outfits can you make from what I have?',
    expectedTraits: { minOutfits: 1, maxOutfits: 1 },
  },
  {
    name: 'formal-occasion',
    description: 'Formal event — formality matching',
    wardrobeItems: WARDROBE_FULL,
    profile: PROFILE_DEFAULT,
    weather: WEATHER_MILD,
    userMessage: 'I have a business dinner tonight at a nice restaurant. Need to look sharp.',
    expectedTraits: { minOutfits: 2, maxOutfits: 3 },
  },
  {
    name: 'conversational-no-outfits',
    description: 'Non-outfit question — should return empty outfits array',
    wardrobeItems: WARDROBE_FULL,
    profile: PROFILE_DEFAULT,
    weather: null,
    userMessage: 'What colors go best with navy?',
    expectedTraits: { minOutfits: 0, maxOutfits: 0 },
  },
];
