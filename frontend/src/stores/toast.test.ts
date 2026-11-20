import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notImplemented, showToast, toast } from "./toast.svelte";

describe("toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sets the message immediately and clears it after the duration", () => {
    showToast("Saved", 1000);
    expect(toast.message).toBe("Saved");

    vi.advanceTimersByTime(999);
    expect(toast.message).toBe("Saved");

    vi.advanceTimersByTime(1);
    expect(toast.message).toBeNull();
  });

  it("restarts the clear timer when a new toast arrives before the old one clears", () => {
    showToast("First", 1000);
    vi.advanceTimersByTime(900);
    showToast("Second", 1000);

    // The first toast's timer must not fire and clear the second message.
    vi.advanceTimersByTime(100);
    expect(toast.message).toBe("Second");

    vi.advanceTimersByTime(900);
    expect(toast.message).toBeNull();
  });

  it("notImplemented labels the toast with a standard suffix", () => {
    notImplemented("Export EPUB");
    expect(toast.message).toBe("Export EPUB: not implemented yet");
  });
});
