/** Normalised (-1..1) pointer position shared with the 3D scene — no React state, no re-renders. */
export const pointer = { x: 0, y: 0 }

let started = false
export function startPointerTracking() {
  if (started) return
  started = true
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    },
    { passive: true },
  )
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.x = 0
    pointer.y = 0
  })
}
