# Options considered for client sharing

The goal: share sub-pages of a React/Vite site, and whole apps from other repos, with clients.
Access is by link, password or verified email, with timing rules (expiry, a countdown from first
open, revocation) and with tracking of whether, when and from where it was opened. Admin sign-in
is through Clerk on the Microsoft 365 tenant, and it all runs on Cloudflare.

The comparison below condenses the research collected before implementation. The licence and
feature notes are as of that research; recheck them before adopting any of these products.

| Option | What it gives | Why not (as the whole solution) | What we took from it |
|---|---|---|---|
| [Directus](https://github.com/directus/directus) Shares | Admin UI over a DB; shares with password, start/end, max uses | No "N hours from first open" control; usage counter only, not engagement. Source-available (MSCL), not MIT. Another server to run. | Separate controls for start, end and max uses |
| [Papermark](https://github.com/papermark/papermark) | Document/data-room links: password, expiry, verified email, per-page analytics | A whole Next.js app for documents, not a way to protect arbitrary React routes. AGPL plus commercial parts. | Keep the **content separate from the links** to it: many shares per space, analytics per share. Good fit for PDFs today. |
| [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/) | Email one-time-PIN in front of paths/subdomains; auth logs | Session expiry is not the end of an entitlement (users can re-auth). No first-open countdown, no in-app engagement, path rules ignore `#hash` routes. | Use it to lock *upstream* origins if we ever proxy to `*.pages.dev`. Not needed with R2. |
| [Digify](https://help.digify.com/) | "Expire after first open", per-recipient timers | Files only, SaaS | The timer belongs to the share, or to each verified recipient, **never** to a browser. Our `timer_scope` does the same. |
| [Better Auth](https://github.com/better-auth/better-auth) | Self-hosted auth, magic links | We already run Clerk with the M365 tenant | Login identity and page entitlement are different things. A login link's expiry is not access expiry. |
| [React-admin](https://github.com/marmelab/react-admin) | CRUD admin framework | Heavy for 3–4 screens | Screen list: spaces, shares, visitors, activity |
| [Puck](https://github.com/puckeditor/puck) | Visual page builder over your React components | Not needed until we author pages without a repo | Roadmap item |
| [Password Pusher](https://github.com/pglombardo/PasswordPusher) | Expiring secrets with view limits | Secret sharing, not pages | **Link scanners consume views.** We require a click, password or code before anything counts, and log link loads separately. |
| [Pingvin Share X](https://github.com/smp46/pingvin-share-x) | File shares with expiry, password, visitor limits, reverse shares | Files only | Reverse share (client uploads) is a roadmap idea |
| [Dub](https://github.com/dubinc/dub) | Password-protected short links with analytics | Redirects to the destination, which still needs its own protection | The access check has to be at the content, not at a redirect |
| [StatiCrypt](https://github.com/robinmoisson/staticrypt) | Encrypted static HTML | Cannot revoke once the file and key are out | Rejected for anything that needs expiry |

## Decision

We built a small sharing layer on the infrastructure we already have:

- **Hosting:** Cloudflare Pages Functions, D1 and R2, on the same Pages project, domain and bill.
- **Admin sign-in:** Clerk, since it is already set up with the Microsoft 365 tenant. Admin status
  is still decided server-side from the verified email.
- **Client identity:** our own email one-time codes, sent from the tenant through Microsoft Graph.
  Clients never need a Clerk account.
- **Other repos as spaces:** built by a GitHub workflow into private R2 and served by an
  authorising gateway at `/p/<slug>/` or `<slug>.ddcnorth.com`. Every file is checked, so a
  deployment cannot be reached directly by another address.

The parts that set this apart from the products above: a **countdown from the first deliberate
open**, a timer per share or per recipient, separate deadline/end/session/max-open controls,
**restart and extend**, and **engagement** (views and active time) per visitor. All of it applies
to arbitrary apps, not just documents.

## Pitfalls we designed around

- **Opening the link URL never starts the clock.** Previews and mail scanners fetch links.
- **The first-open time is written once on the server**, with an `ON CONFLICT DO NOTHING` insert.
  Clearing cookies or switching browsers cannot reset it.
- **"Session" and "access" are different.** The session length is capped by the access end, and
  re-entering never extends access.
- **Private content never goes in a public repo or the public site bundle.** A password screen in
  React alone protects nothing.
- **Access is checked on every file, not just the landing page.**
- **Location is approximate; active time is engagement, not proof of reading.** The UI says so.
