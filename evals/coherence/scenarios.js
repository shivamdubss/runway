// ---------------------------------------------------------------------------
// Synthetic wardrobe sets
// Reused across scenarios to keep the test data manageable.
// Item shape matches what buildSystemPrompt expects: { category, label, name }
// ---------------------------------------------------------------------------

const MINIMAL_WARDROBE = [
  { category: 'Tops', label: 'Top', name: 'White Oxford Shirt' },
  { category: 'Layers', label: 'Layer', name: 'Navy Wool Blazer' },
  { category: 'Bottoms', label: 'Bottom', name: 'Charcoal Slim Trousers' },
  { category: 'Bottoms', label: 'Bottom', name: 'Dark Indigo Jeans' },
  { category: 'Shoes', label: 'Shoes', name: 'Brown Leather Oxford' },
  { category: 'Accessories', label: 'Accessories', name: 'Burgundy Silk Tie' },
];

const BALANCED_WARDROBE = [
  // Tops
  { category: 'Tops', label: 'Top', name: 'White Oxford Shirt' },
  { category: 'Tops', label: 'Top', name: 'Light Blue Linen Shirt' },
  { category: 'Tops', label: 'Top', name: 'Grey Merino Crew Neck' },
  { category: 'Tops', label: 'Top', name: 'Navy Striped Breton Tee' },
  // Layers
  { category: 'Layers', label: 'Layer', name: 'Navy Wool Blazer' },
  { category: 'Layers', label: 'Layer', name: 'Camel Wool Overcoat' },
  { category: 'Layers', label: 'Layer', name: 'Olive Waxed Canvas Jacket' },
  // Bottoms
  { category: 'Bottoms', label: 'Bottom', name: 'Charcoal Slim Trousers' },
  { category: 'Bottoms', label: 'Bottom', name: 'Dark Indigo Jeans' },
  { category: 'Bottoms', label: 'Bottom', name: 'Tan Chinos' },
  { category: 'Bottoms', label: 'Bottom', name: 'Navy Wool Trousers' },
  // Shoes
  { category: 'Shoes', label: 'Shoes', name: 'Brown Leather Oxford' },
  { category: 'Shoes', label: 'Shoes', name: 'White Canvas Sneakers' },
  { category: 'Shoes', label: 'Shoes', name: 'Chelsea Boots in Tan Suede' },
  // Accessories
  { category: 'Accessories', label: 'Accessories', name: 'Burgundy Silk Tie' },
  { category: 'Accessories', label: 'Accessories', name: 'Brown Leather Belt' },
  { category: 'Accessories', label: 'Accessories', name: 'Navy Wool Pocket Square' },
  { category: 'Accessories', label: 'Accessories', name: 'Silver Watch' },
];

const CASUAL_HEAVY_WARDROBE = [
  // All casual — tests graceful degradation for formal requests
  { category: 'Tops', label: 'Top', name: 'White Graphic Tee' },
  { category: 'Tops', label: 'Top', name: 'Washed Denim Shirt' },
  { category: 'Tops', label: 'Top', name: 'Heather Grey Hoodie' },
  { category: 'Tops', label: 'Top', name: 'Navy Pocket Tee' },
  { category: 'Layers', label: 'Layer', name: 'Olive Zip-Up Fleece' },
  { category: 'Layers', label: 'Layer', name: 'Black Bomber Jacket' },
  { category: 'Bottoms', label: 'Bottom', name: 'Dark Indigo Jeans' },
  { category: 'Bottoms', label: 'Bottom', name: 'Black Slim Jeans' },
  { category: 'Bottoms', label: 'Bottom', name: 'Khaki Joggers' },
  { category: 'Bottoms', label: 'Bottom', name: 'Grey Sweatpants' },
  { category: 'Shoes', label: 'Shoes', name: 'White Canvas Sneakers' },
  { category: 'Shoes', label: 'Shoes', name: 'Black Running Shoes' },
];

