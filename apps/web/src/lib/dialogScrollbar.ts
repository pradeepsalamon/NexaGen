/**
 * A dialog panel that scrolls as a whole (tall forms) loses its scrollbar's width from its right
 * padding, so its fields sit off-centre (more room on the right). While the panel shows a bar,
 * this trims the right padding by the bar's width; when the bar goes, the padding comes back.
 * Panels that never scroll, or that pass their own padding of less than the bar, are untouched.
 * Inner scroll areas use the `dialog-scroll-body` class instead (globals.css).
 */

const tracked = new WeakMap<HTMLElement, () => void>();

export function trackDialogScrollbar(node: HTMLElement) {
  if (tracked.has(node) || typeof ResizeObserver === "undefined") return;
  // The class padding, not a trim left from an earlier attach of the same panel (React re-attaches
  // refs, e.g. Strict Mode in development).
  node.style.paddingRight = "";
  const basePadding = parseFloat(getComputedStyle(node).paddingRight) || 0;

  const update = () => {
    const style = getComputedStyle(node);
    const borders = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
    const bar = node.offsetWidth - node.clientWidth - borders;
    const trimmed = bar > 0 && basePadding > bar ? `${basePadding - bar}px` : "";
    if (node.style.paddingRight !== trimmed) node.style.paddingRight = trimmed;
  };

  // The panel's own size is capped (max-height), so watch what is inside it as well: content that
  // grows (data arriving, a field error) is what brings the bar.
  const observer = new ResizeObserver(update);
  observer.observe(node);
  Array.from(node.children).forEach((child) => observer.observe(child));
  const mutations = new MutationObserver(() => {
    Array.from(node.children).forEach((child) => observer.observe(child));
    update();
  });
  mutations.observe(node, { childList: true });
  update();

  tracked.set(node, () => {
    observer.disconnect();
    mutations.disconnect();
  });
}

export function untrackDialogScrollbar(node: HTMLElement) {
  tracked.get(node)?.();
  tracked.delete(node);
  node.style.paddingRight = "";
}
