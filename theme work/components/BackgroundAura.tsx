/** Slow-drifting gold/violet light plus a whisper of chequerboard. Transform-only animation. */
export function BackgroundAura() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -right-48 -top-48 h-[640px] w-[640px] animate-drift-a rounded-full opacity-70 blur-3xl will-change-transform"
        style={{ background: 'radial-gradient(circle, rgb(var(--c-gold) / 0.34), transparent 68%)' }}
      />
      <div
        className="absolute -bottom-56 -left-40 h-[720px] w-[720px] animate-drift-b rounded-full opacity-80 blur-3xl will-change-transform"
        style={{ background: 'radial-gradient(circle, rgb(var(--c-sand) / 0.9), transparent 70%)' }}
      />
      <div
        className="absolute inset-0 opacity-[0.045]"
        style={{
          background: 'repeating-conic-gradient(rgb(var(--c-ink)) 0% 25%, transparent 0% 50%) 0 0 / 112px 112px',
          maskImage: 'radial-gradient(ellipse 70% 55% at 72% 28%, #000, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 72% 28%, #000, transparent 72%)',
        }}
      />
    </div>
  )
}
