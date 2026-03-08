import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { sendChatMessageStreaming, shareOutfit } from "./lib/api";
import { track } from "./lib/analytics";
import { uploadImage } from "./lib/upload";
import { buildConversationHistory } from "./lib/conversation-history";
import { preprocessReferencePhotoClient } from "./lib/preprocess";
import { analyzeImage } from "./lib/analyze";
import { analyzeOutfitPhoto, generateItemImage, enhanceItemImage } from "./lib/import-from-photo";
import * as db from "./lib/db";
import { compareOutfitItems } from "./lib/outfit-sort";
import {
  OUTFIT_NAV_CTA,
  appendLegacyOutfitsCtaMessage,
  buildAssistantMessageMetadata,
  toChatUiMessage,
} from "./lib/chat-message-meta";
import {
  cancelQueuedVisualizationTasks,
  generateMultiPoseVisualization,
  getCachedVisualization,
  setCachedVisualization,
  clearVisualizationCache,
  POSE_ORDER,
  makePoseEntry,
  buildQueuedPoseEntries,
  buildReadyPoseEntries,
  hasPendingVisualizationPose,
  subscribeVizRegistry,
  getVizRegistrySnapshot,
  getVizEntry,
  getResolvedVizId,
  setVizEntry,
  updateVizPose,
  hydrateVizEntry,
  remapVizEntryKey,
  pruneVizRegistry,
} from "./lib/visualization";
import { useAuth } from "./lib/auth";
import { isMobileShareDevice, shareOutfitLink } from "./lib/share";
import { fetchWeatherForDisplay, weatherIconToEmoji, searchCities, detectLocationFromBrowser } from "./lib/weather";

