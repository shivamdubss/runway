import { useState, useEffect, useRef, useCallback } from "react";
import { sendChatMessage } from "./lib/api";
import * as db from "./lib/db";

const QUICK_CHIPS = [
  { label: "Dinner party", icon: "🍽️" },
  { label: "Date night", icon: "🌙" },
  { label: "Job interview", icon: "💼" },
  { label: "Weekend brunch", icon: "☀️" },
  { label: "Wedding guest", icon: "💐" },
];

const CATEGORY_TO_LABEL = {
  Tops: "Top",
  Layers: "Layer",
  Bottoms: "Bottom",
  Shoes: "Shoes",
  Accessories: "Accessories",
};

const CATEGORIES = ["Tops", "Layers", "Bottoms", "Shoes", "Accessories"];

function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "Last week";
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

const PROFILE_STORAGE_KEY = "runway_user_profile";

const SAMPLE_PROFILE = {
  version: "1.0",
  lastUpdated: "2024-02-11T14:30:00Z",
  body: {
    height: { value: 168, unit: "cm" },
    bodyType: "hourglass",
    sizePreference: "M",
  },
  style: {
    genderPreference: "womens",
    preferredStyles: ["minimalist", "classic", "professional"],
    colorPreferences: ["neutrals", "monochrome"],
  },
  lifestyle: {
    primaryOccasions: ["work", "weekend", "social"],
  },
};

function Lightbox({ item, onClose, onDelete }) {
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
          overflow: "hidden",
        }}>
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <span>{item.emoji}</span>
          )}
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
          {item.id && onDelete && (
            <button
              onClick={() => { onDelete(item.id); onClose(); }}
              style={{
                width: "100%",
                padding: "12px 0",
                marginTop: 12,
                border: "none",
                background: "transparent",
                color: "#C85A5A",
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Remove from Wardrobe
            </button>
          )}
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
        overflow: "hidden",
        position: "relative",
      }}>
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span>{item.emoji}</span>
        )}
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

function AddItemCard({ onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: "var(--card-border-radius)",
        overflow: "hidden",
        background: "#fff",
        border: "2px dashed rgba(0,0,0,0.10)",
        cursor: "pointer",
        transition: "transform 0.15s ease",
        display: "flex",
        flexDirection: "column",
      }}
      onPointerDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
      onPointerUp={(e) => e.currentTarget.style.transform = "scale(1)"}
      onPointerLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
    >
      <div style={{
        width: "100%",
        height: "var(--card-image-height)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          background: "#F3F2F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          color: "#bbb",
        }}>
          +
        </div>
        <span style={{
          fontSize: "var(--font-body)",
          color: "#bbb",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
        }}>
          Add Item
        </span>
      </div>
      <div style={{ padding: "var(--space-card-padding)", visibility: "hidden" }}>
        <span style={{ fontSize: "var(--font-item-name)" }}>&nbsp;</span>
      </div>
    </div>
  );
}