// Wardrobe with all summer-appropriate items + some layers for variety
const SUMMER_WARDROBE = [
  { category: 'Tops', label: 'Top', name: 'White Linen Camp Collar Shirt' },
  { category: 'Tops', label: 'Top', name: 'Pale Blue Linen Tee' },
  { category: 'Tops', label: 'Top', name: 'White Ribbed Tank Top' },
  { category: 'Tops', label: 'Top', name: 'Navy Linen Polo' },
  { category: 'Layers', label: 'Layer', name: 'Lightweight Linen Blazer' },
  { category: 'Layers', label: 'Layer', name: 'Cotton Chambray Shirt Jacket' },
  { category: 'Bottoms', label: 'Bottom', name: 'Navy Linen Shorts' },
  { category: 'Bottoms', label: 'Bottom', name: 'Tan Linen Trousers' },
  { category: 'Bottoms', label: 'Bottom', name: 'White Cotton Shorts' },
  { category: 'Shoes', label: 'Shoes', name: 'Tan Leather Sandals' },
  { category: 'Shoes', label: 'Shoes', name: 'White Canvas Sneakers' },
  { category: 'Accessories', label: 'Accessories', name: 'Woven Rope Bracelet' },
  { category: 'Accessories', label: 'Accessories', name: 'Tortoiseshell Sunglasses' },
];

// Wardrobe with winter layers + core items
const WINTER_WARDROBE = [
  { category: 'Tops', label: 'Top', name: 'White Oxford Shirt' },
  { category: 'Tops', label: 'Top', name: 'Cream Cashmere Turtleneck' },
  { category: 'Tops', label: 'Top', name: 'Navy Merino Crew Neck' },
  { category: 'Tops', label: 'Top', name: 'Charcoal Flannel Shirt' },
  { category: 'Layers', label: 'Layer', name: 'Camel Wool Overcoat' },
  { category: 'Layers', label: 'Layer', name: 'Navy Wool Blazer' },
  { category: 'Layers', label: 'Layer', name: 'Forest Green Quilted Vest' },
  { category: 'Layers', label: 'Layer', name: 'Charcoal Wool Cardigan' },
  { category: 'Bottoms', label: 'Bottom', name: 'Dark Indigo Jeans' },
  { category: 'Bottoms', label: 'Bottom', name: 'Charcoal Slim Trousers' },
  { category: 'Bottoms', label: 'Bottom', name: 'Navy Corduroy Trousers' },
  { category: 'Shoes', label: 'Shoes', name: 'Brown Leather Oxford' },
  { category: 'Shoes', label: 'Shoes', name: 'Chestnut Chelsea Boots' },
  { category: 'Accessories', label: 'Accessories', name: 'Charcoal Wool Scarf' },
  { category: 'Accessories', label: 'Accessories', name: 'Leather Gloves' },
];

// Tops-heavy — tests wardrobe imbalance stress
const TOPS_HEAVY_WARDROBE = [
  { category: 'Tops', label: 'Top', name: 'White Oxford Shirt' },
  { category: 'Tops', label: 'Top', name: 'Navy Striped Tee' },
  { category: 'Tops', label: 'Top', name: 'Grey Graphic Tee' },
  { category: 'Tops', label: 'Top', name: 'Light Blue Linen Shirt' },
  { category: 'Tops', label: 'Top', name: 'Black Mock Neck Top' },
  { category: 'Bottoms', label: 'Bottom', name: 'Dark Indigo Jeans' },
  { category: 'Shoes', label: 'Shoes', name: 'White Canvas Sneakers' },
];

// ---------------------------------------------------------------------------
// Test scenarios
// ---------------------------------------------------------------------------