// Inject CSS animations for streaming states
const style = document.createElement('style');
style.textContent = `
  @keyframes typingDot {
    0%, 60%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    30% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(style);

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return { emoji: '☀️', text: 'Good morning — what are we styling?' };
  if (hour < 17) return { emoji: '🌤️', text: 'Good afternoon — what are we wearing?' };
  return { emoji: '🌙', text: "Good evening — what's the occasion?" };
}

const TYPING_MESSAGES = [
  "Raiding your closet...",
  "Mixing patterns (tastefully)...",
  "Checking if those shoes match...",
  "Consulting the fashion gods...",
  "Channeling your inner stylist...",
];

const QUICK_CHIPS = [
  { label: "Today", icon: "☀️" },
  { label: "Dinner party", icon: "🍽️" },
  { label: "Date night", icon: "🌙" },
  { label: "Job interview", icon: "💼" },
  { label: "Weekend brunch", icon: "🥂" },
  { label: "Wedding guest", icon: "💐" },
];

const CATEGORY_TO_LABEL = {
  Tops: "Top",
  Layers: "Layer",
  Bottoms: "Bottom",
  Shoes: "Shoes",
  Accessories: "Accessories",
  "Dresses & Jumpsuits": "Dress/Jumpsuit",
};

const CATEGORIES = ["Tops", "Layers", "Bottoms", "Shoes", "Accessories", "Dresses & Jumpsuits"];

function getImageFileFromDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  if (file && file.type.startsWith("image/")) return file;
  return null;
}

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
    sizePreference: "M",
  },
  style: {
    genderPreference: "womens",
    preferredStyles: ["minimalist", "classic", "professional"],
    colorPreferences: ["neutrals", "monochrome"],
  },
  styleContext: {
    notes: "",
  },
  referencePhoto: null, // { url, preprocessedUrl, uploadedAt }
};

function getVisualizationReferenceUrl(profile) {
  return profile.referencePhoto?.preprocessedUrl || profile.referencePhoto?.url || null;
}

function Lightbox({ item, onClose, onDelete, onEdit, onEnhance, onStyleItem, isEnhancing = false }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editCategory, setEditCategory] = useState(item.category);
  const [isSaving, setIsSaving] = useState(false);
  const images = item.images && item.images.length > 0 ? item.images : (item.image ? [item.image] : []);
  const hasMultiple = images.length > 1;
  const canEdit = item.id && onEdit;
  const hasChanges = editName.trim() !== item.name || editCategory !== item.category;
  const canSave = editName.trim().length > 0 && hasChanges && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onEdit(item.id, {
        name: editName.trim(),
        category: editCategory,
        label: CATEGORY_TO_LABEL[editCategory],
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setIsEditing(false);
  };

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
          maxHeight: "calc(100dvh - 2 * var(--space-lightbox-padding))",
          borderRadius: 24,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          animation: "scaleIn 0.25s ease",
          display: "flex",
          flexDirection: "column",
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
          maxHeight: "min(60dvh, calc(100dvh - 2 * var(--space-lightbox-padding) - 200px))",
          background: "#F3F2F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "var(--font-lightbox-emoji)",
          overflow: "hidden",
          position: "relative",
          flexShrink: 1,
        }}>
          {images.length > 0 ? (
            <>
              <img
                src={images[activeIdx]}
                alt={item.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: images[activeIdx]?.includes('/enhanced/') ? "contain" : "cover",
                  padding: images[activeIdx]?.includes('/enhanced/') ? "16px" : 0,
                  boxSizing: "border-box",
                }}
              />
              {hasMultiple && activeIdx > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveIdx(i => i - 1); }}
                  style={{
                    position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                    width: 32, height: 32, borderRadius: 16,
                    border: "none", background: "rgba(0,0,0,0.4)", color: "#fff",
                    fontSize: 18, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ‹
                </button>
              )}
              {hasMultiple && activeIdx < images.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveIdx(i => i + 1); }}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    width: 32, height: 32, borderRadius: 16,
                    border: "none", background: "rgba(0,0,0,0.4)", color: "#fff",
                    fontSize: 18, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  ›
                </button>
              )}
              {hasMultiple && (
                <div style={{
                  position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
                  display: "flex", gap: 6,
                }}>
                  {images.map((_, i) => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: i === activeIdx ? "#fff" : "rgba(255,255,255,0.45)",
                      transition: "background 0.2s ease",
                    }} />
                  ))}
                </div>
              )}
              {onEnhance && !isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isEnhancing) onEnhance(item.id, images[activeIdx], item);
                  }}
                  disabled={isEnhancing}
                  style={{
                    position: "absolute", bottom: 10, left: 10,
                    height: 28, padding: "0 10px", borderRadius: 14,
                    border: "none",
                    background: isEnhancing ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.45)",
                    color: "#fff",
                    fontSize: 11, fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: isEnhancing ? "default" : "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                    transition: "background 0.2s ease",
                  }}
                >
                  ✨ {isEnhancing ? "Enhancing…" : "Enhance"}
                </button>
              )}
            </>
          ) : (
            <span>{item.emoji}</span>
          )}
        </div>
        <div style={{ padding: "16px var(--container-padding-x) var(--container-padding-x)", flexShrink: 0, overflowY: "auto" }}>
          {isEditing ? (
            <>
              <div style={{
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#aaa",
                marginBottom: 6,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Category
              </div>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  padding: "0 12px",
                  fontSize: "var(--font-caption)",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#1A1A1A",
                  background: "#fff",
                  appearance: "auto",
                  cursor: "pointer",
                  marginBottom: 12,
                }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <div style={{
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#aaa",
                marginBottom: 6,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Name
              </div>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Item name"
                className="chat-input"
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.12)",
                  padding: "0 12px",
                  fontSize: "var(--font-lightbox-title)",
                  fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#1A1A1A",
                  boxSizing: "border-box",
                  marginBottom: 12,
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleCancel}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    background: "#fff",
                    color: "#555",
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
                  disabled={!canSave}
                  style={{
                    flex: 2,
                    height: 44,
                    borderRadius: 12,
                    border: "none",
                    background: canSave ? "#1A1A1A" : "#EEEDEB",
                    color: canSave ? "#fff" : "#ccc",
                    fontSize: "var(--font-caption)",
                    fontWeight: 600,
                    cursor: canSave ? "pointer" : "default",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </>
          ) : (
            <>
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
              {(canEdit || onStyleItem || (item.id && onDelete)) && (() => {
                const pillBase = (extraStyle = {}) => ({
                  flex: 1,
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 18,
                  border: "1px solid rgba(0,0,0,0.10)",
                  background: "transparent",
                  color: "#555",
                  fontSize: "var(--font-caption)",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  textAlign: "center",
                  transition: "all 0.15s ease",
                  ...extraStyle,
                });
                return (
                  <div style={{
                    display: "flex",
                    gap: 8,
                    borderTop: "1px solid rgba(0,0,0,0.06)",
                    marginTop: 12,
                    padding: "12px 16px",
                  }}>
                    {canEdit && (
                      <button onClick={() => setIsEditing(true)} style={pillBase()}>
                        Edit
                      </button>
                    )}
                    {onStyleItem && (
                      <button
                        onClick={onStyleItem}
                        style={pillBase({
                          flex: 2,
                          fontWeight: 700,
                          background: "#1A1A1A",
                          color: "#fff",
                          border: "none",
                        })}
                      >
                        Style this Item
                      </button>
                    )}
                    {item.id && onDelete && (
                      <button
                        onClick={() => { onDelete(item.id); onClose(); }}
                        style={pillBase({
                          color: "#C85A5A",
                          border: "1px solid rgba(200,90,90,0.25)",
                        })}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const POSE_LABELS = { front: 'Front View', angle: '3/4 Angle', seated: 'Seated' };


function VizCarouselSlot({ poseData, loadingMessage }) {
  if (!poseData || poseData.status === 'idle') {
    return (
      <div style={{
        width: "100%",
        height: 400,
        borderRadius: 16,
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <p style={{ fontSize: 14, color: "#aaa", fontFamily: "'DM Sans', sans-serif" }}>
          Tap "See this on you" to try it on
        </p>
      </div>
    );
  }

  if (poseData.status === 'queued') {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "100%",
          height: 400,
          borderRadius: 16,
          marginBottom: 12,
          background: "linear-gradient(135deg, #f7f5f0 0%, #efebe1 100%)",
          border: "1px solid #E9E3D8",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            background: "rgba(255,255,255,0.8)",
            color: "#9A8F77",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
          }}>
            …
          </div>
        </div>
        <p style={{
          fontSize: 14,
          color: "#7A7468",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          margin: 0,
        }}>
          You're next in line...
        </p>
      </div>
    );
  }

  if (poseData.status === 'generating') {
    return (
      <div style={{ textAlign: "center" }}>
        {poseData.partialImageUrl ? (
          <img
            src={poseData.partialImageUrl}
            alt="Generating..."
            style={{
              width: "100%",
              maxHeight: 520,
              objectFit: "contain",
              display: "block",
              borderRadius: 16,
              marginBottom: 12,
              background: "#fff",
              opacity: 0.85,
              filter: "blur(2px)",
              transition: "opacity 0.3s ease, filter 0.3s ease",
            }}
          />
        ) : (
          <div className="shimmer-effect" style={{
            width: "100%",
            height: 400,
            borderRadius: 16,
            marginBottom: 12,
            background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
          }} />
        )}
        <p style={{
          fontSize: 14,
          color: "#666",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          margin: 0,
        }}>
          {loadingMessage}
        </p>
      </div>
    );
  }

  if (poseData.status === 'error') {
    return (
      <div style={{
        width: "100%",
        height: 400,
        borderRadius: 16,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
      }}>
        <div style={{ fontSize: 36 }}>😞</div>
        <p style={{
          fontSize: 14,
          color: "#666",
          fontFamily: "'DM Sans', sans-serif",
          textAlign: "center",
          margin: 0,
        }}>
          {poseData.error || 'Something went wrong — give it another try'}
        </p>
      </div>
    );
  }

  return (
    <img
      src={poseData.imageUrl}
      alt="Outfit visualization"
      style={{
        width: "100%",
        maxHeight: 520,
        objectFit: "contain",
        display: "block",
        borderRadius: 16,
        background: "#fff",
      }}
    />
  );
}

function OutfitVisualizationModal({ poses, outfit, onClose, onRegenerate }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState({
    front: "Styling your look...",
    angle: "Styling your look...",
    seated: "Styling your look...",
  });

  useEffect(() => {
    const messagesByPose = {
      front: ["Styling your look...", "Getting you ready...", "Putting it all together...", "Almost there..."],
      angle: ["Styling your look...", "Finding your best angle...", "Putting it all together...", "Almost there..."],
      seated: ["Styling your look...", "Trying a new pose...", "Putting it all together...", "Almost there..."],
    };
    const indices = { front: 0, angle: 0, seated: 0 };

    const interval = setInterval(() => {
      setLoadingMessages(prev => {
        const next = { ...prev };
        for (const pose of POSE_ORDER) {
          if (poses?.[pose]?.status === 'generating') {
            indices[pose] = (indices[pose] + 1) % messagesByPose[pose].length;
            next[pose] = messagesByPose[pose][indices[pose]];
          }
        }
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [poses]);
  const hasPendingPose = hasPendingVisualizationPose(poses);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 600,
          borderRadius: 24,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
          animation: "scaleIn 0.25s ease",
        }}
      >
        {/* Regenerate button */}
        <button
          onClick={onRegenerate}
          disabled={hasPendingPose}
          style={{
            position: "absolute",
            top: 16,
            left: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 20,
            border: "none",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            fontSize: 18,
            cursor: hasPendingPose ? "not-allowed" : "pointer",
            opacity: hasPendingPose ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
        >
          ↻
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 20,
            border: "none",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            fontSize: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
        >
          ✕
        </button>

        {/* Carousel area */}
        <div style={{ padding: "20px 20px 0 20px", position: "relative" }}>
          <div style={{ overflow: "hidden", borderRadius: 16 }}>
            <div style={{
              display: "flex",
              transform: `translateX(-${activeIdx * 100}%)`,
              transition: "transform 0.3s ease",
            }}>
              {POSE_ORDER.map((pose) => (
                <div key={pose} style={{ width: "100%", flexShrink: 0 }}>
                  <VizCarouselSlot
                    poseData={poses?.[pose]}
                    loadingMessage={loadingMessages[pose]}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Left arrow */}
          {activeIdx > 0 && (
            <button
              onClick={() => setActiveIdx(i => i - 1)}
              style={{
                position: "absolute", left: 28, top: "50%", transform: "translateY(-50%)",
                width: 36, height: 36, borderRadius: 18,
                border: "none", background: "rgba(0,0,0,0.45)", color: "#fff",
                fontSize: 20, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s ease",
              }}
            >
              ‹
            </button>
          )}

          {/* Right arrow */}
          {activeIdx < POSE_ORDER.length - 1 && (
            <button
              onClick={() => setActiveIdx(i => i + 1)}
              style={{
                position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)",
                width: 36, height: 36, borderRadius: 18,
                border: "none", background: "rgba(0,0,0,0.45)", color: "#fff",
                fontSize: 20, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s ease",
              }}
            >
              ›
            </button>
          )}
        </div>

        {/* Navigation dots */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          padding: "12px 20px 0",
        }}>
          <div style={{ display: "flex", gap: 8 }}>
            {POSE_ORDER.map((pose, i) => (
              <button
                key={pose}
                onClick={() => setActiveIdx(i)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  background: i === activeIdx ? "#1A1A1A" : "#D4D4D4",
                  transition: "background 0.2s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px" }}>
          <p style={{
            fontSize: 11,
            color: "#B0B0B0",
            textAlign: "center",
            marginTop: 0,
            marginBottom: 0,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Generated by AI — may not perfectly reflect actual items
          </p>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, onClick, overlay = false, isEnhancing = false }) {
  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: "var(--card-border-radius)",
        overflow: "hidden",
        background: overlay ? "transparent" : "#fff",
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
        {(item.images?.[0] || item.image) ? (
          <>
            <img
              src={item.images?.[0] || item.image}
              alt={item.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            {item.images?.length > 1 && (
              <div style={{
                position: "absolute", top: 4, right: 4,
                background: "rgba(0,0,0,0.5)", color: "#fff",
                borderRadius: 6, padding: "1px 5px",
                fontSize: 9, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              }}>
                {item.images.length}
              </div>
            )}
          </>
        ) : (
          <span>{item.emoji}</span>
        )}

        {isEnhancing && (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.4s infinite",
            pointerEvents: "none",
          }} />
        )}
        {overlay && (
          <div style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            padding: "var(--space-card-padding)",
            background: "rgba(255, 255, 255, 0.75)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}>
            <span style={{
              fontSize: "var(--font-item-name)",
              fontWeight: 600,
              color: "#222",
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "block",
            }}>
              {item.name}
            </span>
          </div>
        )}
      </div>

      {/* Text strip (non-overlay mode only) */}
      {!overlay && (
        <div style={{
          padding: "var(--space-card-padding)",
        }}>
          <span style={{
            fontSize: "var(--font-item-name)",
            fontWeight: 600,
            color: "#222",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "block",
          }}>
            {item.name}
          </span>
        </div>
      )}
    </div>
  );
}


function AddItemModal({ onClose, onAdd, onBulkAdd }) {
  // --- Mode: "single", "bulk", or "import" ---
  const [mode, setMode] = useState("single");

  // --- Single-item state ---
  const [phase, setPhase] = useState("capture"); // "capture" | "analyzing" | "confirm"
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [images, setImages] = useState([]); // [{previewUrl, uploadedUrl}]
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiColor, setAiColor] = useState(null);
  const [aiAccent, setAiAccent] = useState(null);
  const [aiEmoji, setAiEmoji] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const extraFileInputRef = useRef(null);

  // --- Import-from-photo state ---
  const [importPhase, setImportPhase] = useState("upload"); // 'upload' | 'analyzing' | 'review'
  const [importPreviewUrl, setImportPreviewUrl] = useState(null);
  const [importIsUploading, setImportIsUploading] = useState(false);
  const [importIsDragOver, setImportIsDragOver] = useState(false);
  const [importUploadError, setImportUploadError] = useState(null);
  const [importAnalysisError, setImportAnalysisError] = useState(null);
  const [importItems, setImportItems] = useState([]);
  const [genProgress, setGenProgress] = useState({ completed: 0, total: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Tops");
  const importFileInputRef = useRef(null);

  // --- Bulk state ---
  const [bulkQueue, setBulkQueue] = useState([]); // array of {previewUrl, uploadedUrl, name, category, color, accentColor, emoji, error}
  const [bulkIndex, setBulkIndex] = useState(0);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkEditName, setBulkEditName] = useState("");
  const [bulkEditCategory, setBulkEditCategory] = useState("Tops");
  const [bulkAutoEnhance, setBulkAutoEnhance] = useState(true);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      images.forEach(img => { if (img.previewUrl) URL.revokeObjectURL(img.previewUrl); });
      bulkQueue.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
      if (importPreviewUrl) URL.revokeObjectURL(importPreviewUrl);
    };
  }, []);

  // Sync bulk edit fields when bulkIndex changes
  useEffect(() => {
    if (mode === "bulk" && bulkQueue.length > 0 && bulkIndex < bulkQueue.length) {
      setBulkEditName(bulkQueue[bulkIndex].name || "");
      setBulkEditCategory(bulkQueue[bulkIndex].category || "Tops");
    }
  }, [bulkIndex, mode, bulkQueue]);

  const handleFileSelected = async (file) => {
    if (!file) return;
    setAnalysisError(null);
    setUploadError(null);
    setPhase("analyzing");

    const previewUrl = URL.createObjectURL(file);
    setImages([{ previewUrl, uploadedUrl: null }]);

    let imageUrl;
    try {
      setIsUploading(true);
      imageUrl = await uploadImage(file);
      setImages([{ previewUrl, uploadedUrl: imageUrl }]);
    } catch (err) {
      console.error("Image upload failed:", err, { name: file.name, type: file.type, size: file.size });
      setUploadError("Failed to upload image. Please try again.");
      URL.revokeObjectURL(previewUrl);
      setImages([]);
      setPhase("capture");
      return;
    } finally {
      setIsUploading(false);
    }

    try {
      setIsAnalyzing(true);
      const result = await analyzeImage(imageUrl);
      setItemName((prev) => (prev.trim() ? prev : result.name));
      setCategory(result.category);
      setAiColor(result.color);
      setAiAccent(result.accent_color);
      setAiEmoji(result.emoji);
    } catch (err) {
      console.error("Image analysis failed:", err, { name: file.name, type: file.type, size: file.size });
      setAnalysisError("Could not analyze image. Add details manually.");
      setIsEditingName(true);
    } finally {
      setIsAnalyzing(false);
      setPhase("confirm");
    }
  };

  const handleExtraFileSelected = async (file) => {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    const placeholder = { previewUrl, uploadedUrl: null };
    setImages(prev => [...prev, placeholder]);

    try {
      const url = await uploadImage(file);
      setImages(prev => prev.map(img => img.previewUrl === previewUrl ? { ...img, uploadedUrl: url } : img));
    } catch (err) {
      console.error("Extra image upload failed:", err, { name: file.name, type: file.type, size: file.size });
      // Remove the failed image
      URL.revokeObjectURL(previewUrl);
      setImages(prev => prev.filter(img => img.previewUrl !== previewUrl));
    }
  };

  const handleBulkFilesSelected = async (files) => {
    setMode("bulk");
    setBulkProcessing(true);
    setBulkIndex(0);

    const results = await Promise.allSettled(
      files.map(async (file) => {
        const previewUrl = URL.createObjectURL(file);
        try {
          const url = await uploadImage(file);
          const analysis = await analyzeImage(url);
          return {
            previewUrl,
            uploadedUrl: url,
            name: analysis.name,
            category: analysis.category,
            color: analysis.color,
            accentColor: analysis.accent_color,
            emoji: analysis.emoji,
            error: null,
          };
        } catch (err) {
          console.error("Bulk upload failed for file:", err, { name: file.name, type: file.type, size: file.size });
          return {
            previewUrl,
            uploadedUrl: null,
            name: file.name.replace(/\.[^.]+$/, ""),
            category: "Tops",
            color: "#E8E8E8",
            accentColor: "#D8D8D8",
            emoji: "📷",
            error: err.message,
          };
        }
      })
    );

    const queue = results.map(r => r.status === "fulfilled" ? r.value : r.reason);
    setBulkQueue(queue);
    setBulkProcessing(false);
  };

  const handleBulkConfirmCurrent = () => {
    // Save edits back to queue
    setBulkQueue(prev => {
      const copy = [...prev];
      copy[bulkIndex] = { ...copy[bulkIndex], name: bulkEditName, category: bulkEditCategory, confirmed: true };
      return copy;
    });
    if (bulkIndex < bulkQueue.length - 1) {
      setBulkIndex(bulkIndex + 1);
    } else {
      // Last item - save all confirmed
      const finalQueue = [...bulkQueue];
      finalQueue[bulkIndex] = { ...finalQueue[bulkIndex], name: bulkEditName, category: bulkEditCategory, confirmed: true };
      const confirmed = finalQueue.filter(item => item.confirmed && item.uploadedUrl);
      if (confirmed.length > 0 && onBulkAdd) {
        onBulkAdd(confirmed.map(item => ({
          label: CATEGORY_TO_LABEL[item.category] || item.category,
          name: item.name,
          color: item.color || "#E8E8E8",
          accent: item.accentColor || "#D8D8D8",
          emoji: item.emoji || "📷",
          images: [item.uploadedUrl],
          category: item.category,
        })), { autoEnhance: bulkAutoEnhance });
      }
    }
  };

  const handleBulkSkip = () => {
    if (bulkIndex < bulkQueue.length - 1) {
      setBulkIndex(bulkIndex + 1);
    } else {
      // Last item - save all confirmed so far
      const confirmed = bulkQueue.filter(item => item.confirmed && item.uploadedUrl);
      if (confirmed.length > 0 && onBulkAdd) {
        onBulkAdd(confirmed.map(item => ({
          label: CATEGORY_TO_LABEL[item.category] || item.category,
          name: item.name,
          color: item.color || "#E8E8E8",
          accent: item.accentColor || "#D8D8D8",
          emoji: item.emoji || "📷",
          images: [item.uploadedUrl],
          category: item.category,
        })), { autoEnhance: bulkAutoEnhance });
      } else {
        onClose();
      }
    }
  };

  const handleBulkSaveAll = () => {
    const finalQueue = bulkQueue.map((item, i) => {
      if (i === bulkIndex) return { ...item, name: bulkEditName, category: bulkEditCategory };
      return item;
    });
    const toSave = finalQueue.filter(item => item.uploadedUrl);
    if (toSave.length > 0 && onBulkAdd) {
      onBulkAdd(toSave.map(item => ({
        label: CATEGORY_TO_LABEL[item.category] || item.category,
        name: item.name,
        color: item.color || "#E8E8E8",
        accent: item.accentColor || "#D8D8D8",
        emoji: item.emoji || "📷",
        images: [item.uploadedUrl],
        category: item.category,
      })), { autoEnhance: bulkAutoEnhance });
    }
  };

  // --- Import-from-photo functions ---
  const handleImportFileSelected = async (file) => {
    if (!file) return;
    setImportUploadError(null);
    setImportAnalysisError(null);

    const preview = URL.createObjectURL(file);
    setImportPreviewUrl(preview);

    let imageUrl;
    try {
      setImportIsUploading(true);
      imageUrl = await uploadImage(file);
    } catch (err) {
      console.error("Import photo upload failed:", err);
      setImportUploadError("Failed to upload image. Please try again.");
      URL.revokeObjectURL(preview);
      setImportPreviewUrl(null);
      return;
    } finally {
      setImportIsUploading(false);
    }

    try {
      setImportPhase("analyzing");
      const result = await analyzeOutfitPhoto(imageUrl);
      const identified = (result.items || []).map((item, i) => ({
        id: `import-${Date.now()}-${i}`,
        ...item,
        imageUrl: null,
        imageStatus: "pending",
        removed: false,
      }));
      setImportItems(identified);
      setImportPhase("review");
      generateAllImages(identified);
    } catch (err) {
      console.error("Outfit analysis failed:", err);
      setImportAnalysisError("Could not identify items in this photo. Try a well-lit, full-body photo.");
      setImportPhase("upload");
    }
  };

  const generateAllImages = async (itemList) => {
    const MAX_CONCURRENT = 3;
    const queue = [...itemList];
    setGenProgress({ completed: 0, total: queue.length });
    let completed = 0;

    async function processNext() {
      if (queue.length === 0) return;
      const item = queue.shift();
      try {
        const result = await generateItemImage({
          name: item.name,
          description: item.description,
          color: item.color,
          category: item.category,
        });
        setImportItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, imageUrl: result.imageUrl, imageStatus: "ready" } : i
        ));
      } catch (err) {
        console.error(`Image generation failed for ${item.name}:`, err);
        setImportItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, imageStatus: "error" } : i
        ));
      } finally {
        completed++;
        setGenProgress({ completed, total: itemList.length });
        await processNext();
      }
    }

    const workers = Array(Math.min(MAX_CONCURRENT, queue.length))
      .fill(null)
      .map(() => processNext());
    await Promise.all(workers);
  };

  const regenItemImage = async (item) => {
    setImportItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, imageStatus: "pending" } : i
    ));
    try {
      const result = await generateItemImage({
        name: item.name,
        description: item.description,
        color: item.color,
        category: item.category,
      });
      setImportItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, imageUrl: result.imageUrl, imageStatus: "ready" } : i
      ));
    } catch (err) {
      console.error(`Image regeneration failed for ${item.name}:`, err);
      setImportItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, imageStatus: "error" } : i
      ));
    }
  };

  const importActiveItems = importItems.filter(i => !i.removed);
  const allGenDone = genProgress.total > 0 && genProgress.completed >= genProgress.total;

  const handleImportConfirm = async () => {
    const toAdd = importActiveItems.map(item => ({
      label: CATEGORY_TO_LABEL[item.category] || item.category,
      name: item.name,
      color: item.color || "#E8E8E8",
      accent: item.accent_color || "#D8D8D8",
      emoji: item.emoji || "👕",
      images: item.imageUrl ? [item.imageUrl] : [],
      category: item.category,
    }));
    if (toAdd.length > 0 && onBulkAdd) {
      onBulkAdd(toAdd);
    }
  };

  const startImportEdit = (item) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
  };

  const saveImportEdit = () => {
    setImportItems(prev => prev.map(i =>
      i.id === editingId ? { ...i, name: editName, category: editCategory } : i
    ));
    setEditingId(null);
  };

  // --- Bulk processing / review UI ---
  if (mode === "bulk") {
    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "var(--space-lightbox-padding)", animation: "fadeIn 0.2s ease",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative", width: "100%", maxWidth: "var(--lightbox-max-width)",
            borderRadius: 24, overflow: "hidden", background: "#fff",
            boxShadow: "0 24px 80px rgba(0,0,0,0.3)", animation: "scaleIn 0.25s ease",
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: "absolute", top: 12, right: 12, zIndex: 1,
              width: "var(--lightbox-close-size)", height: "var(--lightbox-close-size)",
              borderRadius: "calc(var(--lightbox-close-size) / 2)",
              border: "none", background: "rgba(0,0,0,0.4)", color: "#fff",
              fontSize: "var(--font-icon)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            ✕
          </button>

          {bulkProcessing ? (
            <div style={{
              width: "100%", aspectRatio: "4 / 3", background: "#F3F2F0",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 16,
                border: "3px solid #E8E8E8", borderTopColor: "#1A1A1A",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{ fontSize: "var(--font-body)", color: "#888", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                Uploading & analyzing items...
              </span>
            </div>
          ) : bulkQueue.length > 0 && bulkIndex < bulkQueue.length ? (
            <>
              {/* Progress bar */}
              <div style={{ width: "100%", height: 3, background: "#EEEDEB" }}>
                <div style={{
                  width: `${((bulkIndex + 1) / bulkQueue.length) * 100}%`,
                  height: "100%", background: "#1A1A1A", transition: "width 0.3s ease",
                }} />
              </div>

              {/* Image preview */}
              <div style={{
                width: "100%", aspectRatio: "4 / 3", background: "#F3F2F0",
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative",
              }}>
                {bulkQueue[bulkIndex].previewUrl ? (
                  <img src={bulkQueue[bulkIndex].previewUrl} alt="Preview" style={{
                    width: "100%", height: "100%", objectFit: "cover",
                  }} />
                ) : (
                  <span style={{ fontSize: 48 }}>{bulkQueue[bulkIndex].emoji || "📷"}</span>
                )}
                {/* Counter badge */}
                <div style={{
                  position: "absolute", top: 12, left: 12,
                  background: "rgba(0,0,0,0.5)", color: "#fff",
                  borderRadius: 10, padding: "4px 10px",
                  fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                }}>
                  {bulkIndex + 1} of {bulkQueue.length}
                </div>
              </div>

              {/* Edit fields */}
              <div style={{ padding: "16px var(--container-padding-x) var(--container-padding-x)" }}>
                {bulkQueue[bulkIndex].error && (
                  <div style={{ padding: "8px 0", fontSize: "var(--font-body)", color: "#c0392b", fontFamily: "'DM Sans', sans-serif" }}>
                    Upload failed — you can skip this item.
                  </div>
                )}
                <input
                  type="text"
                  value={bulkEditName}
                  onChange={(e) => setBulkEditName(e.target.value)}
                  placeholder="Item name"
                  className="chat-input"
                  style={{
                    width: "100%", height: "var(--input-height)",
                    borderRadius: "calc(var(--input-height) / 2)",
                    border: "1px solid rgba(0,0,0,0.09)", background: "#fff", color: "#333",
                    fontSize: "var(--font-chat)", padding: "0 var(--container-padding-x)",
                    fontFamily: "'DM Sans', sans-serif", marginBottom: 12, boxSizing: "border-box",
                  }}
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {CATEGORIES.map((cat) => {
                    const isActive = bulkEditCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setBulkEditCategory(cat)}
                        style={{
                          height: 32, padding: "0 14px", borderRadius: 16,
                          border: isActive ? "none" : "1px solid rgba(0,0,0,0.08)",
                          background: isActive ? "#1A1A1A" : "#fff",
                          color: isActive ? "#fff" : "#555",
                          fontSize: "var(--font-body)", fontWeight: 500,
                          fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                          transition: "all 0.15s ease", whiteSpace: "nowrap",
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleBulkSkip}
                    style={{
                      flex: 1, height: 48, borderRadius: 14,
                      border: "1px solid rgba(0,0,0,0.1)", background: "#fff", color: "#888",
                      fontSize: "var(--font-body)", fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    }}
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleBulkConfirmCurrent}
                    disabled={!bulkEditName.trim() || !!bulkQueue[bulkIndex].error}
                    style={{
                      flex: 2, height: 48, borderRadius: 14, border: "none",
                      background: (bulkEditName.trim() && !bulkQueue[bulkIndex].error) ? "#1A1A1A" : "#EEEDEB",
                      color: (bulkEditName.trim() && !bulkQueue[bulkIndex].error) ? "#fff" : "#ccc",
                      fontSize: "var(--font-body)", fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: (bulkEditName.trim() && !bulkQueue[bulkIndex].error) ? "pointer" : "default",
                    }}
                  >
                    {bulkIndex < bulkQueue.length - 1 ? "Next" : "Done"}
                  </button>
                </div>
                {bulkQueue.length > 1 && (
                  <button
                    onClick={handleBulkSaveAll}
                    style={{
                      width: "100%", height: 40, marginTop: 8,
                      borderRadius: 14, border: "none",
                      background: "transparent", color: "#667eea",
                      fontSize: "var(--font-body)", fontWeight: 600,
                      fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    }}
                  >
                    Save all as-is
                  </button>
                )}
                <button
                  onClick={() => setBulkAutoEnhance(v => !v)}
                  style={{
                    width: "100%", height: 40, marginTop: 6,
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: bulkAutoEnhance ? "#F5F0FF" : "#fff",
                    color: bulkAutoEnhance ? "#6B3FA0" : "#888",
                    fontSize: "var(--font-body)", fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 8,
                    background: bulkAutoEnhance ? "#6B3FA0" : "rgba(0,0,0,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: "#fff", flexShrink: 0,
                  }}>✓</span>
                  ✨ Enhance all photos
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  // --- Import-from-photo UI ---
  if (mode === "import") {
    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "var(--space-lightbox-padding)", animation: "fadeIn 0.2s ease",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#fff", borderRadius: 24, width: "92vw", maxWidth: 480,
            maxHeight: "85vh", display: "flex", flexDirection: "column",
            animation: "scaleIn 0.25s ease", position: "relative", overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ padding: "20px 20px 0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => { setMode("single"); setImportPhase("upload"); setImportItems([]); setImportAnalysisError(null); }}
                style={{
                  width: 28, height: 28, borderRadius: 14, border: "none", background: "#F3F2F0",
                  fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >←</button>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 17 }}>Import from Photo</span>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 16, border: "none", background: "#F3F2F0",
              fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          </div>

          {/* Progress bar during generation */}
          {importPhase === "review" && genProgress.total > 0 && !allGenDone && (
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: "#888", fontFamily: "'DM Sans', sans-serif", marginBottom: 6 }}>
                Generating images... {genProgress.completed} of {genProgress.total}
              </div>
              <div style={{ height: 3, background: "#F3F2F0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%", background: "#1A1A1A", borderRadius: 2,
                  width: `${(genProgress.completed / genProgress.total) * 100}%`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          )}

          {/* Content area */}
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
            {/* Upload phase */}
            {importPhase === "upload" && (
              <div>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files[0]; if (f) handleImportFileSelected(f); e.target.value = ""; }}
                />
                <div
                  onClick={() => importFileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setImportIsDragOver(true); }}
                  onDragLeave={() => setImportIsDragOver(false)}
                  onDrop={(e) => { setImportIsDragOver(false); const f = getImageFileFromDrop(e); if (f) handleImportFileSelected(f); }}
                  style={{
                    width: "100%", aspectRatio: "3/4", background: importIsDragOver ? "#f0f0ff" : "#F3F2F0",
                    borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", border: importIsDragOver ? "2px dashed #667eea" : "2px dashed rgba(0,0,0,0.08)",
                    transition: "all 0.15s ease", gap: 8,
                  }}
                >
                  {importIsUploading ? (
                    <>
                      <div style={{
                        width: 36, height: 36, border: "3px solid #eee", borderTopColor: "#1A1A1A",
                        borderRadius: "50%", animation: "spin 0.8s linear infinite",
                      }} />
                      <span style={{ fontSize: 14, color: "#888", fontFamily: "'DM Sans', sans-serif" }}>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 36 }}>📸</span>
                      <span style={{ fontSize: 14, color: "#888", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, textAlign: "center", padding: "0 20px" }}>
                        Upload a photo of yourself wearing an outfit
                      </span>
                      <span style={{ fontSize: 12, color: "#bbb", fontFamily: "'DM Sans', sans-serif" }}>
                        Take or choose a photo
                      </span>
                    </>
                  )}
                </div>
                {importUploadError && (
                  <div style={{ color: "#c0392b", fontSize: 13, marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>{importUploadError}</div>
                )}
                {importAnalysisError && (
                  <div style={{ color: "#c0392b", fontSize: 13, marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>{importAnalysisError}</div>
                )}
              </div>
            )}

            {/* Analyzing phase */}
            {importPhase === "analyzing" && (
              <div style={{ position: "relative" }}>
                {importPreviewUrl && (
                  <img src={importPreviewUrl} alt="Outfit" style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", borderRadius: 16, opacity: 0.5 }} />
                )}
                <div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, border: "3px solid #eee", borderTopColor: "#1A1A1A",
                    borderRadius: "50%", animation: "spin 0.8s linear infinite",
                  }} />
                  <span style={{ fontSize: 14, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    Identifying items in your outfit...
                  </span>
                </div>
              </div>
            )}

            {/* Review phase — item grid */}
            {importPhase === "review" && (
              <div className="item-card-grid" style={{ gap: 12 }}>
                {importItems.map((item) => {
                  if (item.removed) return null;
                  const isEditing = editingId === item.id;

                  return (
                    <div key={item.id} style={{
                      borderRadius: "var(--card-border-radius)", overflow: "hidden", background: "#fff",
                      border: "1px solid rgba(0,0,0,0.06)", position: "relative",
                    }}>
                      {/* Image area */}
                      <div style={{
                        width: "100%", aspectRatio: "1/1", background: "#F3F2F0", position: "relative",
                        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                      }}>
                        {item.imageStatus === "ready" && item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : item.imageStatus === "error" ? (
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 32 }}>{item.emoji}</div>
                            <div style={{ fontSize: 10, color: "#c0392b", fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>Image failed</div>
                          </div>
                        ) : (
                          <div style={{
                            width: "100%", height: "100%",
                            background: "linear-gradient(90deg, #F3F2F0 25%, #E8E7E5 50%, #F3F2F0 75%)",
                            backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite",
                          }} />
                        )}
                        <button
                          onClick={() => setImportItems(prev => prev.map(i => i.id === item.id ? { ...i, removed: true } : i))}
                          style={{
                            position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12,
                            background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 12,
                            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >✕</button>
                        {(item.imageStatus === "ready" || item.imageStatus === "error") && (
                          <button
                            onClick={(e) => { e.stopPropagation(); regenItemImage(item); }}
                            title="Regenerate image"
                            style={{
                              position: "absolute", bottom: 6, left: 6, width: 28, height: 28, borderRadius: 14,
                              background: "rgba(0,0,0,0.45)", border: "none", color: "#fff", fontSize: 15,
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >↻</button>
                        )}
                      </div>

                      {/* Info area */}
                      <div style={{ padding: 10 }}>
                        {isEditing ? (
                          <div>
                            <input
                              type="text" value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              style={{
                                width: "100%", padding: "6px 8px", borderRadius: 8,
                                border: "1px solid rgba(0,0,0,0.12)", fontSize: 13,
                                fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box",
                              }}
                            />
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                              {CATEGORIES.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() => setEditCategory(cat)}
                                  style={{
                                    height: 26, padding: "0 10px", borderRadius: 13, fontSize: 11,
                                    fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                                    border: editCategory === cat ? "none" : "1px solid rgba(0,0,0,0.08)",
                                    background: editCategory === cat ? "#1A1A1A" : "#fff",
                                    color: editCategory === cat ? "#fff" : "#555",
                                    cursor: "pointer",
                                  }}
                                >{cat}</button>
                              ))}
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <button
                                onClick={saveImportEdit}
                                style={{
                                  flex: 1, height: 30, borderRadius: 8, border: "none",
                                  background: "#1A1A1A", color: "#fff", fontSize: 12,
                                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer",
                                }}
                              >Save</button>
                              <button
                                onClick={() => setEditingId(null)}
                                style={{
                                  flex: 1, height: 30, borderRadius: 8,
                                  border: "1px solid rgba(0,0,0,0.08)", background: "#fff",
                                  color: "#555", fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                                  fontWeight: 500, cursor: "pointer",
                                }}
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => startImportEdit(item)} style={{ cursor: "pointer" }}>
                            <div style={{
                              fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                              letterSpacing: "0.06em", color: "#aaa",
                              fontFamily: "'DM Sans', sans-serif",
                            }}>{CATEGORY_TO_LABEL[item.category] || item.category}</div>
                            <div style={{
                              fontSize: 13, fontWeight: 500, color: "#1A1A1A",
                              fontFamily: "'DM Sans', sans-serif", marginTop: 2,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>{item.name}</div>
                            <div style={{
                              fontSize: 10, color: "#bbb", fontFamily: "'DM Sans', sans-serif", marginTop: 4,
                            }}>Tap to edit</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom action bar */}
          {importPhase === "review" && (
            <div style={{
              padding: "12px 20px calc(12px + var(--safe-bottom))", flexShrink: 0,
              borderTop: "1px solid rgba(0,0,0,0.06)",
            }}>
              <button
                onClick={handleImportConfirm}
                disabled={importActiveItems.length === 0}
                style={{
                  width: "100%", height: 48, borderRadius: 14, border: "none",
                  background: importActiveItems.length > 0 ? "#1A1A1A" : "#EEEDEB",
                  color: importActiveItems.length > 0 ? "#fff" : "#ccc",
                  fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                  cursor: importActiveItems.length > 0 ? "pointer" : "not-allowed",
                  transition: "all 0.15s ease",
                }}
                onPointerDown={(e) => { if (importActiveItems.length > 0) e.currentTarget.style.transform = "scale(0.97)"; }}
                onPointerUp={(e) => e.currentTarget.style.transform = "scale(1)"}
                onPointerLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              >
                Add {importActiveItems.length} item{importActiveItems.length !== 1 ? "s" : ""} to Wardrobe
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Single-item UI ---
  const primaryPreview = images[0]?.previewUrl || null;
  const isWorking = isUploading || isAnalyzing;

  // Shared modal overlay + card wrapper
  const modalOverlay = {
    position: "fixed", inset: 0, zIndex: 100,
    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "var(--space-lightbox-padding)", animation: "fadeIn 0.2s ease",
  };
  const modalCard = {
    position: "relative", width: "100%", maxWidth: "var(--lightbox-max-width)",
    borderRadius: 24, overflow: "hidden", background: "#fff",
    boxShadow: "0 24px 80px rgba(0,0,0,0.3)", animation: "scaleIn 0.25s ease",
  };

  // Hidden file inputs (shared across phases)
  const fileInputs = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 1) {
            handleBulkFilesSelected(files);
          } else if (files.length === 1) {
            handleFileSelected(files[0]);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={extraFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleExtraFileSelected(file);
          e.target.value = "";
        }}
      />
    </>
  );

  const closeButton = (
    <button
      onClick={onClose}
      style={{
        position: "absolute", top: 12, right: 12, zIndex: 1,
        width: "var(--lightbox-close-size)", height: "var(--lightbox-close-size)",
        borderRadius: "calc(var(--lightbox-close-size) / 2)",
        border: "none", background: "rgba(0,0,0,0.4)", color: "#fff",
        fontSize: "var(--font-icon)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      ✕
    </button>
  );

  // --- PHASE: Capture ---
  if (phase === "capture") {
    return (
      <div onClick={onClose} style={modalOverlay}>
        <div onClick={(e) => e.stopPropagation()} style={modalCard}>
          {closeButton}
          {fileInputs}

          {/* Header */}
          <div style={{ padding: "28px 20px 4px", textAlign: "center" }}>
            <div style={{
              fontSize: 17, fontWeight: 700, color: "#1a1a1a",
              fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em",
            }}>
              Add to wardrobe
            </div>
            <div style={{
              fontSize: 13, color: "#aaa", fontFamily: "'DM Sans', sans-serif", marginTop: 4,
            }}>
              How do you want to add items?
            </div>
          </div>

          {/* Two equal choice cards */}
          <div style={{ padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Card 1: Individual garment photos */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: "100%", padding: "18px 16px", borderRadius: 18,
                border: "1.5px solid rgba(0,0,0,0.07)", background: "#FAFAF9",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
                transition: "background 0.15s ease, border-color 0.15s ease", textAlign: "left",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: "#F0EEF8",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: 26,
              }}>
                👕
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: "#1a1a1a",
                  fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em",
                }}>
                  Add garment photos
                </div>
                <div style={{
                  fontSize: 12.5, color: "#999", fontFamily: "'DM Sans', sans-serif", marginTop: 3, lineHeight: 1.4,
                }}>
                  Upload photos of individual items — select multiple for bulk add
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>

            {/* Card 2: Full outfit detection */}
            <button
              onClick={() => setMode("import")}
              style={{
                width: "100%", padding: "18px 16px", borderRadius: 18,
                border: "1.5px solid rgba(0,0,0,0.07)", background: "#FAFAF9",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
                transition: "background 0.15s ease, border-color 0.15s ease", textAlign: "left",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: "#EEF4F0",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontSize: 26,
              }}>
                🧍
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: 15, fontWeight: 600, color: "#1a1a1a",
                  fontFamily: "'DM Sans', sans-serif", letterSpacing: "-0.01em",
                }}>
                  Detect from outfit photo
                </div>
                <div style={{
                  fontSize: 12.5, color: "#999", fontFamily: "'DM Sans', sans-serif", marginTop: 3, lineHeight: 1.4,
                }}>
                  Upload one photo — we'll find each item automatically
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div style={{ padding: "0 20px 12px", fontSize: "var(--font-body)", color: "#c0392b", fontFamily: "'DM Sans', sans-serif" }}>
              {uploadError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- PHASE: Analyzing ---
  if (phase === "analyzing") {
    return (
      <div onClick={onClose} style={modalOverlay}>
        <div onClick={(e) => e.stopPropagation()} style={modalCard}>
          {closeButton}
          {fileInputs}

          <div style={{
            width: "100%", aspectRatio: "4 / 3",
            position: "relative", overflow: "hidden",
          }}>
            {primaryPreview && (
              <img src={primaryPreview} alt="Preview" style={{
                width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0,
              }} />
            )}
            <div style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 16,
                border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                animation: "spin 0.8s linear infinite",
              }} />
              <span style={{
                color: "#fff", fontSize: "var(--font-body)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
              }}>
                {isUploading ? "Uploading..." : "Analyzing..."}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- PHASE: Confirm ---
  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={(e) => e.stopPropagation()} style={modalCard}>
        {closeButton}
        {fileInputs}

        {/* Photo preview */}
        <div style={{
          width: "100%", aspectRatio: "4 / 3",
          position: "relative", overflow: "hidden", background: "#F3F2F0",
        }}>
          {primaryPreview && (
            <img src={primaryPreview} alt="Preview" style={{
              width: "100%", height: "100%", objectFit: "cover",
            }} />
          )}
        </div>

        {/* Thumbnail strip for multiple images */}
        {images.length > 0 && (
          <div style={{
            display: "flex", gap: 6, padding: "8px var(--container-padding-x) 0",
            overflowX: "auto", WebkitOverflowScrolling: "touch",
          }}>
            {images.map((img, i) => (
              <div key={i} style={{
                width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                border: i === 0 ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.1)",
                position: "relative",
              }}>
                <img src={img.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {!img.uploadedUrl && (
                  <div style={{
                    position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 7,
                      border: "2px solid #ccc", borderTopColor: "#1A1A1A",
                      animation: "spin 0.8s linear infinite",
                    }} />
                  </div>
                )}
              </div>
            ))}
            <div
              onClick={() => extraFileInputRef.current?.click()}
              style={{
                width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                border: "1px dashed rgba(0,0,0,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", fontSize: 20, color: "#bbb",
              }}
            >
              +
            </div>
          </div>
        )}

        <div style={{ padding: "16px var(--container-padding-x) var(--container-padding-x)" }}>
          {/* Error messages */}
          {uploadError && (
            <div style={{ padding: "8px 0", fontSize: "var(--font-body)", color: "#c0392b", fontFamily: "'DM Sans', sans-serif" }}>
              {uploadError}
            </div>
          )}
          {analysisError && (
            <div style={{ padding: "8px 0", fontSize: "var(--font-body)", color: "#c0392b", fontFamily: "'DM Sans', sans-serif" }}>
              {analysisError}
            </div>
          )}

          {/* AI result: emoji + name (tap to edit) */}
          {isEditingName ? (
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onBlur={() => { if (itemName.trim()) setIsEditingName(false); }}
              autoFocus
              placeholder="Item name"
              className="chat-input"
              style={{
                width: "100%", height: "var(--input-height)",
                borderRadius: "calc(var(--input-height) / 2)",
                border: "1px solid rgba(0,0,0,0.09)", background: "#fff", color: "#333",
                fontSize: "var(--font-chat)", padding: "0 var(--container-padding-x)",
                fontFamily: "'DM Sans', sans-serif", marginBottom: 12, boxSizing: "border-box",
              }}
            />
          ) : (
            <div
              onClick={() => setIsEditingName(true)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 0", marginBottom: 12, cursor: "pointer",
              }}
            >
              {aiEmoji && (
                <span style={{ fontSize: 24, flexShrink: 0 }}>{aiEmoji}</span>
              )}
              <span style={{
                fontSize: 17, fontWeight: 600, color: "#1A1A1A",
                fontFamily: "'DM Sans', sans-serif", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {itemName || "Untitled item"}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#bbb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          )}

          {/* Category pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {CATEGORIES.map((cat) => {
              const isActive = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    height: 32, padding: "0 14px", borderRadius: 16,
                    border: isActive ? "none" : "1px solid rgba(0,0,0,0.08)",
                    background: isActive ? "#1A1A1A" : "#fff",
                    color: isActive ? "#fff" : "#555",
                    fontSize: "var(--font-body)", fontWeight: 500,
                    fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                    transition: "all 0.15s ease", whiteSpace: "nowrap",
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Auto-enhance toggle */}
          {images.some(img => img.uploadedUrl) && (
            <button
              onClick={() => setAutoEnhance(v => !v)}
              style={{
                width: "100%", height: 44, borderRadius: 14, marginBottom: 10,
                border: "1px solid rgba(0,0,0,0.08)",
                background: autoEnhance ? "#F5F0FF" : "#fff",
                color: autoEnhance ? "#6B3FA0" : "#888",
                fontSize: "var(--font-body)", fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 9,
                background: autoEnhance ? "#6B3FA0" : "rgba(0,0,0,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, color: "#fff", flexShrink: 0, transition: "background 0.15s ease",
              }}>✓</span>
              ✨ Enhance photo
            </button>
          )}

          {/* Add to Wardrobe button */}
          <button
            onClick={async () => {
              if (!itemName.trim()) return;

              const uploadedImages = images.filter(img => img.uploadedUrl).map(img => img.uploadedUrl);
              onAdd({
                label: CATEGORY_TO_LABEL[category] || category,
                name: itemName.trim(),
                color: aiColor || "#E8E8E8",
                accent: aiAccent || "#D8D8D8",
                emoji: aiEmoji || "📷",
                images: uploadedImages,
                image: uploadedImages[0] || null,
                category: category,
                autoEnhance: autoEnhance && uploadedImages.length > 0,
              });
            }}
            disabled={!itemName.trim()}
            style={{
              width: "100%", height: 48, borderRadius: 14, border: "none",
              background: itemName.trim() ? "#1A1A1A" : "#EEEDEB",
              color: itemName.trim() ? "#fff" : "#ccc",
              fontSize: "var(--font-body)", fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: itemName.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, transition: "all 0.15s ease",
            }}
            onPointerDown={(e) => { if (itemName.trim()) e.currentTarget.style.transform = "scale(0.97)"; }}
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


function OutfitView({ outfit, onItemClick, hasReferencePhoto, vizStatus, onVisualizeClick, onViewVisualization, onShare, onToggleSaved, onToggleDisliked }) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);
  const [shareState, setShareState] = useState('idle'); // 'idle' | 'loading' | 'copied'
  const [showToast, setShowToast] = useState(false);
  const prefersNativeShare = isMobileShareDevice();
  const shareButtonLabel = shareState === 'copied'
    ? 'Link copied!'
    : prefersNativeShare ? 'Share outfit' : 'Copy outfit link';

  const handleShare = async () => {
    if (shareState === 'loading') return;
    setShareState('loading');
    try {
      const result = await onShare(outfit.id);
      if (result === 'copied') {
        setShareState('copied');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2500);
        setTimeout(() => setShareState('idle'), 2500);
      } else {
        // navigator.share was used (or some other share method)
        setShareState('idle');
      }
    } catch (e) {
      console.error('Share failed:', e);
      setShareState('idle');
    }
  };

  const actionButtonStyle = {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 12,
    transition: "all 0.2s ease",
    padding: 0,
  };

  return (
    <div style={{
      width: "100%",
      flexShrink: 0,
      padding: `0 var(--container-padding-x)`,
      boxSizing: "border-box",
      position: "relative",
    }}>
      {/* Toast notification */}
      {showToast && (
        <div style={{
          position: "absolute",
          top: -44,
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1A1A1A",
          color: "#fff",
          padding: "8px 16px",
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 500,
          fontFamily: "'DM Sans', sans-serif",
          whiteSpace: "nowrap",
          zIndex: 100,
          animation: "fadeInUp 0.2s ease",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          Link copied to clipboard
        </div>
      )}

      <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 16,
        alignItems: "flex-start",
      }}>
        <div
          onClick={() => setReasoningExpanded(!reasoningExpanded)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "14px 16px",
            background: reasoningExpanded ? "rgba(0,0,0,0.02)" : "transparent",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.1)",
            cursor: "pointer",
            transition: "all 0.25s ease",
          }}
        >
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{
              fontSize: "var(--font-item-name)",
              fontWeight: 600,
              color: "#666",
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Why this works
            </span>
            <span style={{
              fontSize: "var(--font-item-name)",
              color: "#888",
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
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleDisliked(outfit.id, outfit.disliked);
            }}
            style={{
              ...actionButtonStyle,
              background: outfit.disliked ? "rgba(0,0,0,0.04)" : "transparent",
              cursor: "pointer",
            }}
            title={outfit.disliked ? "Remove feedback" : "Not for me"}
            aria-label={outfit.disliked ? "Remove feedback" : "Not for me"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"
              fill={outfit.disliked ? "#1A1A1A" : "none"}
              stroke={outfit.disliked ? "#1A1A1A" : "#666"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z" />
              <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSaved(outfit.id, outfit.saved);
            }}
            style={{
              ...actionButtonStyle,
              background: outfit.saved ? "rgba(0,0,0,0.04)" : "transparent",
              cursor: "pointer",
            }}
            title={outfit.saved ? "Unsave outfit" : "Save outfit"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"
              fill={outfit.saved ? "#1A1A1A" : "none"}
              stroke={outfit.saved ? "#1A1A1A" : "#666"}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            onClick={handleShare}
            disabled={shareState === 'loading'}
            style={{
              ...actionButtonStyle,
              background: shareState === 'copied' ? "rgba(0,0,0,0.04)" : "transparent",
              cursor: shareState === 'loading' ? "wait" : "pointer",
            }}
            title={shareButtonLabel}
            aria-label={shareButtonLabel}
          >
            {shareState === 'copied' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : shareState === 'loading' ? (
              <span style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid #D8D8D8",
                borderTopColor: "#8A8A8A",
                animation: "spin 0.8s linear infinite",
                display: "block",
              }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="outfit-item-card-grid">
        {outfit.items
          .slice()
          .sort(compareOutfitItems)
          .map((item, i) => (
            <ItemCard key={i} item={item} onClick={() => onItemClick(item)} overlay />
          ))}
      </div>

      <button
        onClick={() => {
          if (vizStatus === 'ready') {
            onViewVisualization(outfit.id);
          } else if (vizStatus !== 'generating' && vizStatus !== 'queued') {
            onVisualizeClick(outfit);
          }
        }}
        disabled={!hasReferencePhoto || vizStatus === 'generating' || vizStatus === 'queued'}
        style={{
          width: "100%",
          padding: "12px 20px",
          marginTop: 16,
          marginBottom: 16,
          background: vizStatus === 'ready'
            ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
            : "transparent",
          color: vizStatus === 'ready'
            ? "#fff"
            : hasReferencePhoto ? "#666" : "#bbb",
          border: vizStatus === 'ready'
            ? "none"
            : hasReferencePhoto ? "1px solid #E0E0E0" : "1px solid #EBEBEB",
          borderRadius: 12,
          fontSize: "var(--font-body)",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: vizStatus === 'ready' ? 600 : 500,
          cursor: hasReferencePhoto && vizStatus !== 'generating' && vizStatus !== 'queued' ? "pointer" : "not-allowed",
          transition: "all 0.2s ease",
          opacity: vizStatus === 'generating' || vizStatus === 'queued' ? 0.6 : 1,
          letterSpacing: "0.01em",
        }}
      >
        {vizStatus === 'generating' ? (
          <span
            role="status"
            aria-label="Creating your look"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid #D8D8D8",
                borderTopColor: "#8A8A8A",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </span>
        ) : vizStatus === 'queued' ? (
          <span>Hang tight...</span>
        ) : vizStatus === 'ready' ? (
          <span>View your look</span>
        ) : vizStatus === 'error' ? (
          <span>Try again</span>
        ) : hasReferencePhoto ? (
          <span>See this on you 😎</span>
        ) : (
          <span>Add a photo to try things on</span>
        )}
      </button>
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

function WardrobeView({ wardrobeItems, onItemClick, onAddItemClick, enhancingItems }) {
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
        {/* Add to Wardrobe button — above category sections */}
        <div onClick={onAddItemClick} style={{
          width: "100%", padding: "14px 0", borderRadius: 14,
          border: "2px dashed rgba(0,0,0,0.10)", background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, cursor: "pointer", transition: "transform 0.15s ease", marginBottom: 8,
        }}
          onPointerDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
          onPointerUp={(e) => e.currentTarget.style.transform = "scale(1)"}
          onPointerLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
        >
          <span style={{ fontSize: 18, color: "#bbb" }}>+</span>
          <span style={{ fontSize: "var(--font-body)", color: "#999",
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
            Add to Wardrobe
          </span>
        </div>

        {filteredEntries.map(([category, items]) => (
          <div key={category} style={{ marginBottom: 16 }}>
            {activeFilter === "All" && (
              <div style={{
                fontSize: "var(--font-label-sm)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#aaa",
                fontFamily: "'DM Sans', sans-serif",
                padding: "8px 0 6px",
              }}>
                {category}
                <span style={{ fontWeight: 400, marginLeft: 6, color: "#ccc" }}>
                  {items.length}
                </span>
              </div>
            )}
            <div className="item-card-grid">
              {items.map((item, i) => (
                <ItemCard key={i} item={item} onClick={() => onItemClick(item)} isEnhancing={enhancingItems?.has(item.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavedOutfitsView({ savedOutfits, onItemClick, onToggleSaved, vizGenerations, hasReferencePhoto, onVisualizeClick, onViewVisualization }) {
  if (savedOutfits.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        textAlign: "center",
      }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <p style={{
          fontSize: "var(--font-body)",
          color: "#999",
          fontFamily: "'DM Sans', sans-serif",
          lineHeight: 1.5,
          maxWidth: 260,
          margin: 0,
        }}>
          No saved outfits yet. Tap the bookmark icon on any outfit to save it here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        className="outfit-scroll-panel"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: `0 var(--container-padding-x) calc(24px + var(--safe-bottom))`,
        }}
      >
        {savedOutfits.map((outfit) => {
          const vizStatus = vizGenerations?.[outfit.id]?.status;
          return (
            <div key={outfit.id} style={{ marginBottom: 24 }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}>
                <span style={{
                  fontSize: "var(--font-body)",
                  fontWeight: 600,
                  color: "#1A1A1A",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  {outfit.vibe}
                </span>
                <button
                  onClick={() => onToggleSaved(outfit.id, true)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                  }}
                  title="Unsave outfit"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24"
                    fill="#1A1A1A" stroke="#1A1A1A"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </div>
              <div className="item-card-grid">
                {outfit.items.map((item, i) => (
                  <ItemCard key={i} item={item} onClick={() => onItemClick(item)} />
                ))}
              </div>
              <button
                onClick={() => {
                  if (vizStatus === 'ready') {
                    onViewVisualization(outfit.id);
                  } else if (vizStatus !== 'generating' && vizStatus !== 'queued') {
                    onVisualizeClick(outfit);
                  }
                }}
                disabled={!hasReferencePhoto || vizStatus === 'generating' || vizStatus === 'queued'}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  marginTop: 16,
                  background: vizStatus === 'ready'
                    ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                    : "transparent",
                  color: vizStatus === 'ready'
                    ? "#fff"
                    : hasReferencePhoto ? "#666" : "#bbb",
                  border: vizStatus === 'ready'
                    ? "none"
                    : hasReferencePhoto ? "1px solid #E0E0E0" : "1px solid #EBEBEB",
                  borderRadius: 12,
                  fontSize: "var(--font-body)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: vizStatus === 'ready' ? 600 : 500,
                  cursor: hasReferencePhoto && vizStatus !== 'generating' && vizStatus !== 'queued' ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                  opacity: vizStatus === 'generating' || vizStatus === 'queued' ? 0.6 : 1,
                  letterSpacing: "0.01em",
                }}
              >
                {vizStatus === 'generating' ? (
                  <span
                    role="status"
                    aria-label="Creating your look"
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%",
                      border: "2px solid #D8D8D8", borderTopColor: "#8A8A8A",
                      animation: "spin 0.8s linear infinite",
                    }} />
                  </span>
                ) : vizStatus === 'queued' ? (
                  <span>Hang tight...</span>
                ) : vizStatus === 'ready' ? (
                  <span>View your look</span>
                ) : vizStatus === 'error' ? (
                  <span>Try again</span>
                ) : hasReferencePhoto ? (
                  <span>See this on you 😎</span>
                ) : (
                  <span>Add a photo to try things on</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TypingIndicator() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % TYPING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      alignSelf: 'flex-start',
      maxWidth: '82%',
    }}>
      <div style={{
        padding: 'var(--space-reasoning-padding)',
        borderRadius: '16px 16px 16px 4px',
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 48,
      }}>
        <div style={{
          display: 'flex',
          gap: 4,
          flexShrink: 0,
        }}>
          {[0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#999',
                animation: `typingDot 1.4s infinite ease-in-out`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
        <span
          key={messageIndex}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            color: '#999',
            animation: 'fadeInUp 0.3s ease',
          }}
        >
          {TYPING_MESSAGES[messageIndex]}
        </span>
      </div>
    </div>
  );
}

function ChatView({
  messages,
  inputValue,
  setInputValue,
  onSend,
  onChipTap,
  onCtaAction,
  pendingImage,
  onImageSelect,
  onImageRemove,
  isWaitingForFirstToken,
  isGenerating,
  weather,
  hasLocation,
  onOpenProfile,
}) {
  const chatMessagesRef = useRef(null);
  const isInitialMount = useRef(true);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const canSend = !isGenerating && (inputValue.trim() || pendingImage);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const container = chatMessagesRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: isInitialMount.current ? "instant" : "smooth",
    });
    isInitialMount.current = false;
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [inputValue]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
      }}
      onDrop={(e) => {
        setIsDragOver(false);
        const file = getImageFileFromDrop(e);
        if (file) onImageSelect(file);
      }}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {isDragOver && (
        <div style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          border: "2px dashed #999",
          borderRadius: 16,
          margin: 8,
          pointerEvents: "none",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span style={{
            fontSize: "var(--font-body)",
            color: "#999",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500,
          }}>
            Drop image here
          </span>
        </div>
      )}
      <div
        ref={chatMessagesRef}
        className="chat-messages"
        style={{
          flex: 1,
          minHeight: 0,
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
            padding: "20px 20px",
          }}>
            {weather ? (
              <button
                onClick={onOpenProfile}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 16,
                  border: "1px solid rgba(0,0,0,0.09)",
                  background: "#fff",
                  color: "#555",
                  fontSize: "var(--font-caption)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  cursor: "pointer",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 14 }}>{weatherIconToEmoji(weather.icon)}</span>
                {weather.temp}°C {weather.city}
              </button>
            ) : !hasLocation ? (
              <button
                onClick={onOpenProfile}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 16,
                  border: "1px dashed rgba(0,0,0,0.15)",
                  background: "transparent",
                  color: "#999",
                  fontSize: "var(--font-caption)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 500,
                  cursor: "pointer",
                  marginBottom: 4,
                }}
              >
                Set location for weather-aware outfits
              </button>
            ) : null}
            <span style={{ fontSize: 40 }}>{getGreeting().emoji}</span>
            <span style={{
              fontSize: "var(--font-title)",
              fontFamily: "'Instrument Serif', serif",
              fontWeight: 400,
              color: "#1A1A1A",
            }}>
              {getGreeting().text}
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
          <>
          <div style={{ flex: 1 }} />
          {messages.map((msg, i) => (
            <div
              key={msg.id ?? i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "82%",
              }}
            >
              {(msg.text || msg.image || msg.isStreaming) && (
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
                  overflowWrap: "break-word",
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
                  <span>{msg.text}</span>
                  {msg.isStreaming && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        marginLeft: 2,
                        opacity: 0.8,
                        animation: "blink 1s step-end infinite",
                      }}
                    >
                      |
                    </span>
                  )}
                </div>
              )}
              {msg.cta && (
                <button
                  onClick={() => onCtaAction(msg.cta.action)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    height: 48,
                    borderRadius: 14,
                    border: "none",
                    background: "#E8E5E0",
                    color: "#5C5652",
                    fontSize: "var(--font-body)",
                    fontWeight: 600,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "all 0.15s ease",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  }}
                  onPointerDown={(e) => {
                    e.currentTarget.style.transform = "scale(0.97)";
                    e.currentTarget.style.background = "#DBD8D3";
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "#E8E5E0";
                  }}
                  onPointerLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.background = "#E8E5E0";
                  }}
                >
                  <span style={{ fontSize: 16 }}>🪞</span>
                  {msg.cta.label}
                  <span style={{ fontSize: 14, opacity: 0.7 }}>→</span>
                </button>
              )}
            </div>
          ))}
          </>
        )}
        {isWaitingForFirstToken && <TypingIndicator />}
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
          disabled={isGenerating}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImageSelect(file);
            e.target.value = "";
          }}
        />
        <div style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isGenerating}
            style={{
              width: "var(--input-height)",
              height: "var(--input-height)",
              borderRadius: "calc(var(--input-height) / 2)",
              border: "1px solid rgba(0,0,0,0.09)",
              background: isGenerating ? "#F5F4F2" : "#fff",
              color: isGenerating ? "#c5c5c5" : "#888",
              cursor: isGenerating ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
              flexShrink: 0,
              padding: 0,
            }}
            onPointerDown={(e) => {
              if (isGenerating) return;
              e.currentTarget.style.transform = "scale(0.93)";
              e.currentTarget.style.background = "#F3F2F0";
            }}
            onPointerUp={(e) => {
              if (isGenerating) return;
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.background = "#fff";
            }}
            onPointerLeave={(e) => {
              if (isGenerating) return;
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
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={inputValue}
            disabled={isGenerating}
            rows={1}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Type a message..."
            style={{
              flex: 1,
              minHeight: "var(--input-height)",
              maxHeight: 160,
              overflowY: "auto",
              borderRadius: 20,
              border: "1px solid rgba(0,0,0,0.09)",
              background: "#fff",
              color: "#333",
              fontSize: "var(--font-chat)",
              padding: "12px var(--container-padding-x)",
              fontFamily: "'DM Sans', sans-serif",
              resize: "none",
              lineHeight: 1.5,
              display: "block",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={onSend}
            disabled={!canSend}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  return (
    <div
      onClick={() => onSelect(chat.id)}
      style={{
        padding: "10px 16px",
        cursor: "pointer",
        transition: "background 0.15s ease",
        position: "relative",
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
            ref={menuButtonRef}
            onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
            aria-label="Chat options"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              padding: "4px 8px",
              color: "#999",
              display: "flex",
              alignItems: "center",
            }}
          >
            ⋯
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
      {menuOpen && (
        <KebabMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={menuButtonRef}
          options={[
            {
              label: chat.starred ? "Unstar" : "Star",
              icon: chat.starred ? "★" : "☆",
              onClick: () => onToggleStar(chat.id, chat.starred)
            },
            {
              label: "Delete",
              icon: "🗑",
              onClick: () => onDelete(chat.id),
              destructive: true
            }
          ]}
        />
      )}
    </div>
  );
}

function KebabMenu({ isOpen, onClose, options, anchorRef }) {
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const menuWidth = 160;
    const menuHeight = options.length * 44 + 8; // 44px per item + padding

    // Position to the right of the button, or left if not enough space
    let left = rect.right + 8;
    if (left + menuWidth > window.innerWidth) {
      left = rect.left - menuWidth - 8;
    }

    // Position aligned with button top, adjust if overflows bottom
    let top = rect.top;
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 8;
    }

    setMenuPosition({ top, left });
  }, [isOpen, anchorRef, options.length]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 299,
        }}
      />
      {/* Menu */}
      <div
        style={{
          position: "fixed",
          top: menuPosition.top,
          left: menuPosition.left,
          background: "white",
          borderRadius: 8,
          boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          padding: "4px 0",
          zIndex: 300,
          minWidth: 160,
        }}
      >
        {options.map((option, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              option.onClick();
              onClose();
            }}
            disabled={option.disabled}
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "none",
              background: "transparent",
              cursor: option.disabled ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "var(--font-body)",
              fontFamily: "'DM Sans', sans-serif",
              color: option.destructive ? "#D32F2F" : option.disabled ? "#ccc" : "#1A1A1A",
              textAlign: "left",
              transition: "background 0.15s ease",
              opacity: option.disabled ? 0.5 : 1,
            }}
            onPointerEnter={(e) => !option.disabled && (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
            onPointerLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </>
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

function BodyFitCard({ profile, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile.body);

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
          🪞 Style Preferences
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
          🪞 Style Preferences
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

function LocationCard({ profile, onSave, focusLocation, onClearFocusLocation }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCity, setSelectedCity] = useState(null);
  const [error, setError] = useState(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const debounceRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const cardRef = useRef(null);
  const shouldFocusRef = useRef(false);

  const displayCity = profile.location?.country
    ? `${profile.location.city}, ${profile.location.country}`
    : profile.location?.city || "";

  const handleInputChange = (e) => {
    const value = e.target.value;
    setDraft(value);
    setSelectedCity(null);
    setError(null);
    setHighlightedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const results = await searchCities(value);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    }, 300);
  };

  const handleSelect = (city) => {
    const display = city.country ? `${city.name}, ${city.country}` : city.name;
    setDraft(display);
    setSelectedCity(city);
    setSuggestions([]);
    setShowDropdown(false);
    setError(null);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const handleSave = () => {
    if (!draft.trim()) {
      onSave({ ...profile, location: null, lastUpdated: new Date().toISOString() });
      setIsEditing(false);
      setError(null);
      return;
    }
    if (!selectedCity) {
      setError("Please select a city from the suggestions.");
      return;
    }
    onSave({
      ...profile,
      location: { city: selectedCity.name, country: selectedCity.country, source: "manual" },
      lastUpdated: new Date().toISOString(),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(displayCity);
    setSelectedCity(null);
    setSuggestions([]);
    setShowDropdown(false);
    setIsEditing(false);
    setError(null);
  };

  const startEditing = () => {
    setDraft(displayCity);
    setSelectedCity(profile.location?.city ? { name: profile.location.city, country: profile.location.country || "" } : null);
    setIsEditing(true);
  };

  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    setError(null);
    try {
      const city = await detectLocationFromBrowser();
      onSave({
        ...profile,
        location: { city: city.name, country: city.country, source: "geolocation" },
        lastUpdated: new Date().toISOString(),
      });
      setIsEditing(false);
    } catch (err) {
      const msg = err.code === 1
        ? "Location access denied. Please allow location access or type your city."
        : err.message || "Could not detect location.";
      setError(msg);
    } finally {
      setDetectingLocation(false);
    }
  };

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    if (focusLocation) {
      shouldFocusRef.current = true;
      startEditing();
      onClearFocusLocation?.();
    }
  }, [focusLocation]);

  useEffect(() => {
    if (isEditing && shouldFocusRef.current && inputRef.current) {
      shouldFocusRef.current = false;
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div ref={cardRef} style={{
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
          Location
        </h3>

        <div style={{ marginBottom: 16, position: "relative" }} ref={dropdownRef}>
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
            City
          </label>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="e.g., New York"
            autoComplete="off"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: `2px solid ${error ? "#D32F2F" : "#E5E5E5"}`,
              fontSize: "var(--font-body)",
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
            }}
          />
          {showDropdown && suggestions.length > 0 && (
            <ul style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "#fff",
              border: "1px solid #E5E5E5",
              borderRadius: 8,
              marginTop: 4,
              padding: 0,
              listStyle: "none",
              zIndex: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}>
              {suggestions.map((city, i) => {
                const label = [city.name, city.admin1, city.country].filter(Boolean).join(", ");
                return (
                  <li
                    key={`${city.name}-${city.admin1}-${city.country}`}
                    onMouseDown={() => handleSelect(city)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    style={{
                      padding: "10px 16px",
                      cursor: "pointer",
                      fontSize: "var(--font-body)",
                      fontFamily: "'DM Sans', sans-serif",
                      background: i === highlightedIndex ? "#F5F5F5" : "#fff",
                      color: "#333",
                    }}
                  >
                    {label}
                  </li>
                );
              })}
            </ul>
          )}
          {error ? (
            <span style={{
              display: "block",
              fontSize: "var(--font-caption)",
              color: "#D32F2F",
              marginTop: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {error}
            </span>
          ) : (
            <span style={{
              display: "block",
              fontSize: "var(--font-caption)",
              color: "#999",
              marginTop: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Used to give you weather-aware outfit recommendations.
            </span>
          )}
          {typeof navigator !== "undefined" && navigator.geolocation && (
            <button
              onClick={handleDetectLocation}
              disabled={detectingLocation}
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #E5E5E5",
                background: "#F9F9F9",
                color: "#555",
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                cursor: detectingLocation ? "default" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                opacity: detectingLocation ? 0.7 : 1,
              }}
            >
              <span>📍</span>
              {detectingLocation ? "Detecting…" : "Use my location"}
            </button>
          )}
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
    <div ref={cardRef} style={{
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
          Location
        </h3>
        <button
          onClick={startEditing}
          style={{
            padding: "4px 12px",
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
        fontSize: "var(--font-body)",
        color: "#333",
        fontFamily: "'DM Sans', sans-serif",
        lineHeight: 1.6,
      }}>
        {profile.location?.city ? (
          <div><strong>City:</strong> {displayCity}</div>
        ) : (
          <div style={{ color: "#999" }}>Not set — add your city for weather-aware outfits</div>
        )}
      </div>
    </div>
  );
}

function StyleContextCard({ profile, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile.styleContext || { notes: "" });

  const handleSave = () => {
    onSave({ ...profile, styleContext: draft, lastUpdated: new Date().toISOString() });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(profile.styleContext || { notes: "" });
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
          ✨ Style Context
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
            Additional Context
          </label>
          <textarea
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="Add any additional context about your style, occasions, preferences..."
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 8,
              border: "2px solid #E5E5E5",
              fontSize: "var(--font-body)",
              fontFamily: "'DM Sans', sans-serif",
              outline: "none",
              minHeight: 120,
              resize: "vertical",
              lineHeight: 1.6,
            }}
          />
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
          ✨ Style Context
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
        whiteSpace: "pre-wrap",
      }}>
        {draft.notes?.trim() ? (
          <div>{draft.notes}</div>
        ) : (
          <div style={{ color: "#999" }}>Not set</div>
        )}
      </div>
    </div>
  );
}

function ReferencePhotoCard({ profile, onSave }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const preprocessAbortRef = useRef(null);

  // Safety check
  if (!profile) {
    return null;
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    if (!validTypes.includes(file.type)) {
      setUploadError('Please upload a JPEG, PNG, WebP, or HEIC image');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image must be smaller than 10MB');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    // Abort any in-flight preprocessing from a previous upload
    if (preprocessAbortRef.current) {
      preprocessAbortRef.current.abort();
    }

    try {
      const url = await uploadImage(file, { normalizeAspectRatio: true });

      const updatedProfile = {
        ...profile,
        referencePhoto: {
          url,
          uploadedAt: new Date().toISOString(),
          preprocessedUrl: null,
        }
      };

      onSave(updatedProfile);

      // Clear visualization cache when photo changes
      clearVisualizationCache();

      // Fire preprocessing in background (non-blocking)
      setIsPreprocessing(true);
      const abortController = new AbortController();
      preprocessAbortRef.current = abortController;

      preprocessReferencePhotoClient(url, { signal: abortController.signal })
        .then(preprocessedUrl => {
          if (!abortController.signal.aborted) {
            onSave(prev => ({
              ...prev,
              referencePhoto: {
                ...prev.referencePhoto,
                preprocessedUrl,
              }
            }));
            setIsPreprocessing(false);
          }
        })
        .catch(err => {
          if (!abortController.signal.aborted) {
            console.warn('[ReferencePhotoCard] Preprocessing failed:', err.message);
            setIsPreprocessing(false);
          }
        });
    } catch (error) {
      console.error('Failed to upload reference photo:', error);
      setUploadError('Failed to upload photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = () => {
    if (preprocessAbortRef.current) {
      preprocessAbortRef.current.abort();
    }
    setIsPreprocessing(false);
    const updatedProfile = {
      ...profile,
      referencePhoto: null
    };
    onSave(updatedProfile);
    clearVisualizationCache();
  };

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
          📸 Reference Photo
        </h3>
      </div>

      <p style={{
        fontSize: "var(--font-caption)",
        color: "#666",
        marginBottom: 16,
        lineHeight: 1.5,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Upload a full-body photo to see outfit recommendations visualized on you
      </p>

      {profile.referencePhoto ? (
        <div>
          <img
            src={profile.referencePhoto.url}
            alt="Reference photo"
            style={{
              width: "100%",
              maxWidth: 300,
              borderRadius: 12,
              marginBottom: 12,
              display: "block"
            }}
          />
          {isPreprocessing && (
            <div style={{
              padding: 8,
              marginBottom: 8,
              background: '#FFF8E1',
              border: '1px solid #FFE082',
              borderRadius: 8,
              fontSize: 'var(--font-caption)',
              color: '#F57F17',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              Optimizing your photo for visualizations...
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              disabled={isUploading}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #E5E5E5",
                background: "#fff",
                color: "#666",
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                cursor: isUploading ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                opacity: isUploading ? 0.5 : 1
              }}
            >
              {isUploading ? "Uploading..." : "Replace Photo"}
            </button>
            <button
              onClick={handleRemove}
              disabled={isUploading}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid #FFE5E5",
                background: "#fff",
                color: "#D32F2F",
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                cursor: isUploading ? "not-allowed" : "pointer",
                fontFamily: "'DM Sans', sans-serif",
                opacity: isUploading ? 0.5 : 1
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isUploading}
            style={{
              width: "100%",
              padding: "40px 20px",
              borderRadius: 12,
              border: "2px dashed #E5E5E5",
              background: "#FAFAFA",
              color: "#666",
              fontSize: "var(--font-body)",
              fontWeight: 600,
              cursor: isUploading ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif",
              transition: "all 0.2s ease",
              opacity: isUploading ? 0.5 : 1
            }}
          >
            {isUploading ? "Uploading..." : "+ Upload Reference Photo"}
          </button>
        </div>
      )}

      {uploadError && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: "#FFEBEE",
          border: "1px solid #FFCDD2",
          borderRadius: 8,
          color: "#D32F2F",
          fontSize: "var(--font-caption)",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {uploadError}
        </div>
      )}
    </div>
  );
}

function ProfileView({ profile, onSave, focusLocation, onClearFocusLocation }) {
  const isComplete = profile.body.height.value &&
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

      <ReferencePhotoCard profile={profile} onSave={onSave} />
      <LocationCard profile={profile} onSave={onSave} focusLocation={focusLocation} onClearFocusLocation={onClearFocusLocation} />
      <BodyFitCard profile={profile} onSave={onSave} />
      <StylePreferencesCard profile={profile} onSave={onSave} />
      <StyleContextCard profile={profile} onSave={onSave} />
    </div>
  );
}

function SidePanel({ isOpen, onClose, onNewChat, onOpenWardrobe, onOpenProfile, onOpenSaved, savedCount, chatHistory, onSelectChat, onToggleStar, onDeleteChat, onSignOut }) {
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

        {/* Sidebar nav items */}
        <div style={{ padding: "16px 8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <button
            onClick={onNewChat}
            style={{
              width: "100%",
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#1A1A1A",
              fontSize: "var(--font-body)",
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "0 12px",
              gap: 8,
              transition: "background 0.15s ease",
            }}
            onPointerDown={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
            onPointerUp={(e) => e.currentTarget.style.background = "transparent"}
            onPointerLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <line x1="12" y1="8" x2="12" y2="14" />
              <line x1="9" y1="11" x2="15" y2="11" />
            </svg>
            New Chat
          </button>

          <button
            onClick={onOpenWardrobe}
            style={{
              width: "100%",
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#1A1A1A",
              fontSize: "var(--font-body)",
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "0 12px",
              gap: 8,
              transition: "background 0.15s ease",
            }}
            onPointerDown={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
            onPointerUp={(e) => e.currentTarget.style.background = "transparent"}
            onPointerLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v16H4z" />
              <path d="M9 4v16" />
              <path d="M15 4v16" />
              <path d="M4 9h16" />
              <path d="M4 15h16" />
            </svg>
            Full Wardrobe
          </button>

          <button
            onClick={onOpenSaved}
            style={{
              width: "100%",
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#1A1A1A",
              fontSize: "var(--font-body)",
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "0 12px",
              gap: 8,
              transition: "background 0.15s ease",
            }}
            onPointerDown={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
            onPointerUp={(e) => e.currentTarget.style.background = "transparent"}
            onPointerLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Saved Outfits
            {savedCount > 0 && (
              <span style={{
                fontSize: "var(--font-caption)",
                color: "#999",
                fontWeight: 400,
              }}>
                {savedCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenProfile}
            style={{
              width: "100%",
              height: 40,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#1A1A1A",
              fontSize: "var(--font-body)",
              fontWeight: 500,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              padding: "0 12px",
              gap: 8,
              transition: "background 0.15s ease",
            }}
            onPointerDown={(e) => e.currentTarget.style.background = "rgba(0,0,0,0.05)"}
            onPointerUp={(e) => e.currentTarget.style.background = "transparent"}
            onPointerLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            My Profile
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

          {/* Sign Out */}
          <div style={{ padding: "0 16px 16px" }}>
            <button
              onClick={onSignOut}
              style={{
                width: "100%",
                height: 40,
                borderRadius: 12,
                border: "none",
                background: "transparent",
                color: "#999",
                fontSize: "var(--font-body)",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "color 0.15s ease",
              }}
              onPointerEnter={(e) => e.currentTarget.style.color = "#666"}
              onPointerLeave={(e) => e.currentTarget.style.color = "#999"}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function OutfitRecommendations() {
  const { signOut } = useAuth();
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("chat");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState([]);
  const [outfits, setOutfits] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWaitingForFirstToken, setIsWaitingForFirstToken] = useState(false);
  const [lightboxItem, setLightboxItem] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [scrollLock, setScrollLock] = useState(null); // 'horizontal' | 'vertical' | null
  const [touchStartY, setTouchStartY] = useState(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [wardrobeItems, setWardrobeItems] = useState({});
  const [wardrobeFlat, setWardrobeFlat] = useState([]);
  const [enhancingItems, setEnhancingItems] = useState(new Set());
  const [chatHistory, setChatHistory] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [profile, setProfile] = useState(SAMPLE_PROFILE);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const vizGenerations = useSyncExternalStore(subscribeVizRegistry, getVizRegistrySnapshot);
  const [vizModalOutfitId, setVizModalOutfitId] = useState(null);
  const [weather, setWeather] = useState(null);
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [focusLocation, setFocusLocation] = useState(false);
  const chatSessionRef = useRef(0);
  const streamAbortRef = useRef(null);

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

  // Prune stale viz entries when outfits change (new recommendations)
  useEffect(() => {
    const activeIds = [...outfits.map(o => o.id), ...savedOutfits.map(o => o.id)];
    pruneVizRegistry(activeIds);
  }, [outfits, savedOutfits]);

  useEffect(() => {
    if (!profileLoaded) return;
    db.saveProfile(profile).catch(err =>
      console.error("Failed to save profile:", err)
    );
  }, [profile, profileLoaded]);

  // Migrate old profiles: trigger preprocessing if not yet done
  useEffect(() => {
    if (!profileLoaded) return;
    if (!profile.referencePhoto?.url) return;
    if (profile.referencePhoto.preprocessedUrl) return;

    preprocessReferencePhotoClient(profile.referencePhoto.url)
      .then(preprocessedUrl => {
        setProfile(prev => {
          if (!prev.referencePhoto?.url || prev.referencePhoto.preprocessedUrl) return prev;
          return {
            ...prev,
            referencePhoto: {
              ...prev.referencePhoto,
              preprocessedUrl,
            }
          };
        });
      })
      .catch(err => {
        console.warn('[profile migration] Preprocessing failed:', err.message);
      });
  }, [profileLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const city = profile.location?.city;
    if (!city) { setWeather(null); return; }
    fetchWeatherForDisplay(city).then(setWeather);
  }, [profile.location?.city]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [grouped, flat, chats, dbProfile, saved] = await Promise.all([
          db.fetchWardrobeItems(),
          db.fetchWardrobeItemsFlat(),
          db.fetchChats(),
          db.fetchProfile(),
          db.fetchSavedOutfits(),
        ]);
        setWardrobeItems(grouped);
        setWardrobeFlat(flat);
        setChatHistory(chats);
        setSavedOutfits(saved);

        if (dbProfile && Object.keys(dbProfile).length > 0) {
          setProfile(prev => ({ ...prev, ...dbProfile }));
        } else {
          // One-time migration from localStorage
          try {
            const localProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
            if (localProfile) {
              const parsed = JSON.parse(localProfile);
              await db.saveProfile(parsed);
              setProfile(prev => ({ ...prev, ...parsed }));
              localStorage.removeItem(PROFILE_STORAGE_KEY);
            }
          } catch (migrationErr) {
            console.error("Failed to migrate localStorage profile:", migrationErr);
          }
        }
        setProfileLoaded(true);
      } catch (err) {
        console.error("Failed to load initial data:", err);
        setProfileLoaded(true);
      }
    }
    loadInitialData();
  }, []);

  const cancelActiveStream = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current();
      streamAbortRef.current = null;
    }
    setIsWaitingForFirstToken(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamAbortRef.current) {
        streamAbortRef.current();
      }
    };
  }, []);

  const DIRECTION_THRESHOLD = 10; // pixels to determine direction

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
    setScrollLock(null);
    setIsDragging(false);
  };

  const handleTouchMove = (e) => {
    if (touchStart === null || touchStartY === null) return;

    const deltaX = e.touches[0].clientX - touchStart;
    const deltaY = e.touches[0].clientY - touchStartY;

    // Determine scroll direction if not locked
    if (scrollLock === null) {
      if (Math.abs(deltaX) > DIRECTION_THRESHOLD || Math.abs(deltaY) > DIRECTION_THRESHOLD) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          setScrollLock('horizontal');
          setIsDragging(true);
        } else {
          setScrollLock('vertical');
        }
      }
      return;
    }

    // Only process horizontal swipes
    if (scrollLock === 'horizontal') {
      e.preventDefault(); // Prevent vertical scroll
      setTouchDelta(deltaX);
    }
    // If vertical, let native scroll handle it
  };

  const handleTouchEnd = () => {
    if (scrollLock === 'horizontal' && Math.abs(touchDelta) > 60) {
      if (touchDelta < 0 && current < outfits.length - 1) setCurrent(current + 1);
      else if (touchDelta > 0 && current > 0) setCurrent(current - 1);
    }

    setTouchStart(null);
    setTouchStartY(null);
    setTouchDelta(0);
    setIsDragging(false);
    setScrollLock(null);
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

  const handleEnhanceWardrobeItemImage = useCallback((itemId, imageUrl, item) => {
    setEnhancingItems(prev => new Set([...prev, itemId]));
    enhanceItemImage(imageUrl, item)
      .then(async ({ imageUrl: enhancedUrl }) => {
        const current = wardrobeFlat.find(i => i.id === itemId);
        const updatedImages = [enhancedUrl, ...(current?.images ?? [imageUrl])];
        await db.updateWardrobeItemImages(itemId, updatedImages);
        const [grouped, flat] = await Promise.all([
          db.fetchWardrobeItems(),
          db.fetchWardrobeItemsFlat(),
        ]);
        setWardrobeItems(grouped);
        setWardrobeFlat(flat);
        setLightboxItem(prev => prev?.id === itemId ? { ...prev, images: updatedImages, image: enhancedUrl } : prev);
      })
      .catch(err => console.error('[enhance-item-image]', err))
      .finally(() => {
        setEnhancingItems(prev => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      });
  }, [wardrobeFlat]);

  const handleAddItem = useCallback(async (newItem) => {
    try {
      const { autoEnhance, ...itemData } = newItem;
      const saved = await db.addWardrobeItem(itemData);
      const [grouped, flat] = await Promise.all([
        db.fetchWardrobeItems(),
        db.fetchWardrobeItemsFlat(),
      ]);
      setWardrobeItems(grouped);
      setWardrobeFlat(flat);
      setAddItemModalOpen(false);
      if (autoEnhance && saved?.id && itemData.images?.[0]) {
        handleEnhanceWardrobeItemImage(saved.id, itemData.images[0], itemData);
      }
    } catch (err) {
      console.error("Failed to add wardrobe item:", err);
    }
  }, [handleEnhanceWardrobeItemImage]);

  const handleBulkAddItems = useCallback(async (items, { autoEnhance = false } = {}) => {
    try {
      const saved = await db.addWardrobeItemsBulk(items);
      const [grouped, flat] = await Promise.all([
        db.fetchWardrobeItems(),
        db.fetchWardrobeItemsFlat(),
      ]);
      setWardrobeItems(grouped);
      setWardrobeFlat(flat);
      setAddItemModalOpen(false);
      if (autoEnhance) {
        for (const savedItem of saved) {
          if (savedItem.id && savedItem.images?.[0]) {
            handleEnhanceWardrobeItemImage(savedItem.id, savedItem.images[0], savedItem);
          }
        }
      }
    } catch (err) {
      console.error("Failed to bulk add wardrobe items:", err);
    }
  }, [handleEnhanceWardrobeItemImage]);

  const isCurrentVisualizationUrl = (url) => typeof url === "string" && url.includes("/visualizations/v2/");

  // Pre-populate viz registry for saved outfits that have visualization URLs
  useEffect(() => {
    if (savedOutfits.length === 0) return;
    for (const outfit of savedOutfits) {
      if (getVizEntry(outfit.id)) continue;
      const urls = outfit.visualizationUrls || (outfit.visualizationUrl ? { front: outfit.visualizationUrl } : null);
      const compatibleUrls = urls
        ? Object.fromEntries(
          Object.entries(urls).filter(([, url]) => isCurrentVisualizationUrl(url))
        )
        : null;
      if (compatibleUrls?.front) {
        hydrateVizEntry(outfit.id, {
          status: 'ready',
          poses: buildReadyPoseEntries(compatibleUrls),
          outfit,
        });
      }
    }
  }, [savedOutfits]);

  const startVisualizationSequence = useCallback(async (outfit) => {
    const referencePhotoUrl = getVisualizationReferenceUrl(profile);
    if (!referencePhotoUrl) return;

    cancelQueuedVisualizationTasks(outfit.id);
    setVizEntry(outfit.id, {
      status: 'queued',
      poses: buildQueuedPoseEntries(),
      outfit,
    });

    const completedUrls = {};

    await generateMultiPoseVisualization({
      referencePhotoUrl,
      outfit,
      userProfile: profile,
      onPoseStart: (pose) => {
        updateVizPose(outfit.id, pose, makePoseEntry('generating'));
      },
      onPoseComplete: (pose, result) => {
        const resolvedId = getResolvedVizId(outfit.id);
        if (result.imageUrl) {
          completedUrls[pose] = result.imageUrl;
          setCachedVisualization(resolvedId, referencePhotoUrl, completedUrls);
          db.saveVisualizationUrls(resolvedId, completedUrls).catch(err =>
            console.error("Failed to save visualization URLs:", err)
          );
        }

        updateVizPose(outfit.id, pose, result);
      }
    });
  }, [profile]);

  const handleVisualizeOutfit = useCallback(async (outfit) => {
    if (!profile.referencePhoto) {
      console.log('No reference photo available');
      return;
    }

    // Check cache first
    const cachedPoses = getCachedVisualization(outfit.id, getVisualizationReferenceUrl(profile));
    if (cachedPoses?.front) {
      setVizEntry(outfit.id, {
        status: 'ready',
        poses: buildReadyPoseEntries(cachedPoses),
        outfit,
      });
      setVizModalOutfitId(outfit.id);
      return;
    }

    const currentEntry = getVizEntry(outfit.id);

    // Already queued or generating — do nothing
    if (currentEntry?.status === 'generating' || currentEntry?.status === 'queued') return;

    // Already ready — open modal
    if (currentEntry?.status === 'ready') {
      setVizModalOutfitId(outfit.id);
      return;
    }

    await startVisualizationSequence(outfit);
  }, [profile, startVisualizationSequence]);

  const handleRegenerateVisualization = useCallback(async (outfitId) => {
    const genEntry = getVizEntry(outfitId);
    if (!genEntry?.outfit) return;
    if (hasPendingVisualizationPose(genEntry.poses)) return;

    cancelQueuedVisualizationTasks(outfitId);
    await startVisualizationSequence(genEntry.outfit);
  }, [startVisualizationSequence]);

  const allWardrobeItems = wardrobeFlat;

  const handleSendMessage = useCallback(async (text) => {
    const messageText = text || inputValue.trim();
    if ((!messageText && !pendingImage) || isGenerating) return;
    cancelActiveStream();

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
    let capturedFile = null;
    if (pendingImage) {
      newMessage.image = pendingImage.previewUrl;
      capturedFile = pendingImage.file;
      setPendingImage(null);
    }

    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    setIsGenerating(true);
    setIsWaitingForFirstToken(true);

    // Upload image if attached, then save to DB with permanent URL
    let imageUrl = null;
    if (capturedFile) {
      try {
        imageUrl = await uploadImage(capturedFile);
        setMessages(prev => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'user' && copy[i].image?.startsWith('blob:')) {
              copy[i] = { ...copy[i], image: imageUrl };
              break;
            }
          }
          return copy;
        });
      } catch (err) {
        console.error("Image upload failed:", err);
      }
    }

    if (chatId) {
      db.saveMessage({ chatId, role: "user", content: messageText, imageUrl, metadata: {} }).catch(err =>
        console.error("Failed to save user message:", err)
      );
    }
    track('chat_message_sent', { has_image: !!imageUrl });

    // Build conversation history for the API (includes image URLs for multimodal messages)
    const conversationHistory = buildConversationHistory(messages, messageText, imageUrl);

    const streamId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const assistantMessageId = `assistant-${streamId}`;
    let streamedMessage = "";
    let hasStreamedToken = false;

    try {
      const result = await new Promise((resolve, reject) => {
        streamAbortRef.current = sendChatMessageStreaming({
          messages: conversationHistory,
          wardrobeItems: allWardrobeItems,
          profile,
          location: profile.location,
          onToken: (token) => {
            if (chatSessionRef.current !== sessionId || !token) return;

            streamedMessage += token;
            setIsWaitingForFirstToken(false);

            if (!hasStreamedToken) {
              hasStreamedToken = true;
              setMessages((prev) => [
                ...prev,
                { id: assistantMessageId, role: "assistant", text: token },
              ]);
              return;
            }

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, text: `${msg.text || ""}${token}` }
                  : msg
              )
            );
          },
          onMessageDone: () => {},
          onComplete: (payload) => resolve(payload),
          onError: (error) => reject(error),
        });
      });

      if (chatSessionRef.current !== sessionId) return;
      streamAbortRef.current = null;
      setIsWaitingForFirstToken(false);

      const finalAssistantMessage = result.message || streamedMessage.trim();
      const assistantMessageMetadata = buildAssistantMessageMetadata({ outfits: result.outfits });
      const assistantMessageCta = assistantMessageMetadata.cta || null;

      if (finalAssistantMessage) {
        if (hasStreamedToken) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                  ...msg,
                  text: finalAssistantMessage,
                  ...(assistantMessageCta ? { cta: assistantMessageCta } : {}),
                }
                : msg
            )
          );
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantMessageId,
              role: "assistant",
              text: finalAssistantMessage,
              ...(assistantMessageCta ? { cta: assistantMessageCta } : {}),
            },
          ]);
        }

        if (chatId) {
          db.saveMessage({
            chatId,
            role: "assistant",
            content: finalAssistantMessage,
            metadata: assistantMessageMetadata,
          }).catch(err =>
            console.error("Failed to save assistant message:", err)
          );
        }
      } else if (assistantMessageCta) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            text: "",
            cta: { ...OUTFIT_NAV_CTA },
          },
        ]);

        if (chatId) {
          db.saveMessage({
            chatId,
            role: "assistant",
            content: "",
            metadata: assistantMessageMetadata,
          }).catch(err =>
            console.error("Failed to save assistant CTA message:", err)
          );
        }
      }

      if (result.outfits && result.outfits.length > 0) {
        track('outfits_generated', {
          count: result.outfits.length,
          vibes: result.outfits.map(o => o.vibe).filter(Boolean),
        });
        setOutfits(result.outfits);
        setCurrent(0);

        if (assistantMessageCta) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, cta: { ...OUTFIT_NAV_CTA } }
                : msg
            )
          );
        }

        if (chatId) {
          db.saveOutfits({ chatId, outfits: result.outfits, wardrobeItems: wardrobeFlat })
            .then(savedIds => {
              // Build old→new ID mapping before swapping
              const idMap = {};
              result.outfits.forEach((o, i) => {
                if (savedIds[i] && String(o.id) !== String(savedIds[i])) {
                  idMap[o.id] = savedIds[i];
                }
              });

              setOutfits(prev => prev.map((o, i) =>
                savedIds[i] ? { ...o, id: savedIds[i] } : o
              ));

              // Remap viz registry keys and migrate cache entries
              if (Object.keys(idMap).length > 0) {
                for (const [oldId, newId] of Object.entries(idMap)) {
                  remapVizEntryKey(oldId, newId);
                }

                const vizRefUrl = getVisualizationReferenceUrl(profile);
                if (vizRefUrl) {
                  for (const [oldId, newId] of Object.entries(idMap)) {
                    const cached = getCachedVisualization(oldId, vizRefUrl);
                    if (cached) {
                      setCachedVisualization(newId, vizRefUrl, cached);
                    }
                  }
                }
              }
            })
            .catch(err => console.error("Failed to save outfits:", err));
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
      setIsWaitingForFirstToken(false);

      if (hasStreamedToken && streamedMessage.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, text: streamedMessage.trim() }
              : msg
          )
        );
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Sorry, I ran into an issue: ${error.message}. Please try again.` },
        ]);
      }
    } finally {
      if (chatSessionRef.current === sessionId) {
        streamAbortRef.current = null;
        setIsGenerating(false);
        setIsWaitingForFirstToken(false);
      }
    }
  }, [
    inputValue,
    isGenerating,
    messages,
    pendingImage,
    allWardrobeItems,
    wardrobeFlat,
    profile,
    activeChatId,
    cancelActiveStream,
  ]);

  const handleSend = () => handleSendMessage(inputValue.trim());
  const handleChipTap = (label) => handleSendMessage(label);

  const handleNewChat = () => {
    chatSessionRef.current += 1;
    cancelActiveStream();
    setActiveChatId(null);
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    messages.forEach(msg => { if (msg.image?.startsWith('blob:')) URL.revokeObjectURL(msg.image); });
    setMessages([]);
    setOutfits([]);
    setCurrent(0);
    setSelected(null);
    setInputValue("");
    setIsGenerating(false);
    setIsWaitingForFirstToken(false);
    setView("chat");
    setSidePanelOpen(false);
  };

  const handleSelectChat = useCallback(async (chatId) => {
    try {
      chatSessionRef.current += 1;
      cancelActiveStream();
      setActiveChatId(chatId);
      const [dbMessages, chatOutfits] = await Promise.all([
        db.fetchMessages(chatId),
        db.fetchOutfitsForChat(chatId),
      ]);
      const hydratedMessages = appendLegacyOutfitsCtaMessage({
        chatId,
        messages: dbMessages.map(toChatUiMessage),
        outfits: chatOutfits,
      });
      setMessages(hydratedMessages);
      setOutfits(chatOutfits);

      // Hydrate viz registry from DB — in-flight entries are preserved automatically
      for (const outfit of chatOutfits) {
        const urls = outfit.visualizationUrls || (outfit.visualizationUrl ? { front: outfit.visualizationUrl } : null);
        const compatibleUrls = urls
          ? Object.fromEntries(
            Object.entries(urls).filter(([, url]) => isCurrentVisualizationUrl(url))
          )
          : null;
        if (compatibleUrls?.front) {
          hydrateVizEntry(outfit.id, {
            status: 'ready',
            poses: buildReadyPoseEntries(compatibleUrls),
            outfit,
          });
        }
      }

      setCurrent(0);
      setView("chat");
      setSidePanelOpen(false);
      setInputValue("");
      setIsGenerating(false);
      setIsWaitingForFirstToken(false);
    } catch (err) {
      console.error("Failed to load chat:", err);
    }
  }, [cancelActiveStream]);

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

  const handleToggleOutfitSaved = useCallback(async (outfitId, currentSaved) => {
    try {
      await db.toggleOutfitSaved(outfitId, currentSaved);
      setOutfits(prev => prev.map(o =>
        o.id === outfitId ? { ...o, saved: !currentSaved } : o
      ));
      if (currentSaved) {
        setSavedOutfits(prev => prev.filter(o => o.id !== outfitId));
      } else {
        const saved = await db.fetchSavedOutfits();
        setSavedOutfits(saved);
      }
    } catch (err) {
      console.error("Failed to toggle outfit saved:", err);
    }
  }, []);

  const handleToggleOutfitDisliked = useCallback(async (outfitId, currentDisliked) => {
    try {
      await db.toggleOutfitDisliked(outfitId, currentDisliked);
      setOutfits(prev => prev.map(o =>
        o.id === outfitId ? { ...o, disliked: !currentDisliked } : o
      ));
    } catch (err) {
      console.error("Failed to toggle outfit disliked:", err);
    }
  }, []);

  const handleDeleteChat = useCallback(async (chatId) => {
    try {
      await db.deleteChat(chatId);
      setChatHistory(prev => prev.filter(c => c.id !== chatId));
      if (chatId === activeChatId) {
        chatSessionRef.current += 1;
        cancelActiveStream();
        setActiveChatId(null);
        setMessages([]);
        setOutfits([]);
        setCurrent(0);
        setView("chat");
        setIsGenerating(false);
        setIsWaitingForFirstToken(false);
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }, [activeChatId, cancelActiveStream]);

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

  const handleUpdateWardrobeItem = useCallback(async (itemId, fields) => {
    try {
      const updated = await db.updateWardrobeItem(itemId, fields);
      const [grouped, flat] = await Promise.all([
        db.fetchWardrobeItems(),
        db.fetchWardrobeItemsFlat(),
      ]);
      setWardrobeItems(grouped);
      setWardrobeFlat(flat);
      setLightboxItem(updated);
    } catch (err) {
      console.error("Failed to update wardrobe item:", err);
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
        <Lightbox
          item={lightboxItem}
          onClose={() => setLightboxItem(null)}
          onDelete={view === "wardrobe" ? handleDeleteWardrobeItem : null}
          onEdit={view === "wardrobe" ? handleUpdateWardrobeItem : null}
          onEnhance={view === "wardrobe" ? handleEnhanceWardrobeItemImage : null}
          onStyleItem={() => {
            setLightboxItem(null);
            setView("chat");
            handleSendMessage(`How should I style my ${lightboxItem.name}?`);
          }}
          isEnhancing={enhancingItems.has(lightboxItem.id)}
        />
      )}
      {addItemModalOpen && (
        <AddItemModal
          onClose={() => setAddItemModalOpen(false)}
          onAdd={handleAddItem}
          onBulkAdd={handleBulkAddItems}
        />
      )}
      {vizModalOutfitId && vizGenerations[vizModalOutfitId] && (
        <OutfitVisualizationModal
          poses={vizGenerations[vizModalOutfitId].poses}
          outfit={vizGenerations[vizModalOutfitId].outfit}
          onClose={() => setVizModalOutfitId(null)}
          onRegenerate={() => handleRegenerateVisualization(vizModalOutfitId)}
        />
      )}

      <SidePanel
        isOpen={sidePanelOpen}
        onClose={() => setSidePanelOpen(false)}
        onNewChat={handleNewChat}
        onOpenWardrobe={() => { setView("wardrobe"); setSidePanelOpen(false); }}
        onOpenProfile={() => { setView("profile"); setSidePanelOpen(false); }}
        onOpenSaved={() => { setView("saved"); setSidePanelOpen(false); }}
        savedCount={savedOutfits.length}
        chatHistory={chatHistory}
        onSelectChat={handleSelectChat}
        onToggleStar={handleToggleStar}
        onDeleteChat={handleDeleteChat}
        onSignOut={signOut}
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
            {view === "wardrobe" ? "My Wardrobe" : view === "saved" ? "Saved Outfits" : view === "outfit" ? (outfits.length > 0 ? outfits[current].vibe : "Outfits") : view === "profile" ? "My Profile" : "Chat"}
          </h1>

          {weather && (view === "chat" || view === "outfit") && (
            <button
              onClick={() => setView("profile")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 10px",
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.08)",
                background: "#fff",
                color: "#555",
                fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                cursor: "pointer",
                flexShrink: 0,
                marginRight: 8,
              }}
            >
              <span style={{ fontSize: 13 }}>{weatherIconToEmoji(weather.icon)}</span>
              {weather.temp}°C
            </button>
          )}

          {view !== "wardrobe" && view !== "profile" && view !== "saved" && (
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
          enhancingItems={enhancingItems}
        />
      ) : view === "outfit" ? (
        outfits.length > 0 ? (
          <div
            className={`swipe-container ${
              scrollLock === 'horizontal' ? 'swipe-container--locked-horizontal' :
              scrollLock === 'vertical' ? 'swipe-container--locked-vertical' : ''
            }`}
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
                    hasReferencePhoto={!!profile.referencePhoto}
                    vizStatus={vizGenerations[outfit.id]?.status}
                    onVisualizeClick={handleVisualizeOutfit}
                    onViewVisualization={(outfitId) => setVizModalOutfitId(outfitId)}
                    onShare={async (outfitId) => {
                      const { shareToken } = await shareOutfit(outfitId);
                      track('outfit_shared', { outfit_id: outfitId });
                      const shareUrl = `${window.location.origin}/s/${shareToken}`;
                      return shareOutfitLink({
                        url: shareUrl,
                        title: 'Check out this outfit on Runway',
                      });
                    }}
                    onToggleSaved={handleToggleOutfitSaved}
                    onToggleDisliked={handleToggleOutfitDisliked}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <OutfitEmptyState onSwitchToChat={() => setView("chat")} />
        )
      ) : view === "saved" ? (
        <SavedOutfitsView
          savedOutfits={savedOutfits}
          onItemClick={(item) => setLightboxItem(item)}
          onToggleSaved={handleToggleOutfitSaved}
          vizGenerations={vizGenerations}
          hasReferencePhoto={!!profile.referencePhoto}
          onVisualizeClick={handleVisualizeOutfit}
          onViewVisualization={(outfitId) => setVizModalOutfitId(outfitId)}
        />
      ) : view === "profile" ? (
        <ProfileView
          profile={profile}
          onSave={setProfile}
          focusLocation={focusLocation}
          onClearFocusLocation={() => setFocusLocation(false)}
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
          isWaitingForFirstToken={isWaitingForFirstToken}
          isGenerating={isGenerating}
          weather={weather}
          hasLocation={!!profile.location?.city}
          onOpenProfile={() => { setFocusLocation(true); setView("profile"); }}
        />
      )}

    </div>
  );
}
