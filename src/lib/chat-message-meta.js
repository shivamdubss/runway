export const OUTFIT_NAV_CTA = Object.freeze({
  label: 'View Outfits',
  action: 'navigate_outfits',
});

function toOutfitNavCta(cta) {
  if (cta?.action !== OUTFIT_NAV_CTA.action) return null;
  return { ...OUTFIT_NAV_CTA };
}

export function buildAssistantMessageMetadata({ outfits }) {
  if (Array.isArray(outfits) && outfits.length > 0) {
    const outfitSummary = outfits.map((o, i) => ({
      number: i + 1,
      vibe: o.vibe || `Look ${i + 1}`,
      items: (o.items || []).map(item => typeof item === 'string' ? item : item?.name).filter(Boolean),
    }));
    return { cta: { ...OUTFIT_NAV_CTA }, outfitSummary };
  }
  return {};
}

export function toChatUiMessage(dbMessage) {
  const cta = toOutfitNavCta(dbMessage?.metadata?.cta);
  const outfitSummary = dbMessage?.metadata?.outfitSummary || null;
  return {
    id: dbMessage.id,
    role: dbMessage.role,
    text: dbMessage.content,
    image: dbMessage.image_url || null,
    ...(cta ? { cta } : {}),
    ...(outfitSummary ? { outfitSummary } : {}),
  };
}

export function appendLegacyOutfitsCtaMessage({ chatId, messages, outfits }) {
  if (!chatId || !Array.isArray(outfits) || outfits.length === 0) {
    return messages;
  }

  const hasOutfitNavCta = messages.some(
    (message) => message.cta?.action === OUTFIT_NAV_CTA.action
  );
  if (hasOutfitNavCta) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `legacy-outfits-cta-${chatId}`,
      role: 'assistant',
      text: '',
      cta: { ...OUTFIT_NAV_CTA },
    },
  ];
}