export const SCENARIOS = [
  {
    id: 'work_meeting_minimal',
    request: 'I have a business meeting tomorrow morning. What should I wear?',
    wardrobeItems: MINIMAL_WARDROBE,
    profile: null,
    weather: null,
    conversationHistory: [],
    expectedPass: true,
    tags: ['work', 'formal', 'minimal-wardrobe'],
  },

  {
    id: 'date_night_large',
    request: 'Date night at a nice restaurant this weekend. Help me pick something.',
    wardrobeItems: BALANCED_WARDROBE,
    profile: null,
    weather: null,
    conversationHistory: [],
    expectedPass: true,
    tags: ['date-night', 'semi-formal', 'large-wardrobe'],
  },

  {
    id: 'casual_weekend_balanced',
    request: 'Casual weekend brunch with friends. Nothing too formal.',
    wardrobeItems: BALANCED_WARDROBE,
    profile: null,
    weather: null,
    conversationHistory: [],
    expectedPass: true,
    tags: ['casual', 'weekend', 'large-wardrobe'],
  },

  {
    id: 'casual_night_out_casual_wardrobe',
    request: 'Going out with friends tonight, want to look put-together but keep it casual.',
    wardrobeItems: CASUAL_HEAVY_WARDROBE,
    profile: null,
    weather: null,
    conversationHistory: [],
    expectedPass: true,
    tags: ['casual', 'going-out', 'casual-wardrobe'],
  },

  {
    id: 'summer_heat_constraint',
    request: 'Outdoor picnic with family this afternoon.',
    wardrobeItems: SUMMER_WARDROBE,
    profile: null,
    weather: {
      city: 'Los Angeles',
      temp: 35,
      high: 38,
      low: 28,
      wind: 10,
      condition: 'Sunny',
    },
    conversationHistory: [],
    expectedPass: true,
    tags: ['casual', 'weather-constraint', 'summer'],
  },

  {
    id: 'winter_cold_constraint',
    request: 'Running weekend errands in the city.',
    wardrobeItems: WINTER_WARDROBE,
    profile: null,
    weather: {
      city: 'Chicago',
      temp: -5,
      high: -2,
      low: -8,
      wind: 25,
      condition: 'Partly cloudy',
    },
    conversationHistory: [],
    expectedPass: true,
    tags: ['casual', 'weather-constraint', 'winter'],
  },

  {
    id: 'anchor_item_blazer',
    request: 'I want to wear my navy blazer today. Build an outfit around it for a smart casual dinner.',
    wardrobeItems: BALANCED_WARDROBE,
    profile: null,
    weather: null,
    conversationHistory: [],
    expectedPass: true,
    tags: ['anchor-item', 'smart-casual', 'constraint'],
  },

  {
    id: 'no_jeans_constraint',
    request: 'Give me three more options for tonight.',
    wardrobeItems: BALANCED_WARDROBE,
    profile: null,
    weather: null,
    // Simulates a refinement round after the user said "no jeans please"
    conversationHistory: [
      { role: 'user', content: 'What should I wear for a casual dinner out?' },
      {
        role: 'assistant',
        content: JSON.stringify({
          message: 'Here are three outfits for a casual dinner.',
          outfits: [
            { vibe: 'Classic Casual', items: ['White Oxford Shirt', 'Dark Indigo Jeans', 'Chelsea Boots in Tan Suede'] },
          ],
        }),
      },
      { role: 'user', content: 'I don\'t want to wear jeans. No jeans please.' },
      {
        role: 'assistant',
        content: JSON.stringify({
          message: 'Got it, I\'ll avoid jeans. Here are alternatives.',
          outfits: [
            { vibe: 'Polished Casual', items: ['Light Blue Linen Shirt', 'Tan Chinos', 'Chelsea Boots in Tan Suede'] },
          ],
        }),
      },
    ],
    expectedPass: true,
    tags: ['constraint', 'feedback', 'refinement', 'no-jeans'],
  },

  {
    id: 'tops_heavy_imbalance',
    request: 'What can I wear today? Just something casual.',
    wardrobeItems: TOPS_HEAVY_WARDROBE,
    profile: null,
    weather: null,
    conversationHistory: [],
    // With only 1 bottom and 1 shoe, the system should produce fewer (but coherent) outfits
    expectedPass: true,
    tags: ['casual', 'tops-heavy', 'wardrobe-stress', 'limited-bottoms'],
  },
];
