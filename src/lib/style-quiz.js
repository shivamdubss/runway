// Style Quiz Questions & DNA Computation
// Extracted as a module for testability

export const STYLE_QUIZ_QUESTIONS = [
  {
    id: "everyday_vibe",
    title: "Your everyday vibe",
    subtitle: "Pick the look that feels most like you on a regular day.",
    options: [
      {
        value: "classic",
        label: "Polished & Classic",
        description: "Tailored blazers, crisp shirts, timeless pieces",
        image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=500&fit=crop",
        traits: ["classic", "professional", "structured"],
      },
      {
        value: "relaxed",
        label: "Relaxed & Effortless",
        description: "Soft knits, easy layers, lived-in comfort",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
        traits: ["casual", "relaxed", "comfortable"],
      },
      {
        value: "edgy",
        label: "Bold & Edgy",
        description: "Leather, dark tones, statement pieces",
        image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
        traits: ["edgy", "bold", "statement"],
      },
      {
        value: "minimal",
        label: "Clean & Minimal",
        description: "Neutral palette, clean lines, less is more",
        image: "https://images.unsplash.com/photo-1434389677669-e08b4cda3e40?w=400&h=500&fit=crop",
        traits: ["minimalist", "clean", "neutral"],
      },
    ],
  },
  {
    id: "color_world",
    title: "Your color world",
    subtitle: "Which palette do you reach for most?",
    options: [
      {
        value: "neutrals",
        label: "Neutrals & Monochromes",
        description: "Black, white, grey, beige, navy",
        image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=500&fit=crop",
        traits: ["neutrals", "monochrome"],
      },
      {
        value: "earth",
        label: "Earth & Warm Tones",
        description: "Olive, rust, camel, burgundy, terracotta",
        image: "https://images.unsplash.com/photo-1511401139252-f158d3209c9c?w=400&h=500&fit=crop",
        traits: ["earth-tones", "warm"],
      },
      {
        value: "bold",
        label: "Bold & Vibrant",
        description: "Rich jewel tones, saturated hues, confident color",
        image: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&h=500&fit=crop",
        traits: ["bold", "jewel-tones"],
      },
      {
        value: "soft",
        label: "Soft & Muted",
        description: "Pastels, dusty rose, sage, lavender",
        image: "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=400&h=500&fit=crop",
        traits: ["pastels", "soft"],
      },
    ],
  },
  {
    id: "weekend_mood",
    title: "Saturday plans",
    subtitle: "You're heading out for the day. What are you wearing?",
    options: [
      {
        value: "athleisure",
        label: "Athleisure Chic",
        description: "Sneakers, joggers, sporty layers that look intentional",
        image: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=400&h=500&fit=crop",
        traits: ["sporty", "casual", "comfortable"],
      },
      {
        value: "boho",
        label: "Free-Spirited Boho",
        description: "Flowing fabrics, prints, layered accessories",
        image: "https://images.unsplash.com/photo-1536243298747-ea8874136d64?w=400&h=500&fit=crop",
        traits: ["bohemian", "romantic", "layered"],
      },
      {
        value: "smart_casual",
        label: "Elevated Casual",
        description: "Nice jeans, a great top, polished but not trying too hard",
        image: "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=400&h=500&fit=crop",
        traits: ["classic", "casual", "polished"],
      },
      {
        value: "street",
        label: "Street Style",
        description: "Graphic tees, oversized fits, sneaker culture",
        image: "https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=400&h=500&fit=crop",
        traits: ["edgy", "casual", "streetwear"],
      },
    ],
  },
  {
    id: "dress_up",
    title: "Getting dressed up",
    subtitle: "You have a special evening out. What's your go-to?",
    options: [
      {
        value: "sleek",
        label: "Sleek & Modern",
        description: "Minimalist silhouettes, monochrome, sharp tailoring",
        image: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400&h=500&fit=crop",
        traits: ["minimalist", "professional", "structured"],
      },
      {
        value: "glamorous",
        label: "Head-Turning Glam",
        description: "Statement pieces, bold color, all eyes on you",
        image: "https://images.unsplash.com/photo-1518577915332-c2a19f149a75?w=400&h=500&fit=crop",
        traits: ["bold", "statement", "glamorous"],
      },
      {
        value: "romantic",
        label: "Soft & Romantic",
        description: "Flowing fabrics, soft colors, feminine details",
        image: "https://images.unsplash.com/photo-1495385794356-15371f348c31?w=400&h=500&fit=crop",
        traits: ["romantic", "soft", "feminine"],
      },
      {
        value: "cool",
        label: "Effortlessly Cool",
        description: "Leather jacket over a dress, boots, understated edge",
        image: "https://images.unsplash.com/photo-1475180098004-ca77a66827be?w=400&h=500&fit=crop",
        traits: ["edgy", "casual", "cool"],
      },
    ],
  },
  {
    id: "pattern_feel",
    title: "Patterns & prints",
    subtitle: "How do you feel about patterns?",
    options: [
      {
        value: "love",
        label: "The More the Better",
        description: "Florals, stripes, plaid — bring it on",
        image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&h=500&fit=crop",
        traits: ["bold", "expressive", "pattern-lover"],
      },
      {
        value: "subtle",
        label: "Subtle & Strategic",
        description: "One patterned piece to anchor the outfit",
        image: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?w=400&h=500&fit=crop",
        traits: ["balanced", "intentional"],
      },
      {
        value: "solids",
        label: "Solid Colors Only",
        description: "Clean blocks of color, no prints needed",
        image: "https://images.unsplash.com/photo-1507680434567-5739c80be1ac?w=400&h=500&fit=crop",
        traits: ["minimalist", "clean", "solid"],
      },
    ],
  },
  {
    id: "fit_silhouette",
    title: "Your ideal fit",
    subtitle: "What silhouette makes you feel best?",
    options: [
      {
        value: "tailored",
        label: "Tailored & Fitted",
        description: "Structured, defined shape, close to the body",
        image: "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=400&h=500&fit=crop",
        traits: ["structured", "fitted", "tailored"],
      },
      {
        value: "relaxed",
        label: "Relaxed & Flowy",
        description: "Loose fits, draped fabrics, room to breathe",
        image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
        traits: ["relaxed", "flowy", "comfortable"],
      },
      {
        value: "oversized",
        label: "Oversized & Architectural",
        description: "Big silhouettes, volume play, fashion-forward",
        image: "https://images.unsplash.com/photo-1475180098004-ca77a66827be?w=400&h=500&fit=crop",
        traits: ["oversized", "bold", "fashion-forward"],
      },
      {
        value: "mixed",
        label: "Mix & Balance",
        description: "Loose top with fitted bottom, or vice versa",
        image: "https://images.unsplash.com/photo-1434389677669-e08b4cda3e40?w=400&h=500&fit=crop",
        traits: ["balanced", "versatile"],
      },
    ],
  },
];

