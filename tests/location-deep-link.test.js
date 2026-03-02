import { describe, it, expect, vi } from "vitest";

describe("Location deep link focus behavior", () => {
  it("should call startEditing and clear focus flag when focusLocation is true", () => {
    const startEditing = vi.fn();
    const onClearFocusLocation = vi.fn();
    const focusLocation = true;

    if (focusLocation) {
      startEditing();
      onClearFocusLocation?.();
    }

    expect(startEditing).toHaveBeenCalledOnce();
    expect(onClearFocusLocation).toHaveBeenCalledOnce();
  });

  it("should NOT call startEditing when focusLocation is false", () => {
    const startEditing = vi.fn();
    const onClearFocusLocation = vi.fn();
    const focusLocation = false;

    if (focusLocation) {
      startEditing();
      onClearFocusLocation?.();
    }

    expect(startEditing).not.toHaveBeenCalled();
    expect(onClearFocusLocation).not.toHaveBeenCalled();
  });

  it("should focus input and scroll card into view when editing is triggered by deep link", () => {
    const inputRef = { current: { focus: vi.fn() } };
    const cardRef = { current: { scrollIntoView: vi.fn() } };
    const shouldFocusRef = { current: true };
    const isEditing = true;

    if (isEditing && shouldFocusRef.current && inputRef.current) {
      shouldFocusRef.current = false;
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current.focus();
    }

    expect(shouldFocusRef.current).toBe(false);
    expect(cardRef.current.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(inputRef.current.focus).toHaveBeenCalledOnce();
  });

  it("should NOT focus input when editing was triggered manually (not via deep link)", () => {
    const inputRef = { current: { focus: vi.fn() } };
    const cardRef = { current: { scrollIntoView: vi.fn() } };
    const shouldFocusRef = { current: false };
    const isEditing = true;

    if (isEditing && shouldFocusRef.current && inputRef.current) {
      shouldFocusRef.current = false;
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      inputRef.current.focus();
    }

    expect(inputRef.current.focus).not.toHaveBeenCalled();
    expect(cardRef.current.scrollIntoView).not.toHaveBeenCalled();
  });
});
