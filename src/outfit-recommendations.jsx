import { useState, useEffect, useRef, useCallback } from "react";

const QUICK_CHIPS = [
  { label: "Dinner party", icon: "🍽️" },
  { label: "Date night", icon: "🌙" },
  { label: "Job interview", icon: "💼" },
  { label: "Weekend brunch", icon: "☀️" },
  { label: "Wedding guest", icon: "💐" },
];

const WARDROBE_ITEMS = {
  Tops: [
    { label: "Top", name: "Cream Silk Camisole", color: "#F5EDE3", accent: "#E8D5C0", emoji: "🤍" },
    { label: "Top", name: "White Fitted Turtleneck", color: "#F8F6F2", accent: "#EBE7E0", emoji: "🤍" },
    { label: "Top", name: "Black Wrap Bodysuit", color: "#1A1A1A", accent: "#2A2A2A", emoji: "🖤" },
    { label: "Top", name: "Navy Breton Stripe Tee", color: "#2C3E6B", accent: "#1E2D52", emoji: "👕" },
    { label: "Top", name: "Ivory Linen Button-Down", color: "#F0E8D8", accent: "#E3D9C5", emoji: "👔" },
    { label: "Top", name: "Olive Ribbed Tank", color: "#6B7B5E", accent: "#5A6A4E", emoji: "🫒" },
    { label: "Top", name: "Dusty Rose Blouse", color: "#D4A0A0", accent: "#C48E8E", emoji: "🌸" },
    { label: "Top", name: "Charcoal Cashmere Sweater", color: "#4A4A4A", accent: "#3A3A3A", emoji: "🧶" },
  ],
  Layers: [
    { label: "Layer", name: "Camel Wool Coat", color: "#C4A574", accent: "#B08D5B", emoji: "🧥" },
    { label: "Layer", name: "Black Leather Jacket", color: "#1A1A1A", accent: "#2A2A2A", emoji: "🧥" },
    { label: "Layer", name: "Navy Blazer", color: "#2C3E6B", accent: "#1E2D52", emoji: "🧥" },
    { label: "Layer", name: "Cream Chunky Cardigan", color: "#F0E8D8", accent: "#E3D9C5", emoji: "🧶" },
    { label: "Layer", name: "Classic Denim Jacket", color: "#7B9CC0", accent: "#6A8AB0", emoji: "🧥" },
    { label: "Layer", name: "Taupe Trench Coat", color: "#B0A090", accent: "#9E8E7E", emoji: "🧥" },
  ],
  Bottoms: [
    { label: "Bottom", name: "Wide-Leg Black Trousers", color: "#2A2A2A", accent: "#1A1A1A", emoji: "👖" },
    { label: "Bottom", name: "Midi Satin Skirt (Sage)", color: "#A8B5A0", accent: "#96A68D", emoji: "👗" },
    { label: "Bottom", name: "Leather Look Midi Skirt", color: "#3A2A2A", accent: "#2A1A1A", emoji: "👗" },
    { label: "Bottom", name: "Medium Wash Straight Jeans", color: "#7B9CC0", accent: "#6A8AB0", emoji: "👖" },
    { label: "Bottom", name: "Cream Tailored Shorts", color: "#F0E8D8", accent: "#E3D9C5", emoji: "🩳" },
    { label: "Bottom", name: "Navy Pleated Midi Skirt", color: "#2C3E6B", accent: "#1E2D52", emoji: "👗" },
    { label: "Bottom", name: "Olive Cargo Pants", color: "#6B7B5E", accent: "#5A6A4E", emoji: "👖" },
  ],
  Shoes: [
    { label: "Shoes", name: "Pointed Nude Heels", color: "#D4B896", accent: "#C4A882", emoji: "👠" },
    { label: "Shoes", name: "Strappy Block Heels", color: "#2A2A2A", accent: "#1A1A1A", emoji: "👡" },
    { label: "Shoes", name: "Black Ankle Boots", color: "#1A1A1A", accent: "#2A2A2A", emoji: "👢" },
    { label: "Shoes", name: "White Leather Sneakers", color: "#F8F6F2", accent: "#EBE7E0", emoji: "👟" },
    { label: "Shoes", name: "Tan Suede Loafers", color: "#C4A574", accent: "#B08D5B", emoji: "👞" },
    { label: "Shoes", name: "Gold Strappy Sandals", color: "#D4A843", accent: "#C49832", emoji: "👡" },
  ],
  Accessories: [
    { label: "Accessories", name: "Gold Hoops + Chain Bag", color: "#D4A843", accent: "#C49832", emoji: "👜" },
    { label: "Accessories", name: "Pearl Studs + Clutch", color: "#F0EBE3", accent: "#E0D8CC", emoji: "👛" },
    { label: "Accessories", name: "Statement Earrings + Red Lip", color: "#C85A5A", accent: "#B84A4A", emoji: "💄" },
    { label: "Accessories", name: "Silk Scarf (Navy)", color: "#2C3E6B", accent: "#1E2D52", emoji: "🧣" },
    { label: "Accessories", name: "Tan Leather Belt", color: "#C4A574", accent: "#B08D5B", emoji: "🪢" },
    { label: "Accessories", name: "Black Structured Tote", color: "#1A1A1A", accent: "#2A2A2A", emoji: "👜" },
    { label: "Accessories", name: "Layered Gold Necklaces", color: "#D4A843", accent: "#C49832", emoji: "✨" },
  ],
};