const ARCHETYPE_MAP = {
  minimalist: "Modern Minimalist", clean: "Modern Minimalist", neutral: "Modern Minimalist", solid: "Modern Minimalist",
  classic: "Classic Sophisticate", professional: "Classic Sophisticate", polished: "Classic Sophisticate", tailored: "Classic Sophisticate", structured: "Classic Sophisticate",
  bold: "Bold Creative", statement: "Bold Creative", expressive: "Bold Creative", "pattern-lover": "Bold Creative", glamorous: "Bold Creative", "fashion-forward": "Bold Creative",
  casual: "Relaxed Natural", relaxed: "Relaxed Natural", comfortable: "Relaxed Natural", sporty: "Relaxed Natural", flowy: "Relaxed Natural",
  romantic: "Romantic Dreamer", soft: "Romantic Dreamer", feminine: "Romantic Dreamer", pastels: "Romantic Dreamer", bohemian: "Romantic Dreamer", layered: "Romantic Dreamer",
  edgy: "Urban Edge", streetwear: "Urban Edge", cool: "Urban Edge", oversized: "Urban Edge",
};

const ARCHETYPE_DESCRIPTIONS = {
  "Modern Minimalist": "You gravitate toward clean lines, neutral palettes, and intentional simplicity. Every piece in your wardrobe earns its place.",
  "Classic Sophisticate": "You appreciate timeless elegance and polished tailoring. Your style communicates confidence and refinement.",
  "Bold Creative": "You see fashion as self-expression. You're drawn to color, pattern, and pieces that make a statement.",
  "Relaxed Natural": "Comfort is your compass, but you make it look good. You prefer easy-wearing pieces that feel as good as they look.",
  "Romantic Dreamer": "You love soft textures, flowing silhouettes, and feminine details. Your wardrobe has an effortless, poetic quality.",
  "Urban Edge": "You bring attitude to everything you wear. Dark tones, unexpected silhouettes, and a downtown-cool energy define your look.",
};

const ARCHETYPE_STYLE_MAP = {
  "Modern Minimalist": ["minimalist"],
  "Classic Sophisticate": ["classic", "professional"],
  "Bold Creative": ["edgy", "bohemian"],
  "Relaxed Natural": ["casual", "sporty"],
  "Romantic Dreamer": ["romantic", "bohemian"],
  "Urban Edge": ["edgy", "casual"],
};

const COLOR_ANSWER_MAP = {
  neutrals: ["neutrals", "monochrome"],
  earth: ["earth-tones", "neutrals"],
  bold: ["bold", "jewel-tones"],
  soft: ["pastels"],
};

export function computeStyleDnaFromQuiz(answers) {
  const traitCounts = {};
  for (const question of STYLE_QUIZ_QUESTIONS) {
    const answer = answers[question.id];
    if (!answer) continue;
    const option = question.options.find(o => o.value === answer);
    if (!option) continue;
    for (const trait of option.traits) {
      traitCounts[trait] = (traitCounts[trait] || 0) + 1;
    }
  }

  const sorted = Object.entries(traitCounts).sort((a, b) => b[1] - a[1]);
  const topTraits = sorted.slice(0, 5).map(([trait]) => trait);

  const archetypeScores = {
    "Modern Minimalist": 0,
    "Classic Sophisticate": 0,
    "Bold Creative": 0,
    "Relaxed Natural": 0,
    "Romantic Dreamer": 0,
    "Urban Edge": 0,
  };

  for (const [trait, count] of Object.entries(traitCounts)) {
    const archetype = ARCHETYPE_MAP[trait];
    if (archetype) archetypeScores[archetype] += count;
  }

  const sortedArchetypes = Object.entries(archetypeScores).sort((a, b) => b[1] - a[1]);
  const primary = sortedArchetypes[0];
  const secondary = sortedArchetypes[1];

  const preferredStyles = [...new Set([
    ...(ARCHETYPE_STYLE_MAP[primary[0]] || []),
    ...(secondary[1] > 0 ? (ARCHETYPE_STYLE_MAP[secondary[0]] || []) : []),
  ])];

  const colorAnswer = answers.color_world;
  const colorPreferences = COLOR_ANSWER_MAP[colorAnswer] || ["neutrals"];

  return {
    completedAt: new Date().toISOString(),
    answers,
    primaryArchetype: primary[0],
    secondaryArchetype: secondary[1] > 0 ? secondary[0] : null,
    description: ARCHETYPE_DESCRIPTIONS[primary[0]],
    topTraits,
    derivedStyles: preferredStyles,
    derivedColors: colorPreferences,
  };
}
