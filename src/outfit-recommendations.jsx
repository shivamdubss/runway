import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { Pencil, Trash2, Wand2, Eye, Loader2 } from "lucide-react";
import { sendChatMessageStreaming, generateWeeklyOutfits, generateStyleDna } from "./lib/api";
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
import { fetchWeatherForDisplay, getWeatherFromCache, weatherIconToEmoji, searchCities, detectLocationFromBrowser, fetchForecastForTrip, wmoCodeToEmoji } from "./lib/weather";
import { STYLE_QUIZ_QUESTIONS, computeStyleDnaFromQuiz } from "./lib/style-quiz";

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
        {canEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 1,
              width: "var(--lightbox-close-size)",
              height: "var(--lightbox-close-size)",
              borderRadius: "calc(var(--lightbox-close-size) / 2)",
              border: "none",
              background: "rgba(0,0,0,0.4)",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pencil size={16} />
          </button>
        )}
        <div style={{
          width: "100%",
          aspectRatio: "3 / 4",
          maxHeight: "min(60dvh, calc(100dvh - 2 * var(--space-lightbox-padding) - 200px))",
          background: "#fff",
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
                  objectFit: "contain",
                  padding: "16px",
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
              {(onStyleItem || (item.id && onDelete) || onEnhance) && (() => {
                const pillBase = (extraStyle = {}) => ({
                  flex: 1,
                  height: 40,
                  padding: "0 12px",
                  borderRadius: 20,
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
                  <>
                    <div style={{
                      display: "flex",
                      gap: 8,
                      borderTop: "1px solid rgba(0,0,0,0.06)",
                      marginTop: 12,
                      padding: "12px 16px 0",
                    }}>
                      {item.id && onDelete && (
                        <button
                          onClick={() => { onDelete(item.id); onClose(); }}
                          style={pillBase({
                            flex: "none",
                            width: 40,
                            padding: 0,
                            fontSize: 18,
                            color: "#C85A5A",
                            border: "1px solid rgba(200,90,90,0.25)",
                          })}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                      {onStyleItem && (
                        <button
                          onClick={onStyleItem}
                          style={pillBase({
                            fontWeight: 700,
                            background: "#1A1A1A",
                            color: "#fff",
                            border: "none",
                          })}
                        >
                          Style Item
                        </button>
                      )}
                    </div>
                    {onEnhance && !isEditing && (
                      <div style={{ padding: "8px 16px 16px" }}>
                        <button
                          onClick={() => { if (!isEnhancing) onEnhance(item.id, images[activeIdx], item); }}
                          disabled={isEnhancing}
                          style={pillBase({
                            width: "100%",
                            background: isEnhancing ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.06)",
                            color: isEnhancing ? "#aaa" : "#555",
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                            cursor: isEnhancing ? "default" : "pointer",
                          })}
                        >
                          <Wand2 size={16} /> {isEnhancing ? "Refining…" : "Refine"}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GarmentDetailPage({ item, onDelete, onEdit, onEnhance, onStyleItem, onSaveNotes, isEnhancing = false }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editCategory, setEditCategory] = useState(item.category);
  const [isSaving, setIsSaving] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes || '');
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
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      background: "#FAFAF8",
      animation: "slideInFromRight 0.22s ease",
      minHeight: 0,
    }}>
      {/* Image section */}
      <div style={{
        width: "100%",
        background: "#fff",
        position: "relative",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        aspectRatio: "4 / 3",
        maxHeight: "40dvh",
      }}>
        {images.length > 0 ? (
          <>
            <img
              src={images[activeIdx]}
              alt={item.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: "32px",
                boxSizing: "border-box",
              }}
            />
            {hasMultiple && activeIdx > 0 && (
              <button
                onClick={() => setActiveIdx(i => i - 1)}
                style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 36, height: 36, borderRadius: 18,
                  border: "none", background: "rgba(0,0,0,0.35)", color: "#fff",
                  fontSize: 20, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ‹
              </button>
            )}
            {hasMultiple && activeIdx < images.length - 1 && (
              <button
                onClick={() => setActiveIdx(i => i + 1)}
                style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  width: 36, height: 36, borderRadius: 18,
                  border: "none", background: "rgba(0,0,0,0.35)", color: "#fff",
                  fontSize: 20, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ›
              </button>
            )}
            {hasMultiple && (
              <div style={{
                position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
                display: "flex", gap: 6,
              }}>
                {images.map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: 3,
                    background: i === activeIdx ? "#1A1A1A" : "rgba(0,0,0,0.18)",
                    transition: "background 0.2s ease",
                  }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: "var(--font-lightbox-emoji)" }}>{item.emoji}</span>
        )}
        {canEdit && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 36,
              height: 36,
              borderRadius: 18,
              border: "none",
              background: "rgba(0,0,0,0.35)",
              color: "#fff",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pencil size={16} />
          </button>
        )}
      </div>

      {/* Details section */}
      <div style={{ padding: "20px var(--container-padding-x) calc(32px + var(--safe-bottom))", flex: 1 }}>
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
              marginBottom: 16,
            }}>
              {item.name}
            </div>

            {/* Notes section */}
            <div style={{ marginBottom: 16 }}>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                onBlur={() => {
                  if (onSaveNotes && notesValue.trim() !== (item.notes || '')) {
                    onSaveNotes(item.id, notesValue.trim());
                  }
                }}
                placeholder="Add a note..."
                readOnly={!onSaveNotes}
                style={{
                  width: "100%",
                  minHeight: 60,
                  borderRadius: 10,
                  border: "1px solid rgba(0,0,0,0.08)",
                  padding: "10px 12px",
                  fontSize: "16px",
                  fontFamily: "'DM Sans', sans-serif",
                  color: "#1A1A1A",
                  boxSizing: "border-box",
                  resize: "none",
                  outline: "none",
                  background: "rgba(0,0,0,0.02)",
                  lineHeight: 1.5,
                  cursor: onSaveNotes ? "text" : "default",
                }}
              />
            </div>

            <div style={{
              borderTop: "1px solid rgba(0,0,0,0.06)",
              paddingTop: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}>
              <div style={{ display: "flex", gap: 10 }}>
                {item.id && onDelete && (
                  <button
                    onClick={() => onDelete(item.id)}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      border: "1px solid rgba(200,90,90,0.25)",
                      background: "transparent",
                      color: "#C85A5A",
                      fontSize: 20,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                {onStyleItem && (
                  <button
                    onClick={onStyleItem}
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 24,
                      border: "none",
                      background: "#1A1A1A",
                      color: "#fff",
                      fontSize: "var(--font-caption)",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Style Item
                  </button>
                )}
              </div>
              {onEnhance && (
                <button
                  onClick={() => { if (!isEnhancing) onEnhance(item.id, images[activeIdx], item); }}
                  disabled={isEnhancing}
                  style={{
                    width: "100%",
                    height: 48,
                    borderRadius: 24,
                    border: "none",
                    background: isEnhancing ? "rgba(0,0,0,0.04)" : "rgba(0,0,0,0.06)",
                    color: isEnhancing ? "#aaa" : "#555",
                    fontSize: "var(--font-caption)",
                    fontWeight: 600,
                    cursor: isEnhancing ? "default" : "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Wand2 size={16} /> {isEnhancing ? "Refining…" : "Refine"}
                </button>
              )}
            </div>
          </>
        )}
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


function OutfitView({ outfit, onItemClick, hasReferencePhoto, vizStatus, onVisualizeClick, onViewVisualization, onToggleSaved, onToggleDisliked }) {
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

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
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      }}>
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
        <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.12)", marginLeft: 2, marginRight: 2, flexShrink: 0 }} />
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
            flex: 1,
            height: 44,
            padding: "0 14px",
            background: vizStatus === 'ready'
              ? "#1A1A1A"
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
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {vizStatus === 'generating' ? (
            <span
              role="status"
              aria-label="Creating your look"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: "2px solid #D8D8D8",
                borderTopColor: "#8A8A8A",
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
            <span>See on you 😎</span>
          ) : (
            <span>Try on</span>
          )}
        </button>
      </div>

      <div className="outfit-item-card-grid">
        {outfit.items
          .slice()
          .sort(compareOutfitItems)
          .map((item, i) => (
            <ItemCard key={i} item={item} onClick={() => onItemClick(item)} overlay />
          ))}
      </div>

      <div
        onClick={() => setReasoningExpanded(!reasoningExpanded)}
        style={{
          padding: "14px 16px",
          background: reasoningExpanded ? "rgba(0,0,0,0.02)" : "transparent",
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.1)",
          cursor: "pointer",
          transition: "all 0.25s ease",
          marginTop: 16,
          marginBottom: 40,
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
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
        }}>
          {savedOutfits.map((outfit) => {
            const vizStatus = vizGenerations?.[outfit.id]?.status;
            const thumbnails = outfit.items.slice(0, 4);
            return (
              <div key={outfit.id} style={{
                background: "#fff",
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}>
                {/* 2x2 garment thumbnail grid */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  aspectRatio: "1",
                }}>
                  {thumbnails.map((item, i) => (
                    <div
                      key={i}
                      onClick={() => onItemClick(item)}
                      style={{
                        background: "#f5f5f4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        overflow: "hidden",
                        borderRight: i % 2 === 0 ? "1px solid rgba(0,0,0,0.04)" : "none",
                        borderBottom: i < 2 ? "1px solid rgba(0,0,0,0.04)" : "none",
                      }}
                    >
                      {item.image || (item.images && item.images[0]) ? (
                        <img
                          src={item.images?.[0] || item.image}
                          alt={item.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: 24 }}>{item.emoji}</span>
                      )}
                    </div>
                  ))}
                </div>
                {/* Ribbon: viz icon + vibe name + unsave */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 12px",
                  gap: 8,
                }}>
                  {hasReferencePhoto && (
                    <button
                      onClick={() => {
                        if (vizStatus === 'ready') {
                          onViewVisualization(outfit.id);
                        } else if (vizStatus !== 'generating' && vizStatus !== 'queued') {
                          onVisualizeClick(outfit);
                        }
                      }}
                      disabled={vizStatus === 'generating' || vizStatus === 'queued'}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: vizStatus === 'generating' || vizStatus === 'queued' ? "default" : "pointer",
                        padding: 2,
                        display: "flex",
                        alignItems: "center",
                        color: vizStatus === 'ready' ? "#1A1A1A" : "#999",
                        opacity: vizStatus === 'generating' || vizStatus === 'queued' ? 0.5 : 1,
                      }}
                      title={vizStatus === 'ready' ? "View your look" : "Try this on"}
                    >
                      {vizStatus === 'generating' || vizStatus === 'queued' ? (
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  )}
                  <span style={{
                    flex: 1,
                    fontSize: "var(--font-caption)",
                    fontWeight: 600,
                    color: "#1A1A1A",
                    fontFamily: "'DM Sans', sans-serif",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {outfit.vibe}
                  </span>
                  <button
                    onClick={() => onToggleSaved(outfit.id, true)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                    title="Unsave outfit"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24"
                      fill="#1A1A1A" stroke="#1A1A1A"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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

const REFINEMENT_CHIPS = [
  { label: "Swap the shoes", icon: "👟" },
  { label: "Make it more casual", icon: "😎" },
  { label: "Make it dressier", icon: "✨" },
  { label: "Show me more options", icon: "🔄" },
];

function ChatView({
  messages,
  inputValue,
  setInputValue,
  onSend,
  onChipTap,
  onCtaAction,
  hasOutfits,
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
              {msg.cta && hasOutfits && i === messages.length - 1 && !isGenerating && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 10,
                }}>
                  {REFINEMENT_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => onChipTap(chip.label)}
                      disabled={isGenerating}
                      style={{
                        height: 32,
                        padding: "0 12px",
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "#fff",
                        color: "#777",
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: isGenerating ? "default" : "pointer",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        whiteSpace: "nowrap",
                        opacity: isGenerating ? 0.5 : 1,
                      }}
                      onPointerDown={(e) => {
                        if (!isGenerating) {
                          e.currentTarget.style.transform = "scale(0.95)";
                          e.currentTarget.style.background = "#F3F2F0";
                        }
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
                      <span style={{ fontSize: 13 }}>{chip.icon}</span>
                      {chip.label}
                    </button>
                  ))}
                </div>
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

// ── Style Quiz ──────────────────────────────────────────────────────────────

function StyleQuiz({ onComplete, onSkip, isOnboarding = false }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [result, setResult] = useState(null);

  const question = STYLE_QUIZ_QUESTIONS[step];
  const totalSteps = STYLE_QUIZ_QUESTIONS.length;
  const progress = ((step + 1) / totalSteps) * 100;

  const handleSelect = (value) => {
    const newAnswers = { ...answers, [question.id]: value };
    setAnswers(newAnswers);

    if (step < totalSteps - 1) {
      setTimeout(() => setStep(step + 1), 300);
    } else {
      const dna = computeStyleDnaFromQuiz(newAnswers);
      setResult(dna);
      setTimeout(() => setShowResults(true), 300);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = () => {
    onComplete(result);
  };

  if (showResults && result) {
    return (
      <div style={{
        padding: "var(--container-padding-y) var(--container-padding-x)",
        overflowY: "auto",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <div style={{
          textAlign: "center",
          marginBottom: 32,
          maxWidth: 400,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>&#x2728;</div>
          <h2 style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: "var(--font-h2)",
            fontWeight: 400,
            color: "#1A1A1A",
            marginBottom: 8,
          }}>
            Your Style DNA
          </h2>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "var(--font-body)",
            color: "#666",
            margin: 0,
          }}>
            Here's what we learned about your style
          </p>
        </div>

        {/* Primary Archetype Card */}
        <div style={{
          background: "#1A1A1A",
          borderRadius: 20,
          padding: 28,
          marginBottom: 16,
          width: "100%",
          maxWidth: 400,
        }}>
          <div style={{
            fontSize: "var(--font-caption)",
            color: "rgba(255,255,255,0.5)",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}>
            Your Primary Style
          </div>
          <div style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 28,
            color: "#fff",
            marginBottom: 12,
          }}>
            {result.primaryArchetype}
          </div>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "var(--font-body)",
            color: "rgba(255,255,255,0.7)",
            margin: 0,
            lineHeight: 1.5,
          }}>
            {result.description}
          </p>
        </div>

        {/* Secondary Archetype */}
        {result.secondaryArchetype && (
          <div style={{
            background: "#fff",
            borderRadius: 16,
            padding: 20,
            marginBottom: 16,
            border: "1px solid rgba(0,0,0,0.08)",
            width: "100%",
            maxWidth: 400,
          }}>
            <div style={{
              fontSize: "var(--font-caption)",
              color: "#999",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 4,
            }}>
              With Notes Of
            </div>
            <div style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 22,
              color: "#1A1A1A",
            }}>
              {result.secondaryArchetype}
            </div>
          </div>
        )}

        {/* Top Traits */}
        <div style={{
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          marginBottom: 16,
          border: "1px solid rgba(0,0,0,0.08)",
          width: "100%",
          maxWidth: 400,
        }}>
          <div style={{
            fontSize: "var(--font-caption)",
            color: "#999",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 12,
          }}>
            Your Style Traits
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {result.topTraits.map((trait) => (
              <span key={trait} style={{
                padding: "6px 14px",
                borderRadius: 20,
                background: "#F5F3FF",
                color: "#6B5CE7",
                fontSize: "var(--font-caption)",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
              }}>
                {trait}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleFinish}
          style={{
            width: "100%",
            maxWidth: 400,
            height: 52,
            borderRadius: 26,
            border: "none",
            background: "#1A1A1A",
            color: "#fff",
            fontSize: "var(--font-body)",
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          {isOnboarding ? "Start Styling" : "Save & Update My Profile"}
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: "var(--container-padding-y) var(--container-padding-x)",
      overflowY: "auto",
      flex: 1,
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Progress bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 24,
      }}>
        {step > 0 && (
          <button
            onClick={handleBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "transparent",
              color: "#1A1A1A",
              fontSize: 18,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            &#x2190;
          </button>
        )}
        <div style={{
          flex: 1,
          height: 4,
          background: "#F0EFED",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${progress}%`,
            height: "100%",
            background: "#1A1A1A",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }} />
        </div>
        <span style={{
          fontSize: "var(--font-caption)",
          color: "#999",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 500,
          flexShrink: 0,
        }}>
          {step + 1}/{totalSteps}
        </span>
      </div>

      {/* Question */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: "var(--font-h2)",
          fontWeight: 400,
          color: "#1A1A1A",
          marginBottom: 6,
        }}>
          {question.title}
        </h2>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "var(--font-body)",
          color: "#666",
          margin: 0,
        }}>
          {question.subtitle}
        </p>
      </div>

      {/* Options grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 12,
        flex: 1,
      }}>
        {question.options.map((option) => {
          const isSelected = answers[question.id] === option.value;
          return (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              style={{
                position: "relative",
                borderRadius: 16,
                border: isSelected ? "2px solid #1A1A1A" : "2px solid transparent",
                background: "#fff",
                overflow: "hidden",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
                transition: "all 0.2s ease",
                boxShadow: isSelected ? "0 4px 12px rgba(0,0,0,0.15)" : "0 1px 4px rgba(0,0,0,0.08)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Image */}
              <div style={{
                width: "100%",
                paddingTop: "110%",
                position: "relative",
                overflow: "hidden",
                background: "#F0EFED",
              }}>
                <img
                  src={option.image}
                  alt={option.label}
                  loading="lazy"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                {isSelected && (
                  <div style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: "#1A1A1A",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}>
                    &#x2713;
                  </div>
                )}
              </div>
              {/* Label */}
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "var(--font-item-name)",
                  fontWeight: 600,
                  color: "#1A1A1A",
                  marginBottom: 2,
                }}>
                  {option.label}
                </div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "var(--font-caption)",
                  color: "#999",
                  lineHeight: 1.3,
                }}>
                  {option.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Skip link */}
      {isOnboarding && step === 0 && (
        <button
          onClick={onSkip}
          style={{
            marginTop: 16,
            padding: "12px 0",
            border: "none",
            background: "transparent",
            color: "#999",
            fontSize: "var(--font-body)",
            fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          Skip for now
        </button>
      )}
    </div>
  );
}

function ProfileView({ profile, onSave, focusLocation, onClearFocusLocation, onOpenStyleQuiz }) {
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

      {/* Style Quiz Card */}
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
          marginBottom: 8,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          &#x1F9EC; Style Quiz
        </h3>
        {profile.styleQuiz?.completedAt ? (
          <>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}>
              <span style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 20,
                color: "#1A1A1A",
              }}>
                {profile.styleQuiz.primaryArchetype}
              </span>
              {profile.styleQuiz.secondaryArchetype && (
                <span style={{
                  fontSize: "var(--font-caption)",
                  color: "#999",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  + {profile.styleQuiz.secondaryArchetype}
                </span>
              )}
            </div>
            {profile.styleQuiz.topTraits?.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {profile.styleQuiz.topTraits.map((trait) => (
                  <span key={trait} style={{
                    padding: "4px 10px",
                    borderRadius: 14,
                    background: "#F5F3FF",
                    color: "#6B5CE7",
                    fontSize: 11,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                  }}>
                    {trait}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={onOpenStyleQuiz}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "transparent",
                color: "#1A1A1A",
                fontSize: "var(--font-caption)",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Retake Quiz
            </button>
          </>
        ) : (
          <>
            <p style={{
              fontSize: "var(--font-caption)",
              color: "#666",
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 12,
              lineHeight: 1.4,
            }}>
              Take a quick visual quiz to uncover your style DNA. Your answers help us make better recommendations.
            </p>
            <button
              onClick={onOpenStyleQuiz}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: "none",
                background: "#1A1A1A",
                color: "#fff",
                fontSize: "var(--font-caption)",
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Take Style Quiz
            </button>
          </>
        )}
      </div>

      <ReferencePhotoCard profile={profile} onSave={onSave} />
      <LocationCard profile={profile} onSave={onSave} focusLocation={focusLocation} onClearFocusLocation={onClearFocusLocation} />
      <BodyFitCard profile={profile} onSave={onSave} />
      <StylePreferencesCard profile={profile} onSave={onSave} />
      <StyleContextCard profile={profile} onSave={onSave} />
    </div>
  );
}

// ── Trip Planning ────────────────────────────────────────────────────────────

function TrashIcon({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function outfitLabel(slotIndex) {
  return `Outfit ${slotIndex + 1}`;
}

function TripVisualizationButton({ outfit, vizGenerations, hasReferencePhoto, onVisualizeClick, onViewVisualization }) {
  const vizStatus = vizGenerations?.[outfit.id]?.status;
  return (
    <button
      onClick={() => {
        if (vizStatus === 'ready') onViewVisualization(outfit.id);
        else if (vizStatus !== 'generating' && vizStatus !== 'queued') onVisualizeClick(outfit);
      }}
      disabled={!hasReferencePhoto || vizStatus === 'generating' || vizStatus === 'queued'}
      style={{
        width: '100%', padding: '11px 20px', marginTop: 12,
        background: vizStatus === 'ready' ? '#1A1A1A' : 'transparent',
        color: vizStatus === 'ready' ? '#fff' : hasReferencePhoto ? '#666' : '#bbb',
        border: vizStatus === 'ready' ? 'none' : hasReferencePhoto ? '1px solid #E0E0E0' : '1px solid #EBEBEB',
        borderRadius: 12, fontSize: 'var(--font-body)', fontFamily: "'DM Sans', sans-serif",
        fontWeight: vizStatus === 'ready' ? 600 : 500, cursor: hasReferencePhoto && vizStatus !== 'generating' && vizStatus !== 'queued' ? 'pointer' : 'not-allowed',
        transition: 'all 0.2s ease', opacity: vizStatus === 'generating' || vizStatus === 'queued' ? 0.6 : 1,
      }}
    >
      {vizStatus === 'generating' ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #D8D8D8', borderTopColor: '#8A8A8A', animation: 'spin 0.8s linear infinite' }} />
        </span>
      ) : vizStatus === 'queued' ? 'Hang tight...'
        : vizStatus === 'ready' ? 'View your look'
        : vizStatus === 'error' ? 'Try again'
        : hasReferencePhoto ? 'See this on you 😎'
        : 'Add a photo to try things on'}
    </button>
  );
}

function SlotTile({ slotIndex, outfit, isSelected, onTap, width = 128 }) {
  const filled = !!outfit;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif", marginBottom: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
        {outfitLabel(slotIndex)}
      </div>
      <div
        onClick={onTap}
        style={{
          width, height: 72, borderRadius: 10, cursor: 'pointer',
          background: filled ? '#fff' : 'transparent',
          border: isSelected ? '2px solid #8B7CF6' : filled ? '1px solid rgba(0,0,0,0.08)' : '1.5px dashed #D4D4D4',
          boxShadow: filled ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          display: 'flex', flexDirection: 'column', alignItems: filled ? 'flex-start' : 'center', justifyContent: filled ? 'space-between' : 'center',
          padding: filled ? '8px 8px 6px' : 0,
          transition: 'all 0.15s ease',
          boxSizing: 'border-box',
        }}
        onPointerDown={(e) => e.currentTarget.style.opacity = '0.75'}
        onPointerUp={(e) => e.currentTarget.style.opacity = '1'}
        onPointerLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        {filled ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {outfit.vibe}
            </span>
            <span style={{ fontSize: 13, letterSpacing: 1 }}>
              {(outfit.items || []).slice(0, 4).map(item => item.emoji || '👕').join('')}
            </span>
          </>
        ) : (
          <span style={{ fontSize: 20, color: '#C0C0C0' }}>+</span>
        )}
      </div>
    </div>
  );
}

function DayTabBar({ trip, activeDayIndex, onSelectDay, slots, forecast }) {
  const dayCount = db.getTripDayCount(trip.startDate, trip.endDate);
  return (
    <div style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '12px 16px', WebkitOverflowScrolling: 'touch' }}>
      {Array.from({ length: dayCount }, (_, i) => {
        const label = db.getTripDayLabel(trip.startDate, i);
        const [weekday, ...rest] = label.split(', ');
        const active = i === activeDayIndex;
        const dayDate = new Date(trip.startDate + 'T00:00:00');
        dayDate.setDate(dayDate.getDate() + i);
        const dateStr = dayDate.toISOString().slice(0, 10);
        const dayForecast = forecast?.find(f => f.date === dateStr);
        return (
          <button
            key={i}
            onClick={() => onSelectDay(i)}
            style={{
              flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '6px 14px', borderRadius: 20,
              background: active ? '#1A1A1A' : 'transparent',
              border: active ? 'none' : '1px solid rgba(0,0,0,0.12)',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : '#1A1A1A', lineHeight: 1.3 }}>{weekday}</span>
            <span style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : '#999', lineHeight: 1.3 }}>{rest.join(', ')}</span>
            {dayForecast && (
              <span style={{ fontSize: 10, marginTop: 2, color: active ? 'rgba(255,255,255,0.8)' : '#666', lineHeight: 1 }}>
                {wmoCodeToEmoji(dayForecast.weatherCode)} {dayForecast.tempMax}°
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GarmentPhotoGrid({ items }) {
  const cells = (items || []).slice(0, 4);
  const count = cells.length;
  if (count === 0) return <span style={{ fontSize: 22 }}>👕</span>;
  const gridCols = count === 1 ? 1 : 2;
  const gridRows = count <= 2 ? 1 : 2;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
      gridTemplateRows: `repeat(${gridRows}, 1fr)`,
      width: '100%', height: '100%', overflow: 'hidden',
      gap: 1,
    }}>
      {cells.map((item, idx) => {
        const span = count === 3 && idx === 2 ? { gridColumn: '1 / -1' } : {};
        return (
          <div key={idx} style={{ ...span, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EAE9E7' }}>
            {item.image
              ? <img src={item.image} alt={item.name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 18 }}>{item.emoji || '👕'}</span>
            }
          </div>
        );
      })}
    </div>
  );
}

function DaySlotCard({ slotIndex, outfit, isSelected, onTap, isAddButton }) {
  const filled = !!outfit;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        onClick={onTap}
        style={{
          display: 'flex', alignItems: 'center',
          borderRadius: 12, cursor: 'pointer',
          background: filled ? '#fff' : 'transparent',
          border: isSelected
            ? '2px solid #8B7CF6'
            : filled ? '1px solid rgba(0,0,0,0.08)' : '1.5px dashed #D4D4D4',
          boxShadow: filled ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          minHeight: isAddButton ? 56 : 120,
          overflow: 'hidden',
          transition: 'all 0.15s ease',
        }}
        onPointerDown={(e) => e.currentTarget.style.opacity = '0.75'}
        onPointerUp={(e) => e.currentTarget.style.opacity = '1'}
        onPointerLeave={(e) => e.currentTarget.style.opacity = '1'}
      >
        {filled ? (
          <>
            <div style={{ width: 120, height: 120, flexShrink: 0 }}>
              <GarmentPhotoGrid items={outfit.items} />
            </div>
            <div style={{ padding: '0 12px', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif", marginBottom: 3 }}>
                {outfitLabel(slotIndex)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>
                {outfit.vibe}
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 0' }}>
            <span style={{ fontSize: 18, color: '#C0C0C0', lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif" }}>Add outfit</span>
          </div>
        )}
      </div>
    </div>
  );
}

const DAY_COLUMN_WIDTH = 136;

function DayColumn({ trip, dayIndex, slotMap, slots, selectedSlot, onSlotTap }) {
  const label = db.getTripDayLabel(trip.startDate, dayIndex);
  const [weekday, ...rest] = label.split(', ');
  const daySlots = (slots || []).filter(s => s.dayIndex === dayIndex && s.outfitId).sort((a, b) => db.slotIndexFromName(a.slotName) - db.slotIndexFromName(b.slotName));
  return (
    <div style={{ width: DAY_COLUMN_WIDTH, flexShrink: 0, paddingRight: 10 }}>
      <div style={{ marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif" }}>{weekday}</div>
        <div style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif" }}>{rest.join(', ')}</div>
      </div>
      {daySlots.map(slot => {
        const slotIndex = db.slotIndexFromName(slot.slotName);
        const isSelected = selectedSlot?.dayIndex === dayIndex && selectedSlot?.slotName === slot.slotName;
        return (
          <SlotTile
            key={slot.slotName}
            slotIndex={slotIndex}
            outfit={slot.outfit}
            isSelected={isSelected}
            onTap={() => onSlotTap(dayIndex, slot.slotName, slotIndex, slot.outfit)}
            width={DAY_COLUMN_WIDTH - 10}
          />
        );
      })}
    </div>
  );
}

function OutfitPickerCard({ outfit, usedBadge, onAssign, onItemClick }) {
  return (
    <div
      style={{ background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: 'transform 0.15s ease' }}
      onClick={() => onAssign(outfit)}
      onPointerDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
      onPointerUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onPointerLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      {usedBadge && (
        <div style={{ position: 'absolute', top: 6, right: 6, background: '#1A1A1A', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", zIndex: 1, lineHeight: 1.4 }}>
          {usedBadge}
        </div>
      )}
      <div style={{ height: 120, background: '#F3F2F0', overflow: 'hidden' }}>
        <GarmentPhotoGrid items={outfit.items} />
      </div>
      <div style={{ padding: '8px 10px 10px' }}>
        <div style={{ fontSize: 'var(--font-item-name)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{outfit.vibe}</div>
      </div>
    </div>
  );
}

function OutfitPickerPanel({ selectedSlot, trip, savedOutfits, recentOutfits, slotMap, wardrobeFlat, profile, onAssignOutfit, onToggleSaved }) {
  const [tab, setTab] = useState('saved');
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiAbortRef = useRef(null);

  // Badge text for a given outfit: which day/slot is it used in?
  function getUsedBadge(outfitId) {
    const slots = Object.values(slotMap).filter(s => s.outfitId === outfitId);
    if (slots.length === 0) return null;
    const s = slots[0];
    return `Day ${s.dayIndex + 1}`;
  }

  const handleAiSearch = (query) => {
    if (!query.trim()) return;
    if (aiAbortRef.current) aiAbortRef.current();
    setAiLoading(true);
    setAiResults([]);
    let accMessage = '';
    const slotContext = selectedSlot
      ? `${outfitLabel(selectedSlot.slotIndex || 0)} on Day ${selectedSlot.dayIndex + 1} of my trip to ${trip.destination || trip.title}`
      : `my trip to ${trip.destination || trip.title}`;
    const systemMsg = `You are helping plan outfits for a trip. The user needs an outfit for: ${slotContext}. Suggest 2-3 outfits from their wardrobe. ${query}`;
    aiAbortRef.current = sendChatMessageStreaming({
      messages: [{ role: 'user', content: systemMsg }],
      wardrobeItems: wardrobeFlat,
      profile,
      onToken: (token) => { accMessage += token; },
      onComplete: ({ outfits }) => {
        setAiResults(outfits || []);
        setAiLoading(false);
      },
      onError: () => setAiLoading(false),
    });
  };

  useEffect(() => () => { if (aiAbortRef.current) aiAbortRef.current(); }, []);

  const tabStyle = (active) => ({
    height: 'var(--tab-height)', padding: '0 var(--tab-padding-x)',
    borderRadius: 'calc(var(--tab-height) / 2)', border: 'none',
    background: active ? '#fff' : 'transparent', color: active ? '#1A1A1A' : '#999',
    fontSize: 'var(--font-tab)', fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer', transition: 'all 0.2s ease',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
  });

  const QUICK_CHIPS = ['Dinner out', 'Museum day', 'Brunch', 'Beach day', 'Business meeting'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* Tab toggle */}
      <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
        {selectedSlot && (
          <div style={{ marginBottom: 8, padding: '5px 10px', background: '#F3F2F0', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666', fontFamily: "'DM Sans', sans-serif" }}>
            <span>Assigning to Day {selectedSlot.dayIndex + 1} · {outfitLabel(selectedSlot.slotIndex || 0)}</span>
          </div>
        )}
        <div style={{ display: 'flex', background: '#F0EFED', borderRadius: 20, padding: 3, width: 'fit-content' }}>
          {['saved', 'recent', 'ask'].map(t => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => setTab(t)}>
              {t === 'saved' ? 'Saved' : t === 'recent' ? 'Recent' : 'Ask AI'}
            </button>
          ))}
        </div>
      </div>
      {/* Content */}
      <div className="outfit-scroll-panel" style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
        {tab === 'saved' && (
          savedOutfits.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', paddingTop: 24 }}>
              No saved outfits yet. Save outfits from the Outfits tab to use them here.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {savedOutfits.map(outfit => (
                <OutfitPickerCard
                  key={outfit.id}
                  outfit={outfit}
                  usedBadge={getUsedBadge(outfit.id)}
                  onAssign={onAssignOutfit}
                  onItemClick={() => {}}
                />
              ))}
            </div>
          )
        )}
        {tab === 'recent' && (
          recentOutfits.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', paddingTop: 24 }}>
              Ask for outfit recommendations in Chat, then come back here to add them to your trip.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {recentOutfits.map(outfit => (
                <OutfitPickerCard
                  key={outfit.id}
                  outfit={outfit}
                  usedBadge={getUsedBadge(outfit.id)}
                  onAssign={(o) => { onToggleSaved(o.id, o.saved); onAssignOutfit(o); }}
                  onItemClick={() => {}}
                />
              ))}
            </div>
          )
        )}
        {tab === 'ask' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAiSearch(aiQuery); }}
                placeholder="What's the occasion?"
                style={{ flex: 1, padding: '10px 14px', background: '#F3F2F0', border: 'none', borderRadius: 10, fontSize: 'var(--font-body)', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
              />
              <button
                onClick={() => handleAiSearch(aiQuery)}
                disabled={aiLoading || !aiQuery.trim()}
                style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: aiQuery.trim() ? '#1A1A1A' : '#E0E0E0', color: '#fff', cursor: aiQuery.trim() ? 'pointer' : 'not-allowed', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                {aiLoading ? <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite', display: 'block' }} /> : '→'}
              </button>
            </div>
            {!aiResults.length && !aiLoading && (
              <div>
                <p style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>— or try —</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {QUICK_CHIPS.map(chip => (
                    <button
                      key={chip}
                      onClick={() => { setAiQuery(chip); handleAiSearch(chip); }}
                      style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', fontSize: 12, fontFamily: "'DM Sans', sans-serif", color: '#555', cursor: 'pointer' }}
                    >{chip}</button>
                  ))}
                </div>
              </div>
            )}
            {aiLoading && (
              <p style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', paddingTop: 16 }}>Finding outfits...</p>
            )}
            {aiResults.length > 0 && (
              <>
                <p style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif", marginBottom: 8 }}>
                  {selectedSlot ? `Tap an outfit to assign it to Day ${selectedSlot.dayIndex + 1} ${outfitLabel(selectedSlot.slotIndex || 0)}` : 'Tap an outfit to save it'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {aiResults.map((outfit, i) => (
                    <OutfitPickerCard
                      key={outfit.id || i}
                      outfit={outfit}
                      usedBadge={null}
                      onAssign={(o) => { onToggleSaved(o.id, o.saved ?? false); onAssignOutfit(o); }}
                      onItemClick={() => {}}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OutfitSelectionSheet({ selectedSlot, savedOutfits, slotMap, onAssign, onClose }) {
  function getUsedBadge(outfitId) {
    const usedSlots = Object.values(slotMap).filter(s => s.outfitId === outfitId);
    if (usedSlots.length === 0) return null;
    const s = usedSlots[0];
    return `Day ${s.dayIndex + 1}`;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '20px 20px 0 0', padding: '8px 20px 32px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ width: 40, height: 4, background: '#D4D4D4', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>Choose an outfit</h2>
            {selectedSlot && (
              <p style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif", margin: '4px 0 0' }}>
                Day {selectedSlot.dayIndex + 1} · {outfitLabel(selectedSlot.slotIndex)}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: 'rgba(0,0,0,0.05)', color: '#666', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {savedOutfits.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', paddingTop: 24 }}>
              No saved outfits yet. Save outfits from the Outfits tab to use them here.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {savedOutfits.map(outfit => (
                <OutfitPickerCard
                  key={outfit.id}
                  outfit={outfit}
                  usedBadge={getUsedBadge(outfit.id)}
                  onAssign={onAssign}
                  onItemClick={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TripDetailView({ trip, savedOutfits, vizGenerations, hasReferencePhoto, onVisualizeClick, onViewVisualization, onItemClick, onOpenSummary, onEditTrip }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [activeOutfitIndex, setActiveOutfitIndex] = useState(0);

  useEffect(() => {
    db.fetchTripPlanWithSlots(trip.id).then(data => {
      setSlots(data.slots);
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load trip slots:', err);
      setLoading(false);
    });
  }, [trip.id]);

  useEffect(() => {
    if (trip.destination) {
      fetchForecastForTrip(trip.destination, trip.startDate, trip.endDate)
        .then(setForecast)
        .catch(() => setForecast(null));
    }
  }, [trip.id, trip.destination, trip.startDate, trip.endDate]);

  const slotMap = {};
  for (const s of slots) slotMap[`${s.dayIndex}-${s.slotName}`] = s;

  const filledCount = slots.filter(s => s.outfitId).length;


  const handleAddOutfit = (dayIndex) => {
    const daySlots = slots.filter(s => s.dayIndex === dayIndex && s.outfitId);
    const usedIndices = daySlots.map(s => db.slotIndexFromName(s.slotName));
    let nextIndex = 0;
    while (usedIndices.includes(nextIndex) && nextIndex < db.MAX_OUTFITS_PER_DAY) nextIndex++;
    if (nextIndex >= db.MAX_OUTFITS_PER_DAY) return;
    const slotName = db.slotNameForIndex(nextIndex);
    setSelectedSlot({ dayIndex, slotName, slotIndex: nextIndex });
  };

  const handleAssignOutfit = async (outfit) => {
    if (!selectedSlot) return;
    const { dayIndex, slotName } = selectedSlot;
    // Optimistic update
    const newSlot = { id: null, tripPlanId: trip.id, dayIndex, slotName, outfitId: outfit.id, outfit };
    setSlots(prev => [...prev.filter(s => !(s.dayIndex === dayIndex && s.slotName === slotName)), newSlot]);
    setSelectedSlot(null);
    try {
      const saved = await db.upsertTripSlot({ tripPlanId: trip.id, dayIndex, slotName, outfitId: outfit.id });
      setSlots(prev => prev.map(s => s.dayIndex === dayIndex && s.slotName === slotName ? { ...s, id: saved.id } : s));
    } catch (err) {
      console.error('Failed to assign outfit to slot:', err);
    }
  };

  const handleRemoveSlot = async (dayIndex, slotName) => {
    const nextSlots = slots.filter(s => !(s.dayIndex === dayIndex && s.slotName === slotName));
    const remaining = nextSlots.filter(s => s.dayIndex === dayIndex && s.outfitId).length;
    setSlots(nextSlots);
    setActiveOutfitIndex(prev => Math.min(prev, Math.max(0, remaining - 1)));
    try {
      await db.removeTripSlot({ tripPlanId: trip.id, dayIndex, slotName });
    } catch (err) {
      console.error('Failed to remove slot:', err);
    }
  };


  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #D8D8D8', borderTopColor: '#8A8A8A', animation: 'spin 0.8s linear infinite', display: 'block' }} />
    </div>;
  }

  const daySlots = slots.filter(s => s.dayIndex === activeDayIndex && s.outfitId).sort((a, b) => db.slotIndexFromName(a.slotName) - db.slotIndexFromName(b.slotName));
  const canAddMore = daySlots.length < db.MAX_OUTFITS_PER_DAY;
  const activeSlot = daySlots.length > 0 && activeOutfitIndex < daySlots.length ? daySlots[activeOutfitIndex] : null;
  const activeOutfit = activeSlot?.outfit;
  const activeSlotIndex = activeSlot ? db.slotIndexFromName(activeSlot.slotName) : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Day tab bar */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <DayTabBar trip={trip} activeDayIndex={activeDayIndex} onSelectDay={(i) => { setActiveDayIndex(i); setActiveOutfitIndex(0); }} slots={slots} forecast={forecast} />
        {/* Progress + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 10px' }}>
          <span style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}>
            {filledCount} outfit{filledCount !== 1 ? 's' : ''} planned
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={onOpenSummary}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 12, color: '#999', fontFamily: "'DM Sans', sans-serif" }}
          >
            Packing list
          </button>
          <button
            onClick={() => setShowEditSheet(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 12, color: '#999', fontFamily: "'DM Sans', sans-serif" }}
          >
            Edit trip
          </button>
        </div>
      </div>

      {/* Outfit pills + full-size display */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 0' }}>
        {/* Outfit toggle pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {daySlots.map((slot, i) => {
            const isActive = i === activeOutfitIndex;
            return (
              <button
                key={slot.slotName}
                onClick={() => setActiveOutfitIndex(i)}
                style={{
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                  background: isActive ? '#1A1A1A' : 'transparent',
                  border: isActive ? 'none' : '1px solid rgba(0,0,0,0.12)',
                  color: isActive ? '#fff' : '#1A1A1A',
                  fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {outfitLabel(db.slotIndexFromName(slot.slotName))}
              </button>
            );
          })}
          {canAddMore && (
            <button
              onClick={() => handleAddOutfit(activeDayIndex)}
              style={{
                padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                background: 'transparent', border: '1.5px dashed #D4D4D4',
                color: '#999', fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
              }}
            >
              + Add
            </button>
          )}
        </div>

        {/* Active outfit display */}
        {activeSlot ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
                {activeOutfit.vibe}
              </h3>
              <button
                onClick={() => {
                  if (window.confirm('Remove this outfit from the trip?')) {
                    handleRemoveSlot(activeDayIndex, activeSlot.slotName);
                  }
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#999', display: 'flex', alignItems: 'center' }}
                aria-label="Remove outfit"
              >
                <TrashIcon size={16} color="#999" />
              </button>
            </div>
            {activeOutfit.items.length > 0 && (
              <div className="item-card-grid">
                {activeOutfit.items.map((item, i) => <ItemCard key={i} item={item} onClick={() => onItemClick(item)} />)}
              </div>
            )}
            <TripVisualizationButton outfit={activeOutfit} vizGenerations={vizGenerations} hasReferencePhoto={hasReferencePhoto} onVisualizeClick={onVisualizeClick} onViewVisualization={onViewVisualization} />
          </div>
        ) : daySlots.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#999', fontFamily: "'DM Sans', sans-serif" }}>
            <span style={{ fontSize: 32, marginBottom: 8 }}>👕</span>
            <span style={{ fontSize: 14 }}>No outfits planned for this day</span>
          </div>
        ) : null}
      </div>

      {/* Outfit selection sheet */}
      {selectedSlot && (
        <OutfitSelectionSheet
          selectedSlot={selectedSlot}
          savedOutfits={savedOutfits}
          slotMap={slotMap}
          onAssign={handleAssignOutfit}
          onClose={() => setSelectedSlot(null)}
        />
      )}


      {showEditSheet && (
        <TripFormSheet
          isEdit
          initialValues={trip}
          onClose={() => setShowEditSheet(false)}
          onSave={async (fields) => {
            const oldDayCount = db.getTripDayCount(trip.startDate, trip.endDate);
            const newDayCount = db.getTripDayCount(fields.startDate, fields.endDate);
            const willLoseDays = newDayCount < oldDayCount;
            const slotsOnRemovedDays = willLoseDays ? slots.filter(s => s.dayIndex >= newDayCount && s.outfitId) : [];
            if (slotsOnRemovedDays.length > 0 && !window.confirm(`Shortening this trip will remove ${slotsOnRemovedDays.length} planned outfit${slotsOnRemovedDays.length !== 1 ? 's' : ''} from the removed days. Continue?`)) {
              throw new Error('cancelled');
            }
            const updated = await db.updateTripPlan(trip.id, fields);
            if (willLoseDays) {
              setSlots(prev => prev.filter(s => s.dayIndex < newDayCount));
              if (activeDayIndex >= newDayCount) setActiveDayIndex(newDayCount - 1);
            }
            onEditTrip(updated);
            setShowEditSheet(false);
          }}
        />
      )}
    </div>
  );
}

function TripSummaryView({ trip, onBack }) {
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState({});
  const [extras, setExtras] = useState([]);
  const [newExtra, setNewExtra] = useState('');

  const storageKey = `trip-packing-${trip.id}`;

  useEffect(() => {
    db.fetchTripPlanWithSlots(trip.id).then(data => {
      setTripData(data);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
    // Load persisted packing state
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (saved.checked) setCheckedItems(saved.checked);
      if (saved.extras) setExtras(saved.extras);
    } catch {}
  }, [trip.id]);

  const persistState = (checked, extrasList) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ checked, extras: extrasList })); } catch {}
  };

  const toggleItem = (key) => {
    setCheckedItems(prev => {
      const next = { ...prev, [key]: !prev[key] };
      persistState(next, extras);
      return next;
    });
  };

  const toggleExtra = (idx) => {
    setExtras(prev => {
      const next = prev.map((e, i) => i === idx ? { ...e, checked: !e.checked } : e);
      persistState(checkedItems, next);
      return next;
    });
  };

  const addExtra = () => {
    if (!newExtra.trim()) return;
    const next = [...extras, { text: newExtra.trim(), checked: false }];
    setExtras(next);
    setNewExtra('');
    persistState(checkedItems, next);
  };

  const removeExtra = (idx) => {
    const next = extras.filter((_, i) => i !== idx);
    setExtras(next);
    persistState(checkedItems, next);
  };

  if (loading) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #D8D8D8', borderTopColor: '#8A8A8A', animation: 'spin 0.8s linear infinite', display: 'block' }} />
    </div>;
  }

  const { slots } = tripData;
  const dayCount = db.getTripDayCount(trip.startDate, trip.endDate);

  // Build packing list: count how many times each item appears, grouped by category
  const itemUsage = {};
  for (const slot of slots) {
    for (const item of slot.outfit?.items || []) {
      const key = item.id;
      if (!itemUsage[key]) itemUsage[key] = { item, count: 0 };
      itemUsage[key].count++;
    }
  }
  const packingList = Object.values(itemUsage).sort((a, b) => b.count - a.count);

  // Group by category
  const categoryOrder = ['Tops', 'Layers', 'Bottoms', 'Dresses & Jumpsuits', 'Shoes', 'Accessories', 'Other'];
  const categoryMap = {};
  for (const { item, count } of packingList) {
    const cat = item.category || 'Other';
    // Normalize category name
    const normalized = categoryOrder.find(c => c.toLowerCase() === cat.toLowerCase())
      || cat.charAt(0).toUpperCase() + cat.slice(1);
    if (!categoryMap[normalized]) categoryMap[normalized] = [];
    categoryMap[normalized].push({ item, count });
  }
  const sortedCategories = categoryOrder.filter(c => categoryMap[c]).concat(
    Object.keys(categoryMap).filter(c => !categoryOrder.includes(c))
  );

  const totalPackingItems = packingList.length + extras.length;
  const checkedCount = packingList.filter(p => checkedItems[p.item.id]).length + extras.filter(e => e.checked).length;

  const checkboxStyle = (checked) => ({
    width: 20, height: 20, borderRadius: 6, border: checked ? 'none' : '1.5px solid #D4D4D4',
    background: checked ? '#1A1A1A' : 'transparent', color: '#fff', fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
    flexShrink: 0, transition: 'all 0.15s ease',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="outfit-scroll-panel" style={{ flex: 1, overflowY: 'auto', padding: '0 var(--container-padding-x) calc(24px + var(--safe-bottom))' }}>
        {/* Packing list */}
        {packingList.length > 0 && (
          <div style={{ paddingTop: 8 }}>
            {totalPackingItems > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: checkedCount === totalPackingItems ? '#22C55E' : '#999', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                  {checkedCount}/{totalPackingItems} packed
                </span>
              </div>
            )}
            <div style={{ height: 3, background: '#F0EFED', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ width: `${totalPackingItems > 0 ? (checkedCount / totalPackingItems) * 100 : 0}%`, height: '100%', background: checkedCount === totalPackingItems ? '#22C55E' : '#1A1A1A', borderRadius: 2, transition: 'width 0.3s ease' }} />
            </div>

            {sortedCategories.map(category => (
              <div key={category} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  {category}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {categoryMap[category].map(({ item, count }) => (
                    <div key={item.id} onClick={() => toggleItem(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                      <div style={checkboxStyle(!!checkedItems[item.id])}>
                        {checkedItems[item.id] && '✓'}
                      </div>
                      {(item.images?.[0] || item.image) ? (
                        <img src={item.images?.[0] || item.image} alt={item.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, opacity: checkedItems[item.id] ? 0.4 : 1, transition: 'opacity 0.15s ease' }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 8, background: '#EAE9E7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: checkedItems[item.id] ? 0.4 : 1, transition: 'opacity 0.15s ease' }}>
                          <span style={{ fontSize: 20 }}>{item.emoji || '👕'}</span>
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: checkedItems[item.id] ? '#999' : '#1A1A1A', textDecoration: checkedItems[item.id] ? 'line-through' : 'none', flex: 1, transition: 'all 0.15s ease' }}>
                        {item.name}
                      </span>
                      {count > 1 && <span style={{ fontSize: 11, color: '#999', fontFamily: "'DM Sans', sans-serif" }}>×{count}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Extras section */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#999', fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Extras
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {extras.map((extra, idx) => (
                  <div key={idx} onClick={() => toggleExtra(idx)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                    <div style={checkboxStyle(extra.checked)}>
                      {extra.checked && '✓'}
                    </div>
                    <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: extra.checked ? '#999' : '#1A1A1A', textDecoration: extra.checked ? 'line-through' : 'none', flex: 1 }}>
                      {extra.text}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); removeExtra(idx); }} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 14, cursor: 'pointer', padding: '0 2px' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={newExtra}
                  onChange={e => setNewExtra(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addExtra()}
                  placeholder="Add item (charger, toiletries...)"
                  style={{ flex: 1, padding: '10px 12px', background: '#F3F2F0', border: 'none', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
                />
                <button onClick={addExtra} style={{ padding: '0 14px', borderRadius: 8, border: 'none', background: '#1A1A1A', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer' }}>Add</button>
              </div>
            </div>
          </div>
        )}

        {/* Show extras even if no outfits planned yet */}
        {packingList.length === 0 && (
          <div style={{ marginTop: 8, paddingTop: 16 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: '0 0 4px' }}>Packing list</h2>
            <p style={{ fontSize: 12, color: '#999', fontFamily: "'DM Sans', sans-serif", margin: '0 0 12px' }}>
              Plan some outfits to build your packing list.
            </p>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#999', fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Extras
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {extras.map((extra, idx) => (
                <div key={idx} onClick={() => toggleExtra(idx)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer' }}>
                  <div style={checkboxStyle(extra.checked)}>{extra.checked && '✓'}</div>
                  <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: extra.checked ? '#999' : '#1A1A1A', textDecoration: extra.checked ? 'line-through' : 'none', flex: 1 }}>{extra.text}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeExtra(idx); }} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 14, cursor: 'pointer', padding: '0 2px' }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                value={newExtra}
                onChange={e => setNewExtra(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addExtra()}
                placeholder="Add item (charger, toiletries...)"
                style={{ flex: 1, padding: '10px 12px', background: '#F3F2F0', border: 'none', borderRadius: 8, fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
              />
              <button onClick={addExtra} style={{ padding: '0 14px', borderRadius: 8, border: 'none', background: '#1A1A1A', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer' }}>Add</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TripFormSheet({ onClose, onSave, initialValues, isEdit }) {
  const [title, setTitle] = useState(initialValues?.title || '');
  const [destination, setDestination] = useState(initialValues?.destination || '');
  const [startDate, setStartDate] = useState(initialValues?.startDate || '');
  const [endDate, setEndDate] = useState(initialValues?.endDate || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [selectedCity, setSelectedCity] = useState(initialValues?.destination ? { name: initialValues.destination } : null);
  const cityDebounceRef = useRef(null);

  useEffect(() => {
    return () => { if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current); };
  }, []);

  const handleDestinationChange = (e) => {
    const value = e.target.value;
    setDestination(value);
    setSelectedCity(null);
    setHighlightIndex(-1);
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    if (value.trim().length < 2) {
      setCitySuggestions([]);
      setShowCityDropdown(false);
      return;
    }
    cityDebounceRef.current = setTimeout(async () => {
      const results = await searchCities(value);
      setCitySuggestions(results);
      setShowCityDropdown(results.length > 0);
    }, 300);
  };

  const handleCitySelect = (city) => {
    const display = city.country ? `${city.name}, ${city.country}` : city.name;
    setDestination(display);
    setSelectedCity(city);
    setCitySuggestions([]);
    setShowCityDropdown(false);
  };

  const handleCityKeyDown = (e) => {
    if (!showCityDropdown || citySuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, citySuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleCitySelect(citySuggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowCityDropdown(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Please enter a trip name'); return; }
    if (!startDate) { setError('Please select a start date'); return; }
    if (!endDate) { setError('Please select an end date'); return; }
    if (endDate < startDate) { setError('End date must be after start date'); return; }
    if (destination.trim() && !selectedCity) { setError('Please select a destination from the suggestions'); return; }
    setLoading(true);
    setError('');
    try {
      await onSave({ title: title.trim(), destination: destination.trim() || null, startDate, endDate });
    } catch (err) {
      setError(isEdit ? 'Failed to save changes. Try again.' : 'Failed to create trip. Try again.');
      setLoading(false);
    }
  };

  const inputStyle = { display: 'block', width: '100%', maxWidth: '100%', padding: '12px 14px', background: '#F3F2F0', border: 'none', borderRadius: 10, fontSize: 'var(--font-body)', fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 12, fontWeight: 500, color: '#999', fontFamily: "'DM Sans', sans-serif", marginBottom: 6, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '20px 20px 0 0', padding: '8px 20px calc(32px + var(--safe-bottom))', overflow: 'visible', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: 40, height: 4, background: '#D4D4D4', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif" }}>{isEdit ? 'Edit Trip' : 'New Trip'}</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: 'rgba(0,0,0,0.05)', color: '#666', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Trip name</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NYC Work Trip" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <label style={labelStyle}>Destination</label>
          <input
            value={destination}
            onChange={handleDestinationChange}
            onKeyDown={handleCityKeyDown}
            onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
            placeholder="e.g. New York City"
            style={inputStyle}
          />
          {showCityDropdown && citySuggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
              {citySuggestions.map((city, i) => (
                <div
                  key={i}
                  onMouseDown={() => handleCitySelect(city)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: 'var(--font-body)', fontFamily: "'DM Sans', sans-serif",
                    background: i === highlightIndex ? '#F3F2F0' : 'transparent',
                    color: '#1A1A1A',
                  }}
                >
                  {[city.name, city.admin1, city.country].filter(Boolean).join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 16, overflow: 'hidden' }}>
          <label style={labelStyle}>Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none' }} />
        </div>
        <div style={{ marginBottom: 20, overflow: 'hidden' }}>
          <label style={labelStyle}>End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ ...inputStyle, WebkitAppearance: 'none', appearance: 'none' }} />
        </div>
        {error && <p style={{ fontSize: 13, color: '#DC2626', fontFamily: "'DM Sans', sans-serif", margin: '-8px 0 12px', textAlign: 'center' }}>{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: loading ? '#999' : '#1A1A1A', color: '#fff', fontSize: 'var(--font-body)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Trip')}
        </button>
      </div>
    </div>
  );
}

function TripCard({ trip, onOpen, onDelete, outfitCount = 0 }) {
  const dayCount = db.getTripDayCount(trip.startDate, trip.endDate);
  const startLabel = new Date(trip.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = new Date(trip.endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div
      onClick={onOpen}
      style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 10, cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif" }}>{trip.title}</div>
          <div style={{ fontSize: 13, color: '#999', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
            {startLabel} – {endLabel} · {dayCount} day{dayCount !== 1 ? 's' : ''}
            {trip.destination && <span> · {trip.destination}</span>}
          </div>
          <div style={{ fontSize: 12, color: '#999', fontFamily: "'DM Sans', sans-serif", marginTop: 4 }}>
            {outfitCount} outfit{outfitCount !== 1 ? 's' : ''} planned
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(trip.id); }}
          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: '#999', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        ><TrashIcon size={14} color="#999" /></button>
      </div>
    </div>
  );
}

function TripsListView({ tripPlans, onOpenTrip, onDeleteTrip, onNewTrip, slotCounts }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="outfit-scroll-panel" style={{ flex: 1, overflowY: 'auto', padding: `0 var(--container-padding-x) calc(24px + var(--safe-bottom))` }}>
        {tripPlans.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>🧳</span>
            <p style={{ fontSize: 20, fontFamily: "'Instrument Serif', serif", fontWeight: 400, color: '#1A1A1A', margin: '0 0 8px' }}>Plan a trip</p>
            <p style={{ fontSize: 'var(--font-body)', color: '#999', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, maxWidth: 260, margin: '0 0 24px' }}>
              Assign outfits to each day of your upcoming trips.
            </p>
            <button
              onClick={onNewTrip}
              style={{ padding: '12px 24px', borderRadius: 12, border: 'none', background: '#1A1A1A', color: '#fff', fontSize: 'var(--font-body)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer' }}
              onPointerDown={(e) => e.currentTarget.style.opacity = '0.8'}
              onPointerUp={(e) => e.currentTarget.style.opacity = '1'}
              onPointerLeave={(e) => e.currentTarget.style.opacity = '1'}
            >+ New Trip</button>
          </div>
        ) : (
          tripPlans.map(trip => (
            <TripCard key={trip.id} trip={trip} onOpen={() => onOpenTrip(trip)} onDelete={onDeleteTrip} outfitCount={slotCounts?.[trip.id] || 0} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Weekly Calendar Components ──────────────────────────────

const LOADING_MESSAGES = [
  "Planning your week...",
  "Checking the forecast...",
  "Mixing and matching...",
  "Curating your looks...",
  "Almost there...",
];

function WeeklyCalendarView({ weekStart, days, forecast, loading, error, onWeekNav, onRegenerate, onToggleLock, onSelectDay, onItemClick }) {
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingMsgIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

  const weekEndStr = db.getWeekEnd(weekStart);
  const startLabel = db.getCalendarDayLabel(weekStart, 0);
  const endLabel = db.getCalendarDayLabel(weekStart, 6);
  const unlockedCount = 7 - days.filter(d => d.locked).length;

  if (loading) {
    return (
      <div style={{ padding: "40px var(--container-padding-x)", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "#888" }} />
          <p style={{ fontSize: "var(--font-body)", color: "#888", fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
            {LOADING_MESSAGES[loadingMsgIndex]}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px var(--container-padding-x)", textAlign: "center" }}>
        <p style={{ fontSize: "var(--font-body)", color: "#c00", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
          {error}
        </p>
        <button
          onClick={onRegenerate}
          style={{
            padding: "10px 24px", borderRadius: 8, border: "none", background: "#1A1A1A",
            color: "#fff", fontSize: "var(--font-body)", fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 var(--container-padding-x)", paddingBottom: 100, overflow: "auto", flex: 1 }}>
      {/* Week navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 8 }}>
        <button
          onClick={() => onWeekNav(-1)}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          aria-label="Previous week"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span style={{ fontSize: "var(--font-small)", fontWeight: 500, color: "#555", fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>
          {startLabel} — {endLabel}
        </span>
        <button
          onClick={() => onWeekNav(1)}
          style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(0,0,0,0.1)", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          aria-label="Next week"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Day rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2, 3, 4, 5, 6].map(dayIndex => {
          const day = days.find(d => d.dayIndex === dayIndex);
          const dayLabel = db.getCalendarDayLabel(weekStart, dayIndex);
          const dayName = db.getCalendarDayName(dayIndex);
          const forecastDay = forecast?.[dayIndex];
          const weatherEmoji = forecastDay ? wmoCodeToEmoji(forecastDay.weatherCode) : '';
          const tempStr = forecastDay ? `${forecastDay.tempMax}°` : '';

          return (
            <div
              key={dayIndex}
              style={{
                background: "#fff",
                borderRadius: 12,
                border: day?.locked ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.08)",
                padding: "12px 14px",
                cursor: day?.outfit ? "pointer" : "default",
                transition: "box-shadow 0.15s ease",
              }}
              onClick={() => day?.outfit && onSelectDay(dayIndex)}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: day?.outfit ? 8 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "var(--font-body)", fontWeight: 600, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif", minWidth: 36 }}>
                    {dayName}
                  </span>
                  <span style={{ fontSize: "var(--font-small)", color: "#888", fontFamily: "'DM Sans', sans-serif" }}>
                    {dayLabel.replace(/^\w+, /, '')}
                  </span>
                  {weatherEmoji && (
                    <span style={{ fontSize: "var(--font-small)" }}>{weatherEmoji} {tempStr}</span>
                  )}
                </div>
                {day?.outfit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleLock(dayIndex); }}
                    style={{
                      width: 28, height: 28, borderRadius: 6, border: "none",
                      background: day.locked ? "#1A1A1A" : "rgba(0,0,0,0.05)",
                      color: day.locked ? "#fff" : "#888",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, fontSize: 14,
                    }}
                    aria-label={day.locked ? "Unlock day" : "Lock day"}
                  >
                    {day.locked ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
                    )}
                  </button>
                )}
              </div>

              {day?.outfit ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Item thumbnails */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {(day.outfit.items || []).slice(0, 4).map((item, i) => (
                      <div
                        key={item.id || i}
                        style={{
                          width: 36, height: 36, borderRadius: 6, overflow: "hidden",
                          background: "#f5f5f5", flexShrink: 0,
                        }}
                      >
                        {item.image ? (
                          <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontSize: 16 }}>
                            {item.emoji || "👕"}
                          </span>
                        )}
                      </div>
                    ))}
                    {(day.outfit.items || []).length > 4 && (
                      <div style={{ width: 36, height: 36, borderRadius: 6, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#888", fontWeight: 600 }}>
                        +{day.outfit.items.length - 4}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: "var(--font-small)", color: "#555", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    {day.outfit.vibe}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: "var(--font-small)", color: "#ccc", fontFamily: "'DM Sans', sans-serif", fontStyle: "italic" }}>
                  No outfit
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Regenerate button */}
      {unlockedCount > 0 && days.length > 0 && (
        <button
          onClick={onRegenerate}
          style={{
            width: "100%", marginTop: 20, padding: "14px 0", borderRadius: 10,
            border: "none", background: "#1A1A1A", color: "#fff",
            fontSize: "var(--font-body)", fontWeight: 600, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Regenerate {unlockedCount === 7 ? "all days" : `${unlockedCount} unlocked day${unlockedCount > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}

function CalendarDayDetailView({ day, weekStart, forecast, onItemClick, onToggleSaved }) {
  if (!day?.outfit) return null;
  const dayLabel = db.getCalendarDayLabel(weekStart, day.dayIndex);
  const forecastDay = forecast?.[day.dayIndex];
  const weatherEmoji = forecastDay ? wmoCodeToEmoji(forecastDay.weatherCode) : '';
  const tempStr = forecastDay ? `${forecastDay.tempMin}° – ${forecastDay.tempMax}°` : '';

  return (
    <div style={{ padding: "0 var(--container-padding-x)", paddingBottom: 100, overflow: "auto", flex: 1 }}>
      {/* Day header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: "var(--font-body)", fontWeight: 600, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
            {dayLabel}
          </span>
          {weatherEmoji && (
            <span style={{ fontSize: "var(--font-small)", color: "#888" }}>{weatherEmoji} {tempStr}</span>
          )}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 400, color: "#1A1A1A", fontFamily: "'Instrument Serif', serif", margin: 0 }}>
          {day.outfit.vibe}
        </h2>
      </div>

      {/* Items grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 10,
        marginBottom: 20,
      }}>
        {(day.outfit.items || []).map((item) => (
          <div
            key={item.id}
            onClick={() => onItemClick(item)}
            style={{
              background: "#fff",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
              cursor: "pointer",
            }}
          >
            <div style={{ aspectRatio: "1", background: "#f5f5f5", position: "relative" }}>
              {item.image ? (
                <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontSize: 40 }}>
                  {item.emoji || "👕"}
                </div>
              )}
            </div>
            <div style={{ padding: "8px 10px" }}>
              <p style={{ fontSize: "var(--font-small)", fontWeight: 500, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name}
              </p>
              <p style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans', sans-serif", margin: "2px 0 0 0" }}>
                {item.category}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Reasoning */}
      {day.outfit.reasoning && (
        <div style={{
          background: "#f9f9f9", borderRadius: 10, padding: "14px 16px", marginBottom: 16,
        }}>
          <p style={{ fontSize: "var(--font-small)", fontWeight: 600, color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif", margin: "0 0 4px 0" }}>
            Why this works
          </p>
          <p style={{ fontSize: "var(--font-small)", color: "#555", fontFamily: "'DM Sans', sans-serif", margin: 0, lineHeight: 1.5 }}>
            {day.outfit.reasoning}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Style DNA Report View ────────────────────────────────

const COLOR_MAP = {
  black: '#1A1A1A', white: '#F5F5F5', grey: '#9E9E9E', gray: '#9E9E9E',
  navy: '#1B3A5C', blue: '#4A90D9', red: '#D94A4A', green: '#4A9E6B',
  brown: '#8B6914', beige: '#D4C5A9', cream: '#FAF0DB', pink: '#E8A0BF',
  purple: '#8B5CF6', orange: '#E8864A', yellow: '#E8D44A', olive: '#808000',
  burgundy: '#800020', maroon: '#800000', teal: '#008080', coral: '#FF7F50',
  tan: '#D2B48C', khaki: '#C3B091', lavender: '#B4A7D6', mint: '#98FF98',
  gold: '#D4AF37', silver: '#C0C0C0', charcoal: '#36454F', ivory: '#FFFFF0',
};

function getColorHex(name) {
  if (!name) return '#CCC';
  const lower = name.toLowerCase().trim();
  if (COLOR_MAP[lower]) return COLOR_MAP[lower];
  // Check partial matches
  for (const [key, val] of Object.entries(COLOR_MAP)) {
    if (lower.includes(key)) return val;
  }
  return '#CCC';
}

function StyleDnaView({ report, loading, error, onRegenerate }) {
  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#999' }} />
        <p style={{ fontSize: 'var(--font-body)', color: '#999', fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>
          Analyzing your wardrobe...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <p style={{ fontSize: 'var(--font-body)', color: '#D94A4A', fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>
          {error}
        </p>
        <button
          onClick={onRegenerate}
          style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid #E0E0E0', background: '#fff', color: '#1A1A1A', fontSize: 'var(--font-small)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer' }}
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <div style={{ fontSize: 48 }}>🧬</div>
        <h2 style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>
          Your Style DNA
        </h2>
        <p style={{ fontSize: 'var(--font-small)', color: '#777', fontFamily: "'DM Sans', sans-serif", textAlign: 'center', maxWidth: 280, lineHeight: 1.5, margin: 0 }}>
          Get an AI-powered analysis of your wardrobe — discover your style archetype, color patterns, and what to add next.
        </p>
        <button
          onClick={onRegenerate}
          style={{ padding: '10px 24px', borderRadius: 24, border: 'none', background: '#1A1A1A', color: '#fff', fontSize: 'var(--font-small)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
        >
          Generate Report
        </button>
      </div>
    );
  }

  const totalItems = (report.categoryBalance?.breakdown || []).reduce((sum, b) => sum + b.count, 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 var(--container-padding-x) calc(var(--safe-bottom) + 16px)' }}>

      {/* Archetype Card */}
      <div style={{ background: '#1A1A1A', borderRadius: 16, padding: '24px 20px', marginBottom: 16, color: '#fff' }}>
        <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 8 }}>
          Your Style Archetype
        </div>
        <h2 style={{ fontSize: 'var(--font-title)', fontFamily: "'Instrument Serif', serif", fontWeight: 400, margin: '0 0 8px', lineHeight: 1.1 }}>
          {report.archetype?.label}
        </h2>
        <p style={{ fontSize: 'var(--font-small)', color: 'rgba(255,255,255,0.7)', fontFamily: "'DM Sans', sans-serif", margin: 0, lineHeight: 1.5 }}>
          {report.archetype?.description}
        </p>
      </div>

      {/* Color Profile */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: '0 0 16px' }}>
          Color Profile
        </h3>

        {/* Color swatches - Dominant */}
        {report.colorProfile?.dominant?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 'var(--font-caption)', color: '#999', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Dominant
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {report.colorProfile.dominant.map((color, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9f9f9', borderRadius: 20, padding: '4px 12px 4px 4px' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: getColorHex(color), border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--font-caption)', color: '#555', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Color swatches - Accent */}
        {report.colorProfile?.accent?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 'var(--font-caption)', color: '#999', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Accent
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {report.colorProfile.accent.map((color, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9f9f9', borderRadius: 20, padding: '4px 12px 4px 4px' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: getColorHex(color), border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--font-caption)', color: '#555', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing colors */}
        {report.colorProfile?.missing?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 'var(--font-caption)', color: '#999', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Missing
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {report.colorProfile.missing.map((color, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9f9f9', borderRadius: 20, padding: '4px 12px 4px 4px', opacity: 0.6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: getColorHex(color), border: '2px dashed rgba(0,0,0,0.2)', flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--font-caption)', color: '#555', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontSize: 'var(--font-small)', color: '#555', fontFamily: "'DM Sans', sans-serif", margin: '12px 0 0', lineHeight: 1.5 }}>
          {report.colorProfile?.insight}
        </p>
      </div>

      {/* Category Balance */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: '0 0 16px' }}>
          Wardrobe Balance
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(report.categoryBalance?.breakdown || []).map((cat, i) => {
            const pct = totalItems > 0 ? Math.round((cat.count / totalItems) * 100) : 0;
            const barColor = cat.assessment === 'over' ? '#E8864A' : cat.assessment === 'under' ? '#D94A4A' : '#4A9E6B';
            return (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--font-small)', color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    {cat.category}
                  </span>
                  <span style={{ fontSize: 'var(--font-caption)', color: '#999', fontFamily: "'DM Sans', sans-serif" }}>
                    {cat.count} items · {pct}%
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#F0EFED', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(pct, 4)}%`, borderRadius: 3, background: barColor, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 'var(--font-small)', color: '#555', fontFamily: "'DM Sans', sans-serif", margin: '14px 0 0', lineHeight: 1.5 }}>
          {report.categoryBalance?.insight}
        </p>
      </div>

      {/* Style Insights */}
      {report.styleInsights?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: '0 0 14px' }}>
            Insights
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {report.styleInsights.map((insight, i) => (
              <div key={i} style={{ borderLeft: '3px solid #1A1A1A', paddingLeft: 12 }}>
                <div style={{ fontSize: 'var(--font-small)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>
                  {insight.title}
                </div>
                <div style={{ fontSize: 'var(--font-small)', color: '#555', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5 }}>
                  {insight.body}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gap Analysis */}
      {report.gapAnalysis?.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
          <h3 style={{ fontSize: 'var(--font-body)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif", margin: '0 0 14px' }}>
            What to Add Next
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {report.gapAnalysis.map((gap, i) => (
              <div key={i} style={{ background: '#f9f9f9', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontSize: 'var(--font-small)', fontWeight: 600, color: '#1A1A1A', fontFamily: "'DM Sans', sans-serif" }}>
                    {gap.item}
                  </span>
                  {gap.outfitsUnlocked > 0 && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: '#4A9E6B', fontFamily: "'DM Sans', sans-serif",
                      background: 'rgba(74,158,107,0.1)', borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8,
                    }}>
                      +{gap.outfitsUnlocked} outfits
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 'var(--font-small)', color: '#555', fontFamily: "'DM Sans', sans-serif", margin: 0, lineHeight: 1.5 }}>
                  {gap.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regenerate button */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 16px' }}>
        <button
          onClick={onRegenerate}
          style={{ padding: '8px 20px', borderRadius: 20, border: '1px solid #E0E0E0', background: '#fff', color: '#555', fontSize: 'var(--font-small)', fontFamily: "'DM Sans', sans-serif", fontWeight: 500, cursor: 'pointer' }}
        >
          Regenerate Report
        </button>
      </div>
    </div>
  );
}

function SidePanel({ isOpen, onClose, onNewChat, onOpenWardrobe, onOpenProfile, onOpenSaved, onOpenCalendar, onOpenTrips, onOpenStyleDna, savedCount, chatHistory, onSelectChat, onToggleStar, onDeleteChat, onSignOut }) {
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
            onClick={onOpenCalendar}
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
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Weekly Calendar
          </button>

          <button
            onClick={onOpenTrips}
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
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
              <line x1="12" y1="12" x2="12" y2="16" />
              <line x1="10" y1="14" x2="14" y2="14" />
            </svg>
            Trips
          </button>

          <button
            onClick={onOpenStyleDna}
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
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
            Style DNA
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
  const [garmentPreviousView, setGarmentPreviousView] = useState(null);
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
  const [weather, setWeather] = useState(() => {
    try {
      const cached = localStorage.getItem('runway_weather_cache_metric');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.fetchedAt < 30 * 60 * 1000) {
          return parsed.data;
        }
      }
    } catch { /* ignore */ }
    return null;
  });
  const [savedOutfits, setSavedOutfits] = useState([]);
  const [focusLocation, setFocusLocation] = useState(false);
  const [tripPlans, setTripPlans] = useState([]);
  const [tripSlotCounts, setTripSlotCounts] = useState({});
  const [activeTrip, setActiveTrip] = useState(null); // the trip object for trip-detail/summary
  const [showNewTripSheet, setShowNewTripSheet] = useState(false);
  const [calendarWeekStart, setCalendarWeekStart] = useState(null);
  const [calendarDays, setCalendarDays] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarForecast, setCalendarForecast] = useState(null);
  const [calendarSelectedDay, setCalendarSelectedDay] = useState(null);
  const [calendarError, setCalendarError] = useState(null);
  const [styleDnaReport, setStyleDnaReport] = useState(null);
  const [styleDnaLoading, setStyleDnaLoading] = useState(false);
  const [styleDnaError, setStyleDnaError] = useState(null);
  const [showStyleQuiz, setShowStyleQuiz] = useState(false);
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
    if (!profileLoaded) return;
    const city = profile.location?.city;
    if (!city) { setWeather(null); return; }
    fetchWeatherForDisplay(city).then(setWeather);
  }, [profile.location?.city, profileLoaded]);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [grouped, flat, chats, dbProfile, saved, trips, slotCounts] = await Promise.all([
          db.fetchWardrobeItems(),
          db.fetchWardrobeItemsFlat(),
          db.fetchChats(),
          db.fetchProfile(),
          db.fetchSavedOutfits(),
          db.fetchTripPlans(),
          db.fetchTripSlotCounts(),
        ]);
        setWardrobeItems(grouped);
        setWardrobeFlat(flat);
        setChatHistory(chats);
        setSavedOutfits(saved);
        setTripPlans(trips);
        setTripSlotCounts(slotCounts);

        let mergedProfile = null;
        if (dbProfile && Object.keys(dbProfile).length > 0) {
          setProfile(prev => ({ ...prev, ...dbProfile }));
          mergedProfile = dbProfile;
        } else {
          // One-time migration from localStorage
          try {
            const localProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
            if (localProfile) {
              const parsed = JSON.parse(localProfile);
              await db.saveProfile(parsed);
              setProfile(prev => ({ ...prev, ...parsed }));
              mergedProfile = parsed;
              localStorage.removeItem(PROFILE_STORAGE_KEY);
            }
          } catch (migrationErr) {
            console.error("Failed to migrate localStorage profile:", migrationErr);
          }
        }
        setProfileLoaded(true);
        // Show style quiz on first visit if never completed
        if (!mergedProfile?.styleQuiz?.completedAt) {
          setShowStyleQuiz(true);
        }
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
          previousOutfits: outfits.length > 0 ? outfits.map(o => ({
            vibe: o.vibe,
            reasoning: o.reasoning,
            items: o.items?.map(item => item.name).filter(Boolean) || [],
          })) : undefined,
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
      setView(garmentPreviousView ?? "wardrobe");
      setGarmentPreviousView(null);
    } catch (err) {
      console.error("Failed to delete wardrobe item:", err);
    }
  }, [garmentPreviousView]);

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

  const handleUpdateWardrobeItemNotes = useCallback(async (itemId, notes) => {
    try {
      const updated = await db.updateWardrobeItem(itemId, { notes });
      const [grouped, flat] = await Promise.all([
        db.fetchWardrobeItems(),
        db.fetchWardrobeItemsFlat(),
      ]);
      setWardrobeItems(grouped);
      setWardrobeFlat(flat);
      setLightboxItem(updated);
    } catch (err) {
      console.error("Failed to save notes:", err);
    }
  }, []);

  const handleOpenTrip = useCallback((trip) => {
    setActiveTrip(trip);
    setView("trip-detail");
    setSidePanelOpen(false);
  }, []);

  const handleCreateTrip = useCallback((trip) => {
    setTripPlans(prev => [trip, ...prev]);
    setShowNewTripSheet(false);
    setActiveTrip(trip);
    setView("trip-detail");
  }, []);

  const handleEditTrip = useCallback((updatedTrip) => {
    setActiveTrip(updatedTrip);
    setTripPlans(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
  }, []);

  const handleDeleteTrip = useCallback(async (tripId) => {
    try {
      await db.deleteTripPlan(tripId);
      setTripPlans(prev => prev.filter(t => t.id !== tripId));
      if (activeTrip?.id === tripId) {
        setActiveTrip(null);
        setView("trips");
      }
    } catch (err) {
      console.error("Failed to delete trip:", err);
    }
  }, [activeTrip]);

  // ── Weekly Calendar ──────────────────────────────────────

  const loadCalendarWeek = useCallback(async (weekStart) => {
    setCalendarWeekStart(weekStart);
    setCalendarLoading(true);
    setCalendarError(null);
    setCalendarSelectedDay(null);

    try {
      // Fetch existing calendar data
      const existing = await db.fetchWeekCalendar(weekStart);
      if (existing.length > 0) {
        setCalendarDays(existing);
        setCalendarLoading(false);
        return;
      }

      // Auto-generate for the week
      const weekEnd = db.getWeekEnd(weekStart);
      const city = profile.location?.city;
      let forecasts = null;
      if (city) {
        forecasts = await fetchForecastForTrip(city, weekStart, weekEnd);
      }
      setCalendarForecast(forecasts);

      const forecastPayload = forecasts ? forecasts.map((f, i) => ({
        dayIndex: i,
        tempMax: f.tempMax,
        tempMin: f.tempMin,
        weatherCode: f.weatherCode,
      })) : [];

      const result = await generateWeeklyOutfits({
        wardrobeItems: wardrobeFlat,
        profile,
        forecasts: forecastPayload,
        lockedOutfits: [],
      });

      // Save to DB
      const saved = await db.saveWeeklyOutfits({
        weekStart,
        outfits: result.outfits || [],
        wardrobeItems: wardrobeFlat,
      });

      // Re-fetch to get full outfit data with items
      const days = await db.fetchWeekCalendar(weekStart);
      setCalendarDays(days);
    } catch (err) {
      console.error("Failed to load calendar:", err);
      setCalendarError(err.message || "Failed to generate outfits");
    } finally {
      setCalendarLoading(false);
    }
  }, [wardrobeFlat, profile]);

  const handleOpenCalendar = useCallback(() => {
    const weekStart = db.getWeekStart();
    setView("calendar");
    loadCalendarWeek(weekStart);
  }, [loadCalendarWeek]);

  const handleCalendarWeekNav = useCallback((direction) => {
    const newWeek = db.shiftWeek(calendarWeekStart, direction);
    loadCalendarWeek(newWeek);
  }, [calendarWeekStart, loadCalendarWeek]);

  const handleCalendarRegenerate = useCallback(async () => {
    if (!calendarWeekStart) return;
    setCalendarLoading(true);
    setCalendarError(null);

    try {
      const lockedOutfits = calendarDays
        .filter(d => d.locked && d.outfit)
        .map(d => ({
          dayIndex: d.dayIndex,
          vibe: d.outfit.vibe,
          items: (d.outfit.items || []).map(i => i.name),
        }));

      const weekEnd = db.getWeekEnd(calendarWeekStart);
      const city = profile.location?.city;
      let forecasts = calendarForecast;
      if (!forecasts && city) {
        forecasts = await fetchForecastForTrip(city, calendarWeekStart, weekEnd);
        setCalendarForecast(forecasts);
      }

      const forecastPayload = forecasts ? forecasts.map((f, i) => ({
        dayIndex: i,
        tempMax: f.tempMax,
        tempMin: f.tempMin,
        weatherCode: f.weatherCode,
      })) : [];

      const result = await generateWeeklyOutfits({
        wardrobeItems: wardrobeFlat,
        profile,
        forecasts: forecastPayload,
        lockedOutfits,
      });

      // Save new outfits (only unlocked days)
      await db.saveWeeklyOutfits({
        weekStart: calendarWeekStart,
        outfits: result.outfits || [],
        wardrobeItems: wardrobeFlat,
      });

      const days = await db.fetchWeekCalendar(calendarWeekStart);
      setCalendarDays(days);
    } catch (err) {
      console.error("Failed to regenerate calendar:", err);
      setCalendarError(err.message || "Failed to regenerate outfits");
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarWeekStart, calendarDays, calendarForecast, wardrobeFlat, profile]);

  const handleToggleDayLock = useCallback(async (dayIndex) => {
    const day = calendarDays.find(d => d.dayIndex === dayIndex);
    if (!day) return;
    const newLocked = !day.locked;
    setCalendarDays(prev => prev.map(d => d.dayIndex === dayIndex ? { ...d, locked: newLocked } : d));
    try {
      await db.toggleCalendarDayLock(calendarWeekStart, dayIndex, newLocked);
    } catch (err) {
      console.error("Failed to toggle lock:", err);
      setCalendarDays(prev => prev.map(d => d.dayIndex === dayIndex ? { ...d, locked: !newLocked } : d));
    }
  }, [calendarDays, calendarWeekStart]);

  const handleGenerateStyleDna = useCallback(async () => {
    if (wardrobeFlat.length === 0) {
      setStyleDnaError("Add some items to your wardrobe first.");
      return;
    }
    setStyleDnaLoading(true);
    setStyleDnaError(null);
    try {
      const outfitHistory = await db.fetchOutfitHistory();
      const report = await generateStyleDna({
        wardrobeItems: wardrobeFlat,
        profile,
        outfitHistory,
      });
      setStyleDnaReport(report);
      track('style_dna_generated', { wardrobe_size: wardrobeFlat.length });
    } catch (err) {
      console.error("Failed to generate Style DNA:", err);
      setStyleDnaError(err.message || "Failed to generate report");
    } finally {
      setStyleDnaLoading(false);
    }
  }, [wardrobeFlat, profile]);

  const handleStyleQuizComplete = useCallback((quizResult) => {
    setProfile(prev => ({
      ...prev,
      styleQuiz: quizResult,
      style: {
        ...prev.style,
        preferredStyles: quizResult.derivedStyles.length > 0
          ? quizResult.derivedStyles
          : prev.style.preferredStyles,
        colorPreferences: quizResult.derivedColors.length > 0
          ? quizResult.derivedColors
          : prev.style.colorPreferences,
      },
      lastUpdated: new Date().toISOString(),
    }));
    setShowStyleQuiz(false);
    track('style_quiz_completed', {
      primaryArchetype: quizResult.primaryArchetype,
      secondaryArchetype: quizResult.secondaryArchetype,
    });
  }, []);

  const handleStyleQuizSkip = useCallback(() => {
    setShowStyleQuiz(false);
    track('style_quiz_skipped');
  }, []);

  const navigateToGarment = useCallback((item) => {
    setLightboxItem(item);
    setGarmentPreviousView(view);
    setView("garment");
  }, [view]);

  const handleGarmentBack = useCallback(() => {
    setView(garmentPreviousView ?? "wardrobe");
    setLightboxItem(null);
    setGarmentPreviousView(null);
  }, [garmentPreviousView]);

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
      {addItemModalOpen && (
        <AddItemModal
          onClose={() => setAddItemModalOpen(false)}
          onAdd={handleAddItem}
          onBulkAdd={handleBulkAddItems}
        />
      )}
      {showNewTripSheet && (
        <TripFormSheet
          onClose={() => setShowNewTripSheet(false)}
          onSave={async (fields) => {
            const trip = await db.createTripPlan(fields);
            handleCreateTrip(trip);
          }}
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
        onOpenCalendar={() => { handleOpenCalendar(); setSidePanelOpen(false); }}
        onOpenTrips={() => { setView("trips"); setSidePanelOpen(false); }}
        onOpenStyleDna={() => { setView("style-dna"); setSidePanelOpen(false); }}
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
            onClick={
              view === "garment" ? handleGarmentBack
              : view === "calendar-detail" ? () => { setCalendarSelectedDay(null); setView("calendar"); }
              : view === "trip-detail" ? () => setView("trips")
              : view === "trip-summary" ? () => setView("trip-detail")
              : view === "style-quiz" ? () => setView("profile")
              : () => setSidePanelOpen(true)
            }
            aria-label={view === "garment" || view === "calendar-detail" || view === "trip-detail" || view === "trip-summary" || view === "style-quiz" ? "Go back" : "Open menu"}
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
            {(view === "garment" || view === "calendar-detail" || view === "trip-detail" || view === "trip-summary" || view === "style-quiz") ? (
              <span style={{ fontSize: 22, lineHeight: 1, color: "#1A1A1A" }}>←</span>
            ) : (
              <>
                <span style={{ display: "block", width: 20, height: 2, background: "#1A1A1A", borderRadius: 1 }} />
                <span style={{ display: "block", width: 20, height: 2, background: "#1A1A1A", borderRadius: 1 }} />
                <span style={{ display: "block", width: 14, height: 2, background: "#1A1A1A", borderRadius: 1 }} />
              </>
            )}
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
            {view === "garment" ? (lightboxItem?.name ?? "Item") : view === "wardrobe" ? "My Wardrobe" : view === "saved" ? "Saved Outfits" : view === "outfit" ? "Your Outfit" : view === "profile" ? "My Profile" : view === "calendar" ? "Weekly Calendar" : view === "calendar-detail" ? "Day Detail" : view === "trips" ? "Trips" : view === "trip-detail" ? (activeTrip?.title ?? "Trip") : view === "trip-summary" ? "Packing List" : view === "style-dna" ? "Style DNA" : view === "style-quiz" ? "Style Quiz" : "Chat"}
          </h1>

          {view === "trips" && (
            <button
              onClick={() => setShowNewTripSheet(true)}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#1A1A1A', color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >+</button>
          )}

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

          {view !== "wardrobe" && view !== "profile" && view !== "saved" && view !== "garment" && view !== "trips" && view !== "trip-detail" && view !== "trip-summary" && view !== "calendar" && view !== "calendar-detail" && view !== "style-dna" && view !== "style-quiz" && (
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
          <div className="outfit-name-chips" style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            marginBottom: "var(--space-dots-mb)",
            WebkitOverflowScrolling: "touch",
          }}>
            {outfits.map((o, i) => (
              <button
                key={i}
                ref={(el) => el && i === current && el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })}
                onClick={() => setCurrent(i)}
                style={{
                  flexShrink: 0,
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: current === i ? "1px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)",
                  background: "transparent",
                  color: current === i ? "#1A1A1A" : "#999",
                  fontWeight: current === i ? 600 : 400,
                  fontSize: "var(--font-item-name)",
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {o.vibe}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      {view === "garment" ? (
        lightboxItem && (
          <GarmentDetailPage
            item={lightboxItem}
            onDelete={handleDeleteWardrobeItem}
            onEdit={handleUpdateWardrobeItem}
            onEnhance={handleEnhanceWardrobeItemImage}
            onSaveNotes={handleUpdateWardrobeItemNotes}
            onStyleItem={() => {
              setLightboxItem(null);
              setGarmentPreviousView(null);
              setView("chat");
              handleSendMessage(`How should I style my ${lightboxItem.name}?`);
            }}
            isEnhancing={enhancingItems.has(lightboxItem.id)}
          />
        )
      ) : view === "wardrobe" ? (
        <WardrobeView
          wardrobeItems={wardrobeItems}
          onItemClick={navigateToGarment}
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
                    onItemClick={navigateToGarment}
                    hasReferencePhoto={!!profile.referencePhoto}
                    vizStatus={vizGenerations[outfit.id]?.status}
                    onVisualizeClick={handleVisualizeOutfit}
                    onViewVisualization={(outfitId) => setVizModalOutfitId(outfitId)}
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
          onItemClick={navigateToGarment}
          onToggleSaved={handleToggleOutfitSaved}
          vizGenerations={vizGenerations}
          hasReferencePhoto={!!profile.referencePhoto}
          onVisualizeClick={handleVisualizeOutfit}
          onViewVisualization={(outfitId) => setVizModalOutfitId(outfitId)}
        />
      ) : view === "calendar" ? (
        <WeeklyCalendarView
          weekStart={calendarWeekStart}
          days={calendarDays}
          forecast={calendarForecast}
          loading={calendarLoading}
          error={calendarError}
          onWeekNav={handleCalendarWeekNav}
          onRegenerate={handleCalendarRegenerate}
          onToggleLock={handleToggleDayLock}
          onSelectDay={(dayIndex) => { setCalendarSelectedDay(dayIndex); setView("calendar-detail"); }}
          onItemClick={navigateToGarment}
        />
      ) : view === "calendar-detail" && calendarSelectedDay !== null ? (
        <CalendarDayDetailView
          day={calendarDays.find(d => d.dayIndex === calendarSelectedDay)}
          weekStart={calendarWeekStart}
          forecast={calendarForecast}
          onItemClick={navigateToGarment}
        />
      ) : view === "trips" ? (
        <TripsListView
          tripPlans={tripPlans}
          slotCounts={tripSlotCounts}
          onOpenTrip={handleOpenTrip}
          onDeleteTrip={handleDeleteTrip}
          onNewTrip={() => setShowNewTripSheet(true)}
        />
      ) : view === "trip-detail" && activeTrip ? (
        <TripDetailView
          trip={activeTrip}
          savedOutfits={savedOutfits}
          vizGenerations={vizGenerations}
          hasReferencePhoto={!!profile.referencePhoto}
          onVisualizeClick={handleVisualizeOutfit}
          onViewVisualization={(outfitId) => setVizModalOutfitId(outfitId)}
          onItemClick={navigateToGarment}
          onOpenSummary={() => setView("trip-summary")}
          onEditTrip={handleEditTrip}
        />
      ) : view === "trip-summary" && activeTrip ? (
        <TripSummaryView
          trip={activeTrip}
          onBack={() => setView("trip-detail")}
        />
      ) : view === "style-dna" ? (
        <StyleDnaView
          report={styleDnaReport}
          loading={styleDnaLoading}
          error={styleDnaError}
          onRegenerate={handleGenerateStyleDna}
        />
      ) : view === "style-quiz" ? (
        <StyleQuiz
          onComplete={handleStyleQuizComplete}
          onSkip={() => setView("profile")}
          isOnboarding={false}
        />
      ) : view === "profile" ? (
        <ProfileView
          profile={profile}
          onSave={setProfile}
          focusLocation={focusLocation}
          onClearFocusLocation={() => setFocusLocation(false)}
          onOpenStyleQuiz={() => setView("style-quiz")}
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
          hasOutfits={outfits.length > 0}
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

      {/* Onboarding Style Quiz Overlay */}
      {showStyleQuiz && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "#FAFAF8",
          zIndex: 10000,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Onboarding header */}
          <div style={{
            padding: `calc(var(--space-top-bar) + var(--safe-top)) var(--container-padding-x) 0`,
            flexShrink: 0,
          }}>
            <h1 style={{
              fontSize: "var(--font-title)",
              fontWeight: 400,
              color: "#1A1A1A",
              margin: 0,
              fontFamily: "'Instrument Serif', serif",
              lineHeight: 1.1,
            }}>
              Style Quiz
            </h1>
          </div>
          <StyleQuiz
            onComplete={handleStyleQuizComplete}
            onSkip={handleStyleQuizSkip}
            isOnboarding={true}
          />
        </div>
      )}

    </div>
  );
}
