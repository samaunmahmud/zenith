/** Zenith mark: a rising line reaching its peak, in green. Original artwork (not an NVIDIA mark). */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" fill="none" stroke="var(--green)" strokeWidth="2" />
      <path d="M6 24 L13 15 L18 19 L26 7" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <rect x="23.5" y="4.5" width="5" height="5" fill="var(--green)" />
    </svg>
  );
}
