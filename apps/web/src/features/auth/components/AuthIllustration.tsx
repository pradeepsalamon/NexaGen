export function AuthIllustration() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto grid min-h-48 w-full max-w-80 items-center justify-items-center lg:min-h-56"
    >
      <div className="grid aspect-square w-[min(58vw,230px)] rotate-[-8deg] grid-cols-4 overflow-hidden rounded-panel border border-[color-mix(in_srgb,var(--color-primary)_24%,var(--color-border))] shadow-soft">
        {Array.from({ length: 16 }).map((_, index) => (
          <span
            className={
              index % 2 === 0
                ? "bg-[color-mix(in_srgb,var(--color-primary)_18%,var(--color-surface))]"
                : "bg-[color-mix(in_srgb,var(--color-secondary)_24%,var(--color-surface))]"
            }
            key={index}
          />
        ))}
      </div>
      <div className="absolute grid translate-y-1 items-center justify-items-center">
        <span className="block size-12 rounded-full bg-[linear-gradient(145deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_62%,black))] shadow-[0_18px_32px_color-mix(in_srgb,var(--color-primary)_28%,transparent)]" />
        <span className="-mt-1.5 block h-14 w-9 rounded-app bg-[linear-gradient(145deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_62%,black))] shadow-[0_18px_32px_color-mix(in_srgb,var(--color-primary)_28%,transparent)]" />
        <span className="-mt-1.5 block h-16 w-24 rounded-t-[34px] rounded-b-app bg-[linear-gradient(145deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_62%,black))] shadow-[0_18px_32px_color-mix(in_srgb,var(--color-primary)_28%,transparent)]" />
        <span className="-mt-1 block h-7 w-36 rounded-app bg-[linear-gradient(145deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_62%,black))] shadow-[0_18px_32px_color-mix(in_srgb,var(--color-primary)_28%,transparent)]" />
      </div>
    </div>
  );
}