const SAMPLE_OUTFITS = [
  {
    id: 1,
    vibe: "Effortless Chic",
    items: [
      { label: "Top", name: "Cream Silk Camisole", color: "#F5EDE3", accent: "#E8D5C0", emoji: "🤍" },
      { label: "Layer", name: "Camel Wool Coat", color: "#C4A574", accent: "#B08D5B", emoji: "🧥" },
      { label: "Bottom", name: "Wide-Leg Black Trousers", color: "#2A2A2A", accent: "#1A1A1A", emoji: "👖" },
      { label: "Shoes", name: "Pointed Nude Heels", color: "#D4B896", accent: "#C4A882", emoji: "👠" },
      { label: "Accessories", name: "Gold Hoops + Chain Bag", color: "#D4A843", accent: "#C49832", emoji: "👜" },
    ],
    reasoning:
      "The silk cami with wide-leg trousers creates a sleek line that the camel coat wraps up beautifully. Nude heels elongate without competing, and the gold accessories tie the warm tones together.",
  },
  {
    id: 2,
    vibe: "Soft & Elevated",
    items: [
      { label: "Top", name: "White Fitted Turtleneck", color: "#F8F6F2", accent: "#EBE7E0", emoji: "🤍" },
      { label: "Bottom", name: "Midi Satin Skirt (Sage)", color: "#A8B5A0", accent: "#96A68D", emoji: "👗" },
      { label: "Shoes", name: "Strappy Block Heels", color: "#2A2A2A", accent: "#1A1A1A", emoji: "👡" },
      { label: "Accessories", name: "Pearl Studs + Clutch", color: "#F0EBE3", accent: "#E0D8CC", emoji: "👛" },
    ],
    reasoning:
      "The turtleneck tucked into the satin midi gives a polished, feminine shape. Sage and white feel fresh for evening, and the black heels anchor it. Pearls keep the accessories understated.",
  },
  {
    id: 3,
    vibe: "Bold Night Out",
    items: [
      { label: "Top", name: "Black Wrap Bodysuit", color: "#1A1A1A", accent: "#2A2A2A", emoji: "🖤" },
      { label: "Bottom", name: "Leather Look Midi Skirt", color: "#3A2A2A", accent: "#2A1A1A", emoji: "👗" },
      { label: "Shoes", name: "Black Ankle Boots", color: "#1A1A1A", accent: "#2A2A2A", emoji: "👢" },
      { label: "Accessories", name: "Statement Earrings + Red Lip", color: "#C85A5A", accent: "#B84A4A", emoji: "💄" },
    ],
    reasoning:
      "All-black base lets the texture contrast do the work: matte bodysuit against the leather skirt. Ankle boots keep it edgy. The statement earrings and a red lip are the only color you need.",
  },
];

