import { settingsStore } from "./stores/settings.svelte";
import { runShortcutAction } from "./shortcuts";

// IntelliJ's "Shift Shift" gesture for Search Everywhere, ported from the
// real app's own state machine (app/src/double_tap.rs): two clean taps of
// Shift alone — nothing else pressed while it was held, and not combined
// with Ctrl/Alt/Cmd — within DOUBLE_TAP_WINDOW_MS of each other. The
// browser has no single "modifiers changed" event like egui's
// ModifiersChanged, so this is driven by plain keydown/keyup instead, with
// the same "any other key or pointer press marks the current tap dirty"
// rule.
const DOUBLE_TAP_WINDOW_MS = 350;

let shiftDown = false;
let dirty = false;
let lastTapAt: number | null = null;

function markDirty() {
  dirty = true;
  lastTapAt = null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === "Shift") {
    if (!shiftDown) {
      shiftDown = true;
      dirty = e.ctrlKey || e.altKey || e.metaKey;
    }
    return;
  }
  markDirty();
}

function onKeyUp(e: KeyboardEvent) {
  if (e.key !== "Shift" || !shiftDown) return;
  shiftDown = false;
  const clean = !dirty;
  dirty = false;
  if (!clean) {
    lastTapAt = null;
    return;
  }
  const now = performance.now();
  if (lastTapAt !== null && now - lastTapAt <= DOUBLE_TAP_WINDOW_MS) {
    lastTapAt = null;
    trigger();
  } else {
    lastTapAt = now;
  }
}

function onPointerDown() {
  markDirty();
}

function trigger() {
  if (settingsStore.value.double_shift_search_disabled) return;
  // Some other modal (including Search Everywhere itself) already open —
  // same "don't fire mid-gesture-elsewhere" guard the real app's own
  // `ctx.memory(|m| m.top_modal_layer()).is_none()` check makes. Every
  // dialog in this port renders with role="dialog".
  if (document.querySelector('[role="dialog"]')) return;
  runShortcutAction("search_everywhere");
}

/** Installs the window-level listeners. Returns a cleanup function. */
export function installDoubleTapShift(): () => void {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onPointerDown);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointerdown", onPointerDown);
    shiftDown = false;
    dirty = false;
    lastTapAt = null;
  };
}
