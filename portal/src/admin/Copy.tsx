import { useState } from "react";

export function Secret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret">
      <code>{value}</code>
      <button type="button" className="btn-sm" onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}
