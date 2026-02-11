import { useState, useEffect, useRef } from "react";

const OUTFITS = [
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

const CHAT_MESSAGES = [
  { role: "user", text: "I'm going to a dinner house party, semi-casual vibe" },
  { role: "assistant", text: "Here are 3 outfit options from your wardrobe. Swipe through them and let me know what you think, or tell me what to change." },
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

function ChatView({ messages, inputValue, setInputValue, onSend }) {
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
        {messages.map((msg, i) => (
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
          </div>
        ))}
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

export default function OutfitRecommendations() {
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("outfit");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState(CHAT_MESSAGES);
  const [lightboxItem, setLightboxItem] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

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
      if (touchDelta < 0 && current < OUTFITS.length - 1) setCurrent(current + 1);
      else if (touchDelta > 0 && current > 0) setCurrent(current - 1);
    }
    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", text: inputValue },
      { role: "assistant", text: "Got it! I'll rework the recommendations. Give me a moment..." },
    ]);
    setInputValue("");
  };

  const isSelected = selected === OUTFITS[current].id;

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
          <h1 style={{
            fontSize: "var(--font-title)",
            fontWeight: 400,
            color: "#1A1A1A",
            margin: 0,
            fontFamily: "'Instrument Serif', serif",
            lineHeight: 1.1,
            flex: 1,
          }}>
            {view === "outfit" ? OUTFITS[current].vibe : "Chat"}
          </h1>

          <div style={{
            display: "flex",
            background: "#F0EFED",
            borderRadius: 20,
            padding: 3,
            flexShrink: 0,
          }}>
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
          </div>
        </div>

        {view === "outfit" && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: "var(--space-dots-mb)",
          }}>
            {OUTFITS.map((_, i) => (
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
              {current + 1} of {OUTFITS.length}
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      {view === "outfit" ? (
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
            {OUTFITS.map((outfit) => (
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
        <ChatView
          messages={messages}
          inputValue={inputValue}
          setInputValue={setInputValue}
          onSend={handleSend}
        />
      )}

    </div>
  );
}
