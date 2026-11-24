/**
 * Keyboard or pointer, whichever was used last, on `<html data-input>`.
 *
 * Browsers draw `:focus-visible` rings after some pointer actions too: a tab clicked (Radix moves
 * focus itself), a dialog focusing its first button as it opens. globals.css hides the ring on
 * buttons, tabs and menu items while `data-input="pointer"`; a key press brings it straight back,
 * so keyboard users always see where they are. Text fields keep their focus style either way.
 */

if (typeof window !== "undefined") {
  const root = document.documentElement;
  const set = (mode: "keyboard" | "pointer") => {
    if (root.dataset.input !== mode) root.dataset.input = mode;
  };
  window.addEventListener("pointerdown", () => set("pointer"), { capture: true, passive: true });
  window.addEventListener(
    "keydown",
    (event) => {
      // A modifier alone (e.g. Ctrl before a click) is not keyboard navigation.
      if (["Alt", "Control", "Meta", "Shift"].includes(event.key)) return;
      set("keyboard");
    },
    { capture: true, passive: true }
  );
}

export {};
