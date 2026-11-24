/**
 * Brings `child` into view inside its nearest scrollable ancestor only, like
 * `scrollIntoView({ block: "nearest" })` but without scrolling the page or any
 * other ancestor. RESPONSIVE §7 rule 12: on a phone, where a move list sits
 * below the board, `scrollIntoView` jumps the whole page on every move (FE
 * review U1).
 */
export function scrollWithinNearest(child: HTMLElement | null | undefined): void {
  if (!child) return;
  let box = child.parentElement;
  while (box) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === "auto" || overflowY === "scroll") && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box) return;
  const boxRect = box.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  if (childRect.top < boxRect.top) {
    box.scrollTop -= boxRect.top - childRect.top;
  } else if (childRect.bottom > boxRect.bottom) {
    box.scrollTop += childRect.bottom - boxRect.bottom;
  }
}
