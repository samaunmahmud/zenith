/** Zenith mark: a rising line reaching its peak, on a green tile. Original artwork (not an NVIDIA mark). */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="zenith-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fd400" />
          <stop offset="1" stopColor="#4a7a00" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="32" height="32" rx="9" fill="url(#zenith-tile)" />
      <path d="M7.5 22.5 L13 16 L17.5 19.5 L24.5 10" fill="none" stroke="#081000" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24.5" cy="10" r="2.6" fill="#081000" />
    </svg>
  );
}
