/** Zenith mark: a rising line reaching its peak. Original artwork (not an NVIDIA mark). */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#111416" stroke="#2f373c" strokeWidth="1.5" />
      <path d="M7 23 L13 15.5 L18 19 L25 9" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="9" r="2.6" fill="var(--accent)" />
    </svg>
  );
}
