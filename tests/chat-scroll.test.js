import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the ChatView scroll logic extracted from the useEffect in
 * src/outfit-recommendations.jsx. We recreate the ref objects and run
 * the same conditional branch that the effect body uses.
 */

function runScrollEffect(container, isInitialMount) {
  if (!container) return;
  container.scrollTo({
    top: container.scrollHeight,
    behavior: isInitialMount.current ? "instant" : "smooth",
  });
  isInitialMount.current = false;
}

describe("Chat scroll behavior", () => {
  it("scrolls instantly to bottom on initial mount", () => {
    const container = { scrollHeight: 2000, scrollTo: vi.fn() };
    const isInitialMount = { current: true };

    runScrollEffect(container, isInitialMount);

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 2000,
      behavior: "instant",
    });
    expect(isInitialMount.current).toBe(false);
  });

  it("scrolls smoothly for subsequent message updates", () => {
    const container = { scrollHeight: 3000, scrollTo: vi.fn() };
    const isInitialMount = { current: false };

    runScrollEffect(container, isInitialMount);

    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 3000,
      behavior: "smooth",
    });
  });

  it("does nothing when container ref is null", () => {
    const isInitialMount = { current: true };

    runScrollEffect(null, isInitialMount);

    // isInitialMount should remain unchanged since we returned early
    expect(isInitialMount.current).toBe(true);
  });

  it("flips isInitialMount to false after first scroll then uses smooth", () => {
    const container = { scrollHeight: 500, scrollTo: vi.fn() };
    const isInitialMount = { current: true };

    // First call — mount
    runScrollEffect(container, isInitialMount);
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 500,
      behavior: "instant",
    });
    expect(isInitialMount.current).toBe(false);

    // Second call — new message
    container.scrollHeight = 800;
    container.scrollTo.mockClear();
    runScrollEffect(container, isInitialMount);
    expect(container.scrollTo).toHaveBeenCalledWith({
      top: 800,
      behavior: "smooth",
    });
  });
});