function AddItemModal({ onClose, onAdd }) {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (imagePreview) URL.revokeObjectURL(imagePreview);
              setImagePreview(URL.createObjectURL(file));
            }
            e.target.value = "";
          }}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "100%",
            aspectRatio: "4 / 3",
            background: "#F3F2F0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            gap: 8,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="Preview" style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              position: "absolute",
              inset: 0,
            }} />
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span style={{
                fontSize: "var(--font-body)",
                color: "#bbb",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
              }}>
                Tap to add photo
              </span>
            </>
          )}
        </div>

        <div style={{ padding: "16px var(--container-padding-x) var(--container-padding-x)" }}>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Item name"
            className="chat-input"
            style={{
              width: "100%",
              height: "var(--input-height)",
              borderRadius: "calc(var(--input-height) / 2)",
              border: "1px solid rgba(0,0,0,0.09)",
              background: "#fff",
              color: "#333",
              fontSize: "var(--font-chat)",
              padding: "0 var(--container-padding-x)",
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 12,
              boxSizing: "border-box",
            }}
          />

          <div style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}>
            {CATEGORIES.map((cat) => {
              const isActive = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
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
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => {
              if (!itemName.trim()) return;
              onAdd({
                label: CATEGORY_TO_LABEL[category] || category,
                name: itemName.trim(),
                color: "#E8E8E8",
                accent: "#D8D8D8",
                emoji: "📷",
                image: imagePreview || null,
                category: category,
              });
            }}
            disabled={!itemName.trim()}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 14,
              border: "none",
              background: itemName.trim() ? "#1A1A1A" : "#EEEDEB",
              color: itemName.trim() ? "#fff" : "#ccc",
              fontSize: "var(--font-body)",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: itemName.trim() ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
            onPointerDown={(e) => {
              if (itemName.trim()) e.currentTarget.style.transform = "scale(0.97)";
            }}
            onPointerUp={(e) => e.currentTarget.style.transform = "scale(1)"}
            onPointerLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
          >
            Add to Wardrobe
          </button>
        </div>
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

function WardrobeView({ wardrobeItems, onItemClick, onAddItemClick }) {
  const [activeFilter, setActiveFilter] = useState("All");

  const categories = ["All", ...Object.keys(wardrobeItems)];
  const filteredEntries = activeFilter === "All"
    ? Object.entries(wardrobeItems)
    : [[activeFilter, wardrobeItems[activeFilter] || []]];

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
        {filteredEntries.map(([category, items], sectionIndex) => (
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
              {sectionIndex === 0 && (
                <AddItemCard onClick={onAddItemClick} />
              )}
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

function ChatView({ messages, inputValue, setInputValue, onSend, onChipTap, onCtaAction, pendingImage, onImageSelect, onImageRemove }) {
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const canSend = inputValue.trim() || pendingImage;

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
                overflow: "hidden",
              }}>
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="Attached photo"
                    style={{
                      width: "100%",
                      maxWidth: 240,
                      borderRadius: 8,
                      display: "block",
                      marginBottom: msg.text ? 8 : 0,
                    }}
                  />
                )}
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

      {pendingImage && (
        <div style={{
          flexShrink: 0,
          padding: "8px var(--space-chat-padding-x) 0",
          background: "#FAFAF8",
        }}>
          <div style={{
            display: "inline-flex",
            position: "relative",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <img
              src={pendingImage.previewUrl}
              alt="Attachment preview"
              style={{
                width: 72,
                height: 72,
                objectFit: "cover",
                display: "block",
              }}
            />
            <button
              onClick={onImageRemove}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: 10,
                border: "none",
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div style={{
        flexShrink: 0,
        padding: "8px var(--space-chat-padding-x) calc(var(--space-chat-input-pb) + var(--safe-bottom))",
        background: "#FAFAF8",
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImageSelect(file);
            e.target.value = "";
          }}
        />
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: "var(--input-height)",
              height: "var(--input-height)",
              borderRadius: "calc(var(--input-height) / 2)",
              border: "1px solid rgba(0,0,0,0.09)",
              background: "#fff",
              color: "#888",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
              flexShrink: 0,
              padding: 0,
            }}
            onPointerDown={(e) => {
              e.currentTarget.style.transform = "scale(0.93)";
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
            aria-label="Attach photo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
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
              background: canSend ? "#1A1A1A" : "#EEEDEB",
              color: canSend ? "#fff" : "#ccc",
              cursor: canSend ? "pointer" : "default",
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

function ChatHistoryItem({ chat, onSelect, onToggleStar, onDelete }) {
  return (
    <div
      onClick={() => onSelect(chat.id)}
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
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 2,
      }}>
        <div style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.3,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {chat.title}
        </div>
        <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 8 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleStar(chat.id, chat.starred); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 4, color: chat.starred ? "#D4A843" : "#ccc" }}
          >
            {chat.starred ? "\u2605" : "\u2606"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(chat.id); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, padding: 4, color: "#ccc" }}
          >
            \u2715
          </button>
        </div>
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
          {formatRelativeTime(chat.updated_at || chat.created_at)}
        </span>
      </div>
    </div>
  );
}

function MultiSelectPills({ options, selected, onChange, label }) {
  const toggleOption = (option) => {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: "block",
        fontSize: "var(--font-caption)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#999",
        marginBottom: 10,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {label}
      </label>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
      }}>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => toggleOption(option.value)}
            style={{
              padding: "8px 16px",
              borderRadius: 20,
              border: selected.includes(option.value) ? "2px solid #1A1A1A" : "2px solid #E5E5E5",
              background: selected.includes(option.value) ? "#1A1A1A" : "#fff",
              color: selected.includes(option.value) ? "#fff" : "#666",
              fontSize: "var(--font-caption)",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s ease",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BodyTypeSelector({ value, onChange }) {
  const bodyTypes = [
    { value: "pear", label: "Pear", emoji: "🍐" },
    { value: "apple", label: "Apple", emoji: "🍎" },
    { value: "hourglass", label: "Hourglass", emoji: "⏳" },
    { value: "rectangle", label: "Rectangle", emoji: "▭" },
    { value: "inverted-triangle", label: "Inverted Triangle", emoji: "🔻" },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{
        display: "block",
        fontSize: "var(--font-caption)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#999",
        marginBottom: 10,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Body Type
      </label>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
        gap: 12,
      }}>
        {bodyTypes.map((type) => (
          <button
            key={type.value}
            onClick={() => onChange(type.value)}
            style={{
              padding: 16,
              borderRadius: 12,
              border: value === type.value ? "2px solid #1A1A1A" : "2px solid #E5E5E5",
              background: value === type.value ? "#F9F9F9" : "#fff",
              cursor: "pointer",
              transition: "all 0.15s ease",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 4 }}>{type.emoji}</div>
            <div style={{
              fontSize: "var(--font-caption)",
              fontWeight: 500,
              color: "#666",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {type.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BodyFitCard({ profile, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile.body);

  const bodyTypeLabels = {
    "pear": "Pear",
    "apple": "Apple",
    "hourglass": "Hourglass",
    "rectangle": "Rectangle",
    "inverted-triangle": "Inverted Triangle",
  };

  const handleSave = () => {
    onSave({ ...profile, body: draft, lastUpdated: new Date().toISOString() });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(profile.body);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        border: "1px solid #E5E5E5",
      }}>
        <h3 style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          marginBottom: 16,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          📏 Body & Fit
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#999",
            marginBottom: 8,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Height (cm)
          </label>
          <input
            type="number"
            value={draft.height.value || ""}
            onChange={(e) => setDraft({
              ...draft,
              height: { value: parseInt(e.target.value) || null, unit: "cm" }
            })}
            placeholder="e.g., 168"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "2px solid #E5E5E5",
              fontSize: "var(--font-body)",
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
        </div>

        <BodyTypeSelector
          value={draft.bodyType}
          onChange={(type) => setDraft({ ...draft, bodyType: type })}
        />

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#999",
            marginBottom: 8,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Size Preference
          </label>
          <select
            value={draft.sizePreference || ""}
            onChange={(e) => setDraft({ ...draft, sizePreference: e.target.value || null })}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "2px solid #E5E5E5",
              fontSize: "var(--font-body)",
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              background: "#fff",
            }}
          >
            <option value="">Select size</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #E5E5E5",
              background: "#fff",
              color: "#666",
              fontSize: "var(--font-caption)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#1A1A1A",
              color: "#fff",
              fontSize: "var(--font-caption)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      border: "1px solid #E5E5E5",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <h3 style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          📏 Body & Fit
        </h3>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #E5E5E5",
            background: "#fff",
            color: "#666",
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Edit
        </button>
      </div>
      <div style={{
        fontSize: "var(--font-caption)",
        color: "#666",
        lineHeight: 1.6,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {profile.body.height.value ? (
          <div><strong>Height:</strong> {profile.body.height.value} cm</div>
        ) : (
          <div style={{ color: "#999" }}>Height: Not set</div>
        )}
        {profile.body.bodyType ? (
          <div><strong>Body Type:</strong> {bodyTypeLabels[profile.body.bodyType]}</div>
        ) : (
          <div style={{ color: "#999" }}>Body Type: Not set</div>
        )}
        {profile.body.sizePreference ? (
          <div><strong>Size:</strong> {profile.body.sizePreference}</div>
        ) : (
          <div style={{ color: "#999" }}>Size: Not set</div>
        )}
      </div>
    </div>
  );
}

function StylePreferencesCard({ profile, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile.style);

  const styleOptions = [
    { value: "classic", label: "Classic" },
    { value: "minimalist", label: "Minimalist" },
    { value: "bohemian", label: "Bohemian" },
    { value: "edgy", label: "Edgy" },
    { value: "romantic", label: "Romantic" },
    { value: "sporty", label: "Sporty" },
    { value: "professional", label: "Professional" },
    { value: "casual", label: "Casual" },
  ];

  const colorOptions = [
    { value: "neutrals", label: "Neutrals" },
    { value: "pastels", label: "Pastels" },
    { value: "bold", label: "Bold/Bright" },
    { value: "monochrome", label: "Monochrome" },
    { value: "earth-tones", label: "Earth Tones" },
    { value: "jewel-tones", label: "Jewel Tones" },
  ];

  const genderLabels = {
    "womens": "Women's",
    "mens": "Men's",
    "unisex": "Unisex/All",
    "no-preference": "Prefer not to say",
  };

  const handleSave = () => {
    onSave({ ...profile, style: draft, lastUpdated: new Date().toISOString() });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(profile.style);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        border: "1px solid #E5E5E5",
      }}>
        <h3 style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          marginBottom: 16,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          👗 Style Preferences
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#999",
            marginBottom: 8,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Gender/Style Preference
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { value: "womens", label: "Women's" },
              { value: "mens", label: "Men's" },
              { value: "unisex", label: "Unisex/All" },
              { value: "no-preference", label: "Prefer not to say" },
            ].map((option) => (
              <label
                key={option.value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "var(--font-body)",
                }}
              >
                <input
                  type="radio"
                  name="gender"
                  value={option.value}
                  checked={draft.genderPreference === option.value}
                  onChange={(e) => setDraft({ ...draft, genderPreference: e.target.value })}
                  style={{ marginRight: 8 }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <MultiSelectPills
          label="Preferred Styles"
          options={styleOptions}
          selected={draft.preferredStyles}
          onChange={(styles) => setDraft({ ...draft, preferredStyles: styles })}
        />

        <MultiSelectPills
          label="Color Preferences"
          options={colorOptions}
          selected={draft.colorPreferences}
          onChange={(colors) => setDraft({ ...draft, colorPreferences: colors })}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #E5E5E5",
              background: "#fff",
              color: "#666",
              fontSize: "var(--font-caption)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#1A1A1A",
              color: "#fff",
              fontSize: "var(--font-caption)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      border: "1px solid #E5E5E5",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <h3 style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          👗 Style Preferences
        </h3>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #E5E5E5",
            background: "#fff",
            color: "#666",
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Edit
        </button>
      </div>
      <div style={{
        fontSize: "var(--font-caption)",
        color: "#666",
        lineHeight: 1.6,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {profile.style.genderPreference ? (
          <div><strong>Style:</strong> {genderLabels[profile.style.genderPreference]}</div>
        ) : (
          <div style={{ color: "#999" }}>Style: Not set</div>
        )}
        {profile.style.preferredStyles.length > 0 ? (
          <div><strong>Preferred Styles:</strong> {profile.style.preferredStyles.join(", ")}</div>
        ) : (
          <div style={{ color: "#999" }}>Preferred Styles: Not set</div>
        )}
        {profile.style.colorPreferences.length > 0 ? (
          <div><strong>Colors:</strong> {profile.style.colorPreferences.join(", ")}</div>
        ) : (
          <div style={{ color: "#999" }}>Colors: Not set</div>
        )}
      </div>
    </div>
  );
}

function LifestyleCard({ profile, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile.lifestyle);

  const occasionOptions = [
    { value: "work", label: "Work/Office" },
    { value: "weekend", label: "Casual/Weekend" },
    { value: "social", label: "Evening/Social" },
    { value: "formal", label: "Formal Events" },
    { value: "active", label: "Active/Sport" },
  ];

  const handleSave = () => {
    onSave({ ...profile, lifestyle: draft, lastUpdated: new Date().toISOString() });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(profile.lifestyle);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        border: "1px solid #E5E5E5",
      }}>
        <h3 style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          marginBottom: 16,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          📅 Lifestyle
        </h3>

        <MultiSelectPills
          label="Primary Occasions"
          options={occasionOptions}
          selected={draft.primaryOccasions}
          onChange={(occasions) => setDraft({ ...draft, primaryOccasions: occasions })}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button
            onClick={handleCancel}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid #E5E5E5",
              background: "#fff",
              color: "#666",
              fontSize: "var(--font-caption)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#1A1A1A",
              color: "#fff",
              fontSize: "var(--font-caption)",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff",
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      border: "1px solid #E5E5E5",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}>
        <h3 style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "#1A1A1A",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          📅 Lifestyle
        </h3>
        <button
          onClick={() => setIsEditing(true)}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "1px solid #E5E5E5",
            background: "#fff",
            color: "#666",
            fontSize: "var(--font-caption)",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Edit
        </button>
      </div>
      <div style={{
        fontSize: "var(--font-caption)",
        color: "#666",
        lineHeight: 1.6,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {profile.lifestyle.primaryOccasions.length > 0 ? (
          <div><strong>Primary Occasions:</strong> {profile.lifestyle.primaryOccasions.join(", ")}</div>
        ) : (
          <div style={{ color: "#999" }}>Primary Occasions: Not set</div>
        )}
      </div>
    </div>
  );
}

function ProfileView({ profile, onSave }) {
  const isComplete = profile.body.height.value && profile.body.bodyType &&
                     profile.style.preferredStyles.length > 0;

  return (
    <div style={{
      padding: "var(--container-padding-y) var(--container-padding-x)",
      overflowY: "auto",
      flex: 1,
    }}>
      <h2 style={{
        fontFamily: "'Instrument Serif', serif",
        fontSize: "var(--font-h2)",
        fontWeight: 400,
        color: "#1A1A1A",
        marginBottom: 24,
      }}>
        My Profile
      </h2>

      {!isComplete && (
        <div style={{
          background: "#FFF9E6",
          border: "1px solid #FFE599",
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          fontSize: "var(--font-caption)",
          color: "#8B7500",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          Your profile is incomplete. Fill out more details to get better recommendations!
        </div>
      )}

      <BodyFitCard profile={profile} onSave={onSave} />
      <StylePreferencesCard profile={profile} onSave={onSave} />
      <LifestyleCard profile={profile} onSave={onSave} />
    </div>
  );
}

function SidePanel({ isOpen, onClose, onNewChat, onOpenWardrobe, onOpenProfile, chatHistory, onSelectChat, onToggleStar, onDeleteChat }) {
  const starredChats = chatHistory.filter((c) => c.starred);
  const recentChats = chatHistory.filter((c) => !c.starred);

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
                <ChatHistoryItem key={chat.id} chat={chat} onSelect={onSelectChat} onToggleStar={onToggleStar} onDelete={onDeleteChat} />
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
                <ChatHistoryItem key={chat.id} chat={chat} onSelect={onSelectChat} onToggleStar={onToggleStar} onDelete={onDeleteChat} />
              ))}
            </div>
          )}

          {/* My Profile Button */}
          <div style={{ padding: "16px 16px 8px" }}>
            <button
              onClick={onOpenProfile}
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
                gap: 8,
                transition: "background 0.15s ease",
              }}
              onPointerDown={(e) => e.currentTarget.style.background = "#F3F2F0"}
              onPointerUp={(e) => e.currentTarget.style.background = "#fff"}
              onPointerLeave={(e) => e.currentTarget.style.background = "#fff"}
            >
              <span style={{ fontSize: 18 }}>✨</span>
              My Profile
            </button>
          </div>
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
  const [pendingImage, setPendingImage] = useState(null);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [wardrobeItems, setWardrobeItems] = useState({});
  const [wardrobeFlat, setWardrobeFlat] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Error loading profile from localStorage:", error);
    }
    return SAMPLE_PROFILE;
  });
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

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.error("Error saving profile to localStorage:", error);
    }
  }, [profile]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [grouped, flat, chats] = await Promise.all([
          db.fetchWardrobeItems(),
          db.fetchWardrobeItemsFlat(),
          db.fetchChats(),
        ]);
        setWardrobeItems(grouped);
        setWardrobeFlat(flat);
        setChatHistory(chats);
      } catch (err) {
        console.error("Failed to load initial data:", err);
      }
    }
    loadInitialData();
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
      if (touchDelta < 0 && current < outfits.length - 1) setCurrent(current + 1);
      else if (touchDelta > 0 && current > 0) setCurrent(current - 1);
    }
    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  };

  const handleImageSelect = useCallback((file) => {
    if (!file) return;
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }, [pendingImage]);

  const handleImageRemove = useCallback(() => {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }, [pendingImage]);

  const handleAddItem = useCallback(async (newItem) => {
    try {
      await db.addWardrobeItem(newItem);
      const [grouped, flat] = await Promise.all([
        db.fetchWardrobeItems(),
        db.fetchWardrobeItemsFlat(),
      ]);
      setWardrobeItems(grouped);
      setWardrobeFlat(flat);
      setAddItemModalOpen(false);
    } catch (err) {
      console.error("Failed to add wardrobe item:", err);
    }
  }, []);

  const allWardrobeItems = wardrobeFlat;

  const handleSendMessage = useCallback(async (text) => {
    const messageText = text || inputValue.trim();
    if ((!messageText && !pendingImage) || isGenerating) return;

    const sessionId = chatSessionRef.current;
    let chatId = activeChatId;

    // Create chat on first message
    if (!chatId) {
      try {
        const chat = await db.createChat({
          title: messageText.slice(0, 60),
          subtitle: "",
        });
        chatId = chat.id;
        setActiveChatId(chatId);
        setChatHistory(prev => [chat, ...prev]);
      } catch (err) {
        console.error("Failed to create chat:", err);
      }
    }

    const newMessage = { role: "user", text: messageText || "" };
    if (pendingImage) {
      newMessage.image = pendingImage.previewUrl;
      setPendingImage(null);
    }

    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    setIsGenerating(true);

    // Save user message to DB
    if (chatId) {
      db.saveMessage({ chatId, role: "user", content: messageText }).catch(err =>
        console.error("Failed to save user message:", err)
      );
    }

    // Build conversation history for the API
    const conversationHistory = [...messages, { role: "user", text: messageText }]
      .filter(msg => msg.text)
      .map(msg => ({ role: msg.role, content: msg.text }));

    try {
      const result = await sendChatMessage({
        messages: conversationHistory,
        wardrobeItems: allWardrobeItems,
        profile,
      });

      if (chatSessionRef.current !== sessionId) return;

      if (result.message) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: result.message },
        ]);
        if (chatId) {
          db.saveMessage({ chatId, role: "assistant", content: result.message }).catch(err =>
            console.error("Failed to save assistant message:", err)
          );
        }
      }

      if (result.outfits && result.outfits.length > 0) {
        setOutfits(result.outfits);
        setCurrent(0);
        const ctaText = `Here are ${result.outfits.length} outfit options from your wardrobe. Swipe through them and let me know what you think, or tell me what to change.`;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: ctaText,
            cta: { label: "View Outfits", action: "navigate_outfits" },
          },
        ]);

        if (chatId) {
          db.saveMessage({ chatId, role: "assistant", content: ctaText }).catch(err =>
            console.error("Failed to save CTA message:", err)
          );
          db.saveOutfits({ chatId, outfits: result.outfits, wardrobeItems: wardrobeFlat }).catch(err =>
            console.error("Failed to save outfits:", err)
          );
          const subtitle = result.outfits.map(o => o.vibe).join(", ");
          db.updateChat(chatId, { subtitle }).then(() => {
            setChatHistory(prev => prev.map(c =>
              c.id === chatId ? { ...c, subtitle } : c
            ));
          }).catch(err => console.error("Failed to update chat subtitle:", err));
        }
      }
    } catch (error) {
      if (chatSessionRef.current !== sessionId) return;
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Sorry, I ran into an issue: ${error.message}. Please try again.` },
      ]);
    } finally {
      if (chatSessionRef.current === sessionId) {
        setIsGenerating(false);
      }
    }
  }, [inputValue, isGenerating, messages, pendingImage, allWardrobeItems, wardrobeFlat, profile, activeChatId]);

  const handleSend = () => handleSendMessage(inputValue.trim());
  const handleChipTap = (label) => handleSendMessage(label);

  const handleNewChat = () => {
    chatSessionRef.current += 1;
    setActiveChatId(null);
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    messages.forEach(msg => { if (msg.image) URL.revokeObjectURL(msg.image); });
    setMessages([]);
    setOutfits([]);
    setCurrent(0);
    setSelected(null);
    setInputValue("");
    setIsGenerating(false);
    setView("chat");
    setSidePanelOpen(false);
  };

  const handleSelectChat = useCallback(async (chatId) => {
    try {
      chatSessionRef.current += 1;
      setActiveChatId(chatId);
      const [dbMessages, chatOutfits] = await Promise.all([
        db.fetchMessages(chatId),
        db.fetchOutfitsForChat(chatId),
      ]);
      setMessages(dbMessages.map(m => ({
        role: m.role,
        text: m.content,
        image: m.image_url || null,
      })));
      setOutfits(chatOutfits);
      setCurrent(0);
      setView("chat");
      setSidePanelOpen(false);
      setInputValue("");
      setIsGenerating(false);
    } catch (err) {
      console.error("Failed to load chat:", err);
    }
  }, []);

  const handleToggleStar = useCallback(async (chatId, currentStarred) => {
    try {
      await db.toggleChatStarred(chatId, currentStarred);
      setChatHistory(prev => prev.map(c =>
        c.id === chatId ? { ...c, starred: !currentStarred } : c
      ));
    } catch (err) {
      console.error("Failed to toggle star:", err);
    }
  }, []);

  const handleDeleteChat = useCallback(async (chatId) => {
    try {
      await db.deleteChat(chatId);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
      if (chatId === activeChatId) {
        chatSessionRef.current += 1;
        setActiveChatId(null);
        setMessages([]);
        setOutfits([]);
        setCurrent(0);
        setView("chat");
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }, [activeChatId]);

  const handleDeleteWardrobeItem = useCallback(async (itemId) => {
    try {
      await db.deleteWardrobeItem(itemId);
      const [grouped, flat] = await Promise.all([
        db.fetchWardrobeItems(),
        db.fetchWardrobeItemsFlat(),
      ]);
      setWardrobeItems(grouped);
      setWardrobeFlat(flat);
      setLightboxItem(null);
    } catch (err) {
      console.error("Failed to delete wardrobe item:", err);
    }
  }, []);

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
        <Lightbox item={lightboxItem} onClose={() => setLightboxItem(null)} onDelete={handleDeleteWardrobeItem} />
      )}
      {addItemModalOpen && (
        <AddItemModal
          onClose={() => setAddItemModalOpen(false)}
          onAdd={handleAddItem}
        />
      )}

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        onNewChat={handleNewChat}
        onOpenWardrobe={() => { setView("wardrobe"); setSidePanelOpen(false); }}
        onOpenProfile={() => { setView("profile"); setSidePanelOpen(false); }}
        chatHistory={chatHistory}
        onSelectChat={handleSelectChat}
        onToggleStar={handleToggleStar}
        onDeleteChat={handleDeleteChat}
      />

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
            {view === "wardrobe" ? "My Wardrobe" : view === "outfit" ? (outfits.length > 0 ? outfits[current].vibe : "Outfits") : view === "profile" ? "My Profile" : "Chat"}
          </h1>

          {view !== "wardrobe" && view !== "profile" && (
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
          )}
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
        <WardrobeView
          wardrobeItems={wardrobeItems}
          onItemClick={(item) => setLightboxItem(item)}
          onAddItemClick={() => setAddItemModalOpen(true)}
        />
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
      ) : view === "profile" ? (
        <ProfileView
          profile={profile}
          onSave={setProfile}
        />
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
          pendingImage={pendingImage}
          onImageSelect={handleImageSelect}
          onImageRemove={handleImageRemove}
        />
      )}

    </div>
  );
}