const CHAT_HISTORY = [
  { id: "chat-1", title: "Dinner party outfit", subtitle: "Semi-casual, evening vibe", timestamp: "Just now", starred: true },
  { id: "chat-2", title: "Beach vacation looks", subtitle: "Resort wear for Tulum trip", timestamp: "Yesterday", starred: true },
  { id: "chat-3", title: "Job interview outfit", subtitle: "Business casual, creative field", timestamp: "2 days ago", starred: false },
  { id: "chat-4", title: "Date night options", subtitle: "Romantic dinner downtown", timestamp: "Last week", starred: false },
  { id: "chat-5", title: "Wedding guest dress", subtitle: "Outdoor spring wedding", timestamp: "Last week", starred: false },
  { id: "chat-6", title: "Casual Friday at work", subtitle: "Relaxed but polished", timestamp: "2 weeks ago", starred: false },
];

function Lightbox({ item, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-lightbox-padding)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "var(--lightbox-max-width)",
          borderRadius: 24,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          animation: "scaleIn 0.25s ease",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 1,
            width: "var(--lightbox-close-size)",
            height: "var(--lightbox-close-size)",
            borderRadius: "calc(var(--lightbox-close-size) / 2)",
            border: "none",
            background: "rgba(0,0,0,0.4)",
            color: "#fff",
            fontSize: "var(--font-icon)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
        <div style={{
          width: "100%",
          aspectRatio: "3 / 4",
          background: "#F3F2F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--font-lightbox-emoji)",
        }}>
          <span>{item.emoji}</span>
        </div>
        <div style={{ padding: "16px var(--container-padding-x) var(--container-padding-x)" }}>
          <div style={{
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#aaa",
            marginBottom: 4,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {item.label}
          </div>
          <div style={{
            fontSize: "var(--font-lightbox-title)",
            fontWeight: 600,
            color: "#1A1A1A",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.25,
          }}>
            {item.name}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: "var(--card-border-radius)",
        overflow: "hidden",
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        cursor: "pointer",
        transition: "transform 0.15s ease",
      }}
      onPointerDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
      onPointerUp={(e) => e.currentTarget.style.transform = "scale(1)"}
      onPointerLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
    >
      {/* Image area */}
      <div style={{
        width: "100%",
        height: "var(--card-image-height)",
        background: "#F3F2F0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "var(--card-emoji-size)",
      }}>
        <span>{item.emoji}</span>
      </div>

      {/* Text strip */}
      <div style={{
        padding: "var(--space-card-padding)",
        display: "flex",
        alignItems: "baseline",
        gap: 8,
      }}>
        <span style={{
          fontSize: "var(--font-label-sm)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "#b0b0b0",
          fontFamily: "'DM Sans', sans-serif",
          flexShrink: 0,
        }}>
          {item.label}
        </span>
        <span style={{
          fontSize: "var(--font-item-name)",
          fontWeight: 600,
          color: "#222",
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {item.name}
        </span>
      </div>
    </div>
  );
}

function OutfitView({ outfit, onItemClick }) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  return (
    <div style={{
      width: "100%",
      flexShrink: 0,
      padding: `0 var(--container-padding-x)`,
      boxSizing: "border-box",
    }}>
      <div className="item-card-grid">
        {outfit.items.map((item, i) => (
          <ItemCard key={i} item={item} onClick={() => onItemClick(item)} />
        ))}
      </div>

      <div
        onClick={() => setReasoningExpanded(!reasoningExpanded)}
        style={{
          marginTop: "var(--space-reasoning-margin-top)",
          padding: "var(--space-reasoning-padding)",
          background: reasoningExpanded ? "rgba(0,0,0,0.02)" : "transparent",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.06)",
          cursor: "pointer",
          transition: "all 0.25s ease",
          marginBottom: 24,
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{
            fontSize: "var(--font-label-md)",
            fontWeight: 600,
            color: "#aaa",
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Why this works
          </span>
          <span style={{
            fontSize: "var(--font-reasoning)",
            color: "#ccc",
            transform: reasoningExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.25s ease",
            display: "inline-block",
          }}>
            ▾
          </span>
        </div>
        {reasoningExpanded && (
          <p style={{
            fontSize: "var(--font-reasoning)",
            lineHeight: 1.55,
            color: "#777",
            fontFamily: "'DM Sans', sans-serif",
            marginTop: 8,
            marginBottom: 0,
          }}>
            {outfit.reasoning}
          </p>
        )}
      </div>
    </div>
  );
}

function OutfitEmptyState({ onSwitchToChat }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      padding: "40px 32px",
      textAlign: "center",
    }}>
      <span style={{ fontSize: 48, marginBottom: 4 }}>✨</span>
      <span style={{
        fontSize: "var(--font-title)",
        fontFamily: "'Instrument Serif', serif",
        fontWeight: 400,
        color: "#1A1A1A",
        lineHeight: 1.2,
      }}>
        Your outfits will appear here
      </span>
      <span style={{
        fontSize: "var(--font-body)",
        fontFamily: "'DM Sans', sans-serif",
        color: "#999",
        maxWidth: 260,
        lineHeight: 1.5,
      }}>
        Start a conversation and I'll curate looks from your wardrobe.
      </span>
      <button
        onClick={onSwitchToChat}
        style={{
          marginTop: 8,
          height: 44,
          padding: "0 28px",
          borderRadius: 22,
          border: "none",
          background: "#1A1A1A",
          color: "#fff",
          fontSize: "var(--font-body)",
          fontWeight: 600,
          fontFamily: "'DM Sans', sans-serif",
          cursor: "pointer",
          transition: "all 0.15s ease",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
        onPointerDown={(e) => e.currentTarget.style.transform = "scale(0.97)"}
        onPointerUp={(e) => e.currentTarget.style.transform = "scale(1)"}
        onPointerLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
        Start styling
      </button>
    </div>
  );
}

function WardrobeView({ onItemClick }) {
  const [activeFilter, setActiveFilter] = useState("All");
  const categories = ["All", ...Object.keys(WARDROBE_ITEMS)];
  const filteredEntries = activeFilter === "All"
    ? Object.entries(WARDROBE_ITEMS)
    : [[activeFilter, WARDROBE_ITEMS[activeFilter]]];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Filter pills */}
      <div
        className="wardrobe-filter-row"
        style={{
          display: "flex",
          gap: 8,
          padding: `8px var(--container-padding-x) 12px`,
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {categories.map((cat) => {
          const isActive = activeFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 16,
                border: isActive ? "none" : "1px solid rgba(0,0,0,0.08)",
                background: isActive ? "#1A1A1A" : "#fff",
                color: isActive ? "#fff" : "#555",
                fontSize: "var(--font-body)",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Items grid */}
      <div
        className="outfit-scroll-panel"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: `0 var(--container-padding-x) calc(24px + var(--safe-bottom))`,
        }}
      >
        {filteredEntries.map(([category, items]) => (
          <div key={category} style={{ marginBottom: 24 }}>
            {activeFilter === "All" && (
              <div style={{
                fontSize: "var(--font-label-sm)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#aaa",
                fontFamily: "'DM Sans', sans-serif",
                padding: "12px 0 8px",
              }}>
                {category}
                <span style={{ fontWeight: 400, marginLeft: 6, color: "#ccc" }}>
                  {items.length}
                </span>
              </div>
            )}
            <div className="item-card-grid">
              {items.map((item, i) => (
                <ItemCard key={i} item={item} onClick={() => onItemClick(item)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatView({ messages, inputValue, setInputValue, onSend, onChipTap, onCtaAction }) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
    }}>
      <div
        className="chat-messages"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "8px var(--space-chat-padding-x)",
        }}
      >
        {messages.length === 0 ? (
          <div style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "40px 20px",
          }}>
            <span style={{ fontSize: 40 }}>👗</span>
            <span style={{
              fontSize: "var(--font-title)",
              fontFamily: "'Instrument Serif', serif",
              fontWeight: 400,
              color: "#1A1A1A",
            }}>
              What are we styling?
            </span>
            <span style={{
              fontSize: "var(--font-body)",
              fontFamily: "'DM Sans', sans-serif",
              color: "#999",
              textAlign: "center",
              maxWidth: 260,
              lineHeight: 1.5,
            }}>
              Describe the occasion and I'll pull outfit options from your wardrobe.
            </span>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 8,
              marginTop: 20,
              maxWidth: 320,
            }}>
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => onChipTap(chip.label)}
                  style={{
                    height: 36,
                    padding: "0 16px",
                    borderRadius: 18,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "#fff",
                    color: "#555",
                    fontSize: "var(--font-body)",
                    fontWeight: 500,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.style.transform = "scale(0.95)";
                    e.currentTarget.style.background = "#F3F2F0";
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "#fff";
                  }}
                  onPointerLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  <span style={{ fontSize: 14 }}>{chip.icon}</span>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
              }}
            >
              <div style={{
                padding: "var(--space-reasoning-padding)",
                borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: msg.role === "user" ? "#1A1A1A" : "#fff",
                color: msg.role === "user" ? "#fff" : "#333",
                fontSize: "var(--font-chat)",
                lineHeight: 1.5,
                fontFamily: "'DM Sans', sans-serif",
                border: msg.role === "user" ? "none" : "1px solid rgba(0,0,0,0.06)",
                boxShadow: msg.role === "user" ? "none" : "0 1px 3px rgba(0,0,0,0.03)",
              }}>
                {msg.text}
              </div>
              {msg.cta && (
                <button
                  onClick={() => onCtaAction(msg.cta.action)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    height: 48,
                    borderRadius: 14,
                    border: "none",
                    background: "#1A1A1A",
                    color: "#fff",
                    fontSize: "var(--font-body)",
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.15s ease",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.style.transform = "scale(0.97)";
                    e.currentTarget.style.background = "#333";
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "#1A1A1A";
                  }}
                  onPointerLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "#1A1A1A";
                  }}
                >
                  <span style={{ fontSize: 16 }}>👗</span>
                  {msg.cta.label}
                  <span style={{ fontSize: 14, opacity: 0.7 }}>→</span>
                </button>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{
        flexShrink: 0,
        padding: "8px var(--space-chat-padding-x) calc(var(--space-chat-input-pb) + var(--safe-bottom))",
        background: "#FAFAF8",
      }}>
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}>
          <input
            type="text"
            className="chat-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
            placeholder="Type a message..."
            style={{
              flex: 1,
              height: "var(--input-height)",
              borderRadius: "calc(var(--input-height) / 2)",
              border: "1px solid rgba(0,0,0,0.09)",
              background: "#fff",
              color: "#333",
              fontSize: "var(--font-chat)",
              padding: "0 var(--container-padding-x)",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
          <button
            onClick={onSend}
            style={{
              width: "var(--input-height)",
              height: "var(--input-height)",
              borderRadius: "calc(var(--input-height) / 2)",
              border: "none",
              background: inputValue.trim() ? "#1A1A1A" : "#EEEDEB",
              color: inputValue.trim() ? "#fff" : "#ccc",
              cursor: inputValue.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-icon)",
              transition: "all 0.2s ease",
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatHistoryItem({ chat }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        cursor: "pointer",
        transition: "background 0.15s ease",
      }}
      onPointerDown={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.04)"}
      onPointerUp={(e) => e.currentTarget.style.background = "transparent"}
      onPointerLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div style={{
        fontSize: "var(--font-body)",
        fontWeight: 600,
        color: "#1A1A1A",
        fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1.3,
        marginBottom: 2,
      }}>
        {chat.title}
      </div>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{
          fontSize: "var(--font-caption)",
          color: "#999",
          fontFamily: "'DM Sans', sans-serif",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          marginRight: 8,
        }}>
          {chat.subtitle}
        </span>
        <span style={{
          fontSize: "var(--font-caption)",
          color: "#c0c0c0",
          fontFamily: "'DM Sans', sans-serif",
          flexShrink: 0,
        }}>
          {chat.timestamp}
        </span>
      </div>
    </div>
  );
}

