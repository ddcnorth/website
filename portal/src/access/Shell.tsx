import type { ReactNode } from "react";
import { Brand } from "../Brand";

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL || "Fryderyk@ddcnorth.com";

export function AccessShell({ children }: { children: ReactNode }) {
  return (
    <div className="access-shell">
      <header><Brand suffix="Client access" /></header>
      <main>{children}</main>
      <footer>
        Access to shared pages is logged (time, approximate location and device) so we know the material reached you.
        Questions? <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </footer>
    </div>
  );
}
