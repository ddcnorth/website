/** The ddcnorth six-dot symbol with the wordmark set in text. */
export function Brand({ suffix }: { suffix?: string }) {
  return (
    <a className="brand" href="/">
      <svg className="brand-mark" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
        <g fill="currentColor">
          <circle cx="40" cy="40" r="40" /><circle cx="128" cy="40" r="40" /><circle cx="216" cy="40" r="40" />
          <circle cx="128" cy="128" r="40" /><circle cx="216" cy="128" r="40" /><circle cx="216" cy="216" r="40" />
        </g>
      </svg>
      <span className="brand-word">ddcnorth</span>
      {suffix ? <span className="brand-suffix">{suffix}</span> : null}
    </a>
  );
}