function SidePanel({ isOpen, onClose, onNewChat, onOpenWardrobe }) {
  const starredChats = CHAT_HISTORY.filter((c) => c.starred);
  const recentChats = CHAT_HISTORY.filter((c) => !c.starred);

  return (
    <>
      <div
        className={`side-panel-overlay${isOpen ? " side-panel-overlay--open" : ""}`}
        onClick={onClose}
      />
      <div className={`side-panel${isOpen ? " side-panel--open" : ""}`}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `calc(var(--space-top-bar) + var(--safe-top)) 16px 0`,
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: "var(--font-title)",
            fontFamily: "'Instrument Serif', serif",
            fontWeight: 400,
            color: "#1A1A1A",
          }}>
            Runway
          </span>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              border: "none",
              background: "rgba(0,0,0,0.05)",
              color: "#666",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* New Chat */}
        <div style={{ padding: "20px 16px 0" }}>
          <button
            onClick={onNewChat}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "#fff",
              color: "#1A1A1A",
              fontSize: "var(--font-body)",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "background 0.15s ease",
            }}
            onPointerDown={(e) => e.currentTarget.style.background = "#F3F2F0"}
            onPointerUp={(e) => e.currentTarget.style.background = "#fff"}
            onPointerLeave={(e) => e.currentTarget.style.background = "#fff"}
          >
            <span style={{ fontSize: 16, fontWeight: 300 }}>+</span>
            New Chat
          </button>
        </div>

        {/* Full Wardrobe CTA */}
        <div style={{ padding: "10px 16px 8px" }}>
          <button
            onClick={onOpenWardrobe}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: "none",
              background: "#1A1A1A",
              color: "#fff",
              fontSize: "var(--font-body)",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "opacity 0.2s ease",
            }}
          >
            <span style={{ fontSize: 18 }}>👗</span>
            Full Wardrobe
          </button>
        </div>

        {/* Scrollable chat list */}
        <div className="side-panel-scroll" style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 0",
        }}>
          {starredChats.length > 0 && (
            <div>
              <div style={{
                padding: "12px 16px 6px",
                fontSize: "var(--font-label-sm)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#aaa",
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Starred
              </div>
              {starredChats.map((chat) => (
                <ChatHistoryItem key={chat.id} chat={chat} />
              ))}
            </div>
          )}

          {recentChats.length > 0 && (
            <div>
              <div style={{
                padding: "16px 16px 6px",
                fontSize: "var(--font-label-sm)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#aaa",
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Recents
              </div>
              {recentChats.map((chat) => (
                <ChatHistoryItem key={chat.id} chat={chat} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function OutfitRecommendations() {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("chat");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lightboxItem, setLightboxItem] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const chatSessionRef = useRef(0);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidePanelOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidePanelOpen]);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === "Escape") setSidePanelOpen(false); };
    if (sidePanelOpen) window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [sidePanelOpen]);

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
    setIsDragging(true);
  };
  const handleTouchMove = (e) => {
    if (touchStart === null) return;
    setTouchDelta(e.touches[0].clientX - touchStart);
  };
  const handleTouchEnd = () => {
    if (Math.abs(touchDelta) > 60) {
      if (touchDelta < 0 && current < outfits.length - 1) setCurrent(current + 1);
      else if (touchDelta > 0 && current > 0) setCurrent(current - 1);
    }
    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  };

  const handleSendMessage = useCallback((text) => {
    const messageText = text || inputValue.trim();
    if (!messageText || isGenerating) return;

    const isFirstMessage = messages.length === 0;
    const sessionId = chatSessionRef.current;

    setMessages((prev) => [...prev, { role: "user", text: messageText }]);
    setInputValue("");

    if (isFirstMessage) {
      setIsGenerating(true);

      setTimeout(() => {
        if (chatSessionRef.current !== sessionId) return;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Love it! Let me pull some looks together for you..." },
        ]);
      }, 600);

      setTimeout(() => {
        if (chatSessionRef.current !== sessionId) return;
        setOutfits(SAMPLE_OUTFITS);
        setCurrent(0);
        setIsGenerating(false);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Here are 3 outfit options from your wardrobe. Swipe through them and let me know what you think, or tell me what to change.", cta: { label: "View Outfits", action: "navigate_outfits" } },
        ]);
      }, 2000);
    } else {
      setTimeout(() => {
        if (chatSessionRef.current !== sessionId) return;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Got it! I'll rework the recommendations. Give me a moment..." },
        ]);
      }, 500);
    }
  }, [inputValue, isGenerating, messages.length]);

  const handleSend = () => handleSendMessage(inputValue.trim());
  const handleChipTap = (label) => handleSendMessage(label);

  const handleNewChat = () => {
    chatSessionRef.current += 1;
    setMessages([]);
    setOutfits([]);
    setCurrent(0);
    setSelected(null);
    setInputValue("");
    setIsGenerating(false);
    setView("chat");
    setSidePanelOpen(false);
  };

  const isSelected = outfits.length > 0 && selected === outfits[current]?.id;

  return (
    <div style={{
      width: "100%",
      maxWidth: "var(--container-max-width)",
      margin: "0 auto",
      height: "var(--app-height)",
      background: "#FAFAF8",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      fontFamily: "'DM Sans', sans-serif",
      position: "relative",
    }}>
      {lightboxItem && (
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} />
      )}

      <SidePanel isOpen={sidePanelOpen} onClose={() => setSidePanelOpen(false)} onNewChat={handleNewChat} onOpenWardrobe={() => { setView("wardrobe"); setSidePanelOpen(false); }} />

      {/* Top bar */}
      <div style={{
        padding: `calc(var(--space-top-bar) + var(--safe-top)) var(--container-padding-x) 0`,
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "var(--space-header-mb)",
        }}>
          <button
            onClick={() => setSidePanelOpen(true)}
            aria-label="Open menu"
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              padding: 8,
              flexShrink: 0,
              marginRight: 8,
            }}
          >
            <span style={{ display: "block", width: 20, height: 2, background: "#1A1A1A", borderRadius: 1 }} />
            <span style={{ display: "block", width: 20, height: 2, background: "#1A1A1A", borderRadius: 1 }} />
            <span style={{ display: "block", width: 14, height: 2, background: "#1A1A1A", borderRadius: 1 }} />
          </button>
          <h1 style={{
            fontSize: "var(--font-title)",
            fontWeight: 400,
            color: "#1A1A1A",
            margin: 0,
            fontFamily: "'Instrument Serif', serif",
            lineHeight: 1.1,
            flex: 1,
          }}>
            {view === "wardrobe" ? "My Wardrobe" : view === "outfit" ? (outfits.length > 0 ? outfits[current].vibe : "Outfits") : "Chat"}
          </h1>

          <div style={{
            display: "flex",
            background: "#F0EFED",
            borderRadius: 20,
            padding: 3,
            flexShrink: 0,
          }}>
            <button
              onClick={() => setView("chat")}
              style={{
                height: "var(--tab-height)",
                padding: `0 var(--tab-padding-x)`,
                borderRadius: "calc(var(--tab-height) / 2)",
                border: "none",
                background: view === "chat" ? "#fff" : "transparent",
                color: view === "chat" ? "#1A1A1A" : "#999",
                fontSize: "var(--font-tab)",
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: view === "chat" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              Chat
            </button>
            <button
              onClick={() => setView("outfit")}
              style={{
                height: "var(--tab-height)",
                padding: `0 var(--tab-padding-x)`,
                borderRadius: "calc(var(--tab-height) / 2)",
                border: "none",
                background: view === "outfit" ? "#fff" : "transparent",
                color: view === "outfit" ? "#1A1A1A" : "#999",
                fontSize: "var(--font-tab)",
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: view === "outfit" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              Outfits
            </button>
          </div>
        </div>

        {view === "outfit" && outfits.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: "var(--space-dots-mb)",
          }}>
            {outfits.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                style={{
                  width: current === i ? "var(--dot-active-width)" : "var(--dot-size)",
                  height: "var(--dot-size)",
                  borderRadius: "calc(var(--dot-size) / 2)",
                  background: current === i ? "#1A1A1A" : "rgba(0,0,0,0.1)",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
              />
            ))}
            <span style={{ fontSize: "var(--font-caption)", color: "#C0C0C0", marginLeft: 4 }}>
              {current + 1} of {outfits.length}
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      {view === "wardrobe" ? (
        <WardrobeView onItemClick={(item) => setLightboxItem(item)} />
      ) : view === "outfit" ? (
        outfits.length > 0 ? (
          <div
            className="swipe-container"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
              minHeight: 0,
            }}
          >
            <div style={{
              display: "flex",
              transform: `translateX(calc(-${current * 100}% + ${isDragging ? touchDelta : 0}px))`,
              transition: isDragging ? "none" : "transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)",
              height: "100%",
              willChange: "transform",
            }}>
              {outfits.map((outfit) => (
                <div
                  key={outfit.id}
                  className="outfit-scroll-panel"
                  style={{
                    width: "100%",
                    flexShrink: 0,
                    height: "100%",
                  }}
                >
                  <OutfitView
                    outfit={outfit}
                    onItemClick={(item) => setLightboxItem(item)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <OutfitEmptyState onSwitchToChat={() => setView("chat")} />
        )
      ) : (
        <ChatView
          messages={messages}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSend={handleSend}
          onChipTap={handleChipTap}
          onCtaAction={(action) => {
            if (action === "navigate_outfits") setView("outfit");
          }}
        />
      )}

    </div>
  );
}
