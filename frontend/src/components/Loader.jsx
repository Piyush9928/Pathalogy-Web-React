/**
 * The app's loading indicator: the animated hospital (public/hospital-loader.svg).
 *   <Loader />            - block inside a page / panel
 *   <Loader compact />    - smaller, for table bodies and small panels
 *   <Loader fullPage />   - whole screen (app start, route chunks, session check)
 * Announced to screen readers as a polite status; with "reduce motion" on, the animation is replaced by the text.
 */
export default function Loader({ fullPage = false, compact = false, label = 'Loading...' }) {
  const size = fullPage ? 'loader-lg' : compact ? 'loader-sm' : 'loader-md';
  return (
    <div className={`lsp-loader ${size}${fullPage ? ' loader-full' : ''}`} role="status" aria-live="polite">
      <img className="loader-img" src="/hospital-loader.svg" alt="" draggable="false" />
      <span className="loader-label">{label}</span>
    </div>
  );
}
