import { describe, it, expect } from 'vitest';

// Pure logic extracted from the navigation callbacks in OutfitRecommendations.
// These mirror the exact state transitions performed by navigateToGarment,
// handleGarmentBack, and the GarmentDetailPage prop guards.

function navigateToGarment(item, currentView) {
  return {
    lightboxItem: item,
    garmentPreviousView: currentView,
    view: "garment",
  };
}

function handleGarmentBack(garmentPreviousView) {
  return {
    view: garmentPreviousView ?? "wardrobe",
    lightboxItem: null,
    garmentPreviousView: null,
  };
}

function garmentPageProps(garmentPreviousView, handlers) {
  return {
    onDelete: handlers.handleDeleteWardrobeItem,
    onEdit: handlers.handleUpdateWardrobeItem,
    onEnhance: handlers.handleEnhanceWardrobeItemImage,
    onSaveNotes: handlers.handleUpdateWardrobeItemNotes,
    onStyleItem: handlers.handleStyleItem,
  };
}

function styleItemAction(itemName) {
  return {
    lightboxItem: null,
    garmentPreviousView: null,
    view: "chat",
    message: `How should I style my ${itemName}?`,
  };
}

function deleteWardrobeItem(garmentPreviousView) {
  return {
    lightboxItem: null,
    view: garmentPreviousView ?? "wardrobe",
    garmentPreviousView: null,
  };
}

const mockItem = { id: "item-1", name: "Brown Shirt", category: "Tops", label: "Top" };
const mockHandlers = {
  handleDeleteWardrobeItem: () => {},
  handleUpdateWardrobeItem: () => {},
  handleEnhanceWardrobeItemImage: () => {},
  handleUpdateWardrobeItemNotes: () => {},
  handleStyleItem: () => {},
};

describe("navigateToGarment", () => {
  it("sets view to garment and captures the previous view", () => {
    const result = navigateToGarment(mockItem, "wardrobe");
    expect(result.view).toBe("garment");
    expect(result.garmentPreviousView).toBe("wardrobe");
    expect(result.lightboxItem).toBe(mockItem);
  });

  it("captures outfit as the previous view", () => {
    const result = navigateToGarment(mockItem, "outfit");
    expect(result.garmentPreviousView).toBe("outfit");
    expect(result.view).toBe("garment");
  });

  it("captures saved as the previous view", () => {
    const result = navigateToGarment(mockItem, "saved");
    expect(result.garmentPreviousView).toBe("saved");
  });
});

describe("handleGarmentBack", () => {
  it("restores wardrobe as the previous view", () => {
    const result = handleGarmentBack("wardrobe");
    expect(result.view).toBe("wardrobe");
    expect(result.lightboxItem).toBeNull();
    expect(result.garmentPreviousView).toBeNull();
  });

  it("restores outfit as the previous view", () => {
    const result = handleGarmentBack("outfit");
    expect(result.view).toBe("outfit");
  });

  it("restores saved as the previous view", () => {
    const result = handleGarmentBack("saved");
    expect(result.view).toBe("saved");
  });

  it("defaults to wardrobe when garmentPreviousView is null", () => {
    const result = handleGarmentBack(null);
    expect(result.view).toBe("wardrobe");
  });

  it("clears lightboxItem after navigation", () => {
    const result = handleGarmentBack("wardrobe");
    expect(result.lightboxItem).toBeNull();
  });

  it("clears garmentPreviousView after navigation", () => {
    const result = handleGarmentBack("outfit");
    expect(result.garmentPreviousView).toBeNull();
  });
});

describe("GarmentDetailPage prop guards", () => {
  it("passes edit/delete/enhance handlers when opened from wardrobe", () => {
    const props = garmentPageProps("wardrobe", mockHandlers);
    expect(props.onDelete).toBe(mockHandlers.handleDeleteWardrobeItem);
    expect(props.onEdit).toBe(mockHandlers.handleUpdateWardrobeItem);
    expect(props.onEnhance).toBe(mockHandlers.handleEnhanceWardrobeItemImage);
  });

  it("passes edit/delete/enhance when opened from outfit view", () => {
    const props = garmentPageProps("outfit", mockHandlers);
    expect(props.onDelete).toBe(mockHandlers.handleDeleteWardrobeItem);
    expect(props.onEdit).toBe(mockHandlers.handleUpdateWardrobeItem);
    expect(props.onEnhance).toBe(mockHandlers.handleEnhanceWardrobeItemImage);
  });

  it("passes edit/delete/enhance when opened from saved view", () => {
    const props = garmentPageProps("saved", mockHandlers);
    expect(props.onDelete).toBe(mockHandlers.handleDeleteWardrobeItem);
    expect(props.onEdit).toBe(mockHandlers.handleUpdateWardrobeItem);
    expect(props.onEnhance).toBe(mockHandlers.handleEnhanceWardrobeItemImage);
  });

  it("always passes onStyleItem regardless of origin", () => {
    expect(garmentPageProps("wardrobe", mockHandlers).onStyleItem).toBe(mockHandlers.handleStyleItem);
    expect(garmentPageProps("outfit", mockHandlers).onStyleItem).toBe(mockHandlers.handleStyleItem);
    expect(garmentPageProps("saved", mockHandlers).onStyleItem).toBe(mockHandlers.handleStyleItem);
  });

  it("always passes onSaveNotes regardless of origin", () => {
    expect(garmentPageProps("wardrobe", mockHandlers).onSaveNotes).toBe(mockHandlers.handleUpdateWardrobeItemNotes);
    expect(garmentPageProps("outfit", mockHandlers).onSaveNotes).toBe(mockHandlers.handleUpdateWardrobeItemNotes);
    expect(garmentPageProps("saved", mockHandlers).onSaveNotes).toBe(mockHandlers.handleUpdateWardrobeItemNotes);
  });
});

describe("Style Item action", () => {
  it("clears garment state and navigates to chat", () => {
    const result = styleItemAction("Brown Shirt");
    expect(result.view).toBe("chat");
    expect(result.lightboxItem).toBeNull();
    expect(result.garmentPreviousView).toBeNull();
    expect(result.message).toBe("How should I style my Brown Shirt?");
  });
});

describe("delete wardrobe item navigation", () => {
  it("navigates back to the previous view after delete", () => {
    const result = deleteWardrobeItem("wardrobe");
    expect(result.view).toBe("wardrobe");
    expect(result.lightboxItem).toBeNull();
    expect(result.garmentPreviousView).toBeNull();
  });

  it("defaults to wardrobe if garmentPreviousView is null", () => {
    const result = deleteWardrobeItem(null);
    expect(result.view).toBe("wardrobe");
  });
});
