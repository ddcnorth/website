# Design review and content simplification — November 2026

Scope: the live single-page site (`index.html`, `fr/index.html`, shared `assets/`), reviewed at 1440 × 900 and 390 × 844 (plus 900 px and 320 px overflow checks), in English and French. The site is light-only, so there is no dark theme to review. Ten studio and consultancy sites were compared (links in section 3). The owner's brief: "we are just starting out now, but we will add things later". The copy should only say what a new team can honestly stand behind.

## 1. Summary

The visual identity is strong and worth keeping: the six-dot mark, the navy/ice/paper palette, Inter Display headlines and the large navy hero panel. The page is short, the heading structure is clean, keyboard focus is visible, and the English and French versions mirror each other.

The weak spots were mostly in the **words**, plus one **performance** problem:

- **Over-promising.** The copy listed nine specialised offerings: healthcare forms and records, governance and compliance with audit trails, machine vision, research "at scale", indoor navigation, and parametric design. It also promised "complete documentation … and service afterwards" and "everything in between". For a team founded in 2026 with no published work, this reads as a capability list rather than something it can show.
- **Vague positioning.** The title ("We clear the bottlenecks in your work") and hero ("We design and build everything in between") never said *what* ddcnorth builds or *where* it is.
- **Contact.** Two mailto links sat side by side in the nav ("Contact us" and "Talk to us"). The page body had no contact prompt, and the email address was never visible. Visitors without a configured mail app had no way to reach the team.
- **Performance.** `assets/site.css` is 599 KB (409 KB gzipped) because four full-charset fonts are embedded as base64. All of it blocks rendering, and nothing can paint until it arrives.

This change rewrites the copy (sections 5 and 6), consolidates contact into one call-to-action, fixes a footer contrast bug and tightens metadata. Layout, brand, fonts, header/footer, the language switcher, the single-page structure and every anchor ID stay unchanged.

## 2. Findings by severity

Status: **Fixed** = addressed in this change; **Open** = recommendation in section 4.

### High

| # | Finding | Status |
|---|---|---|
| H1 | **Copy over-promises for a new team.** Healthcare records, governance/compliance with audit trail, machine vision, "qualitative analysis at scale", "full control to customize the solution you paid for and own", "complete documentation, support … and service afterwards". Each is a claim a prospect can ask to see proof of. Regulated areas (health records, compliance) also imply privacy and security obligations the site can't yet back up. | Fixed |
| H2 | **Footer location text is unreadable.** `.footer-location` inherited the body's muted grey (`#4B4F56`) on the navy footer (`#0B2B4A`), a contrast of **1.75:1** (WCAG AA needs 4.5:1). It was effectively invisible in both languages. Now uses `--ice`, 9.8:1. | Fixed (`assets/footer.css`) |
| H3 | **599 KB render-blocking stylesheet.** Inter 400 (111 KB), Inter 600 (115 KB), Inter Display 500 (113 KB) and Space Mono **TTF** (99 KB) are base64-inlined, adding about 33% on top of the raw fonts. `font-display:swap` has no effect because the fonts arrive with the CSS. Space Mono is used for one 20-character label ("CONNECTING THE DOTS."). On a mid-range phone over 4G this means a blank page for 1–3 s on first visit. | Open: recommendation N1 |
| H4 | **Mailto-only contact with the address hidden.** Every contact link was a `mailto:`, which fails silently for webmail users. The address itself was never shown. | Fixed: the address is now visible under the CTA |

### Medium

| # | Finding | Status |
|---|---|---|
| M1 | `<title>` and description didn't say what ddcnorth does or where. The title didn't match the H1, and the OG description repeated the old hero. | Fixed: title states "Data tools, maps and apps · Prince George, BC"; description and OG tags rewritten; `og:site_name`, `og:locale` and `og:locale:alternate` added |
| M2 | No `og:image` / `twitter:card`, so links shared on LinkedIn, Slack or iMessage show a bare text card. | Open: N2 |
| M3 | Duplicate contact links in the main nav ("Contact us" and "Talk to us", both mailto, adjacent). | Fixed: kept the right-aligned "Talk to us ↗" button (the mobile menu's filled CTA); the footer keeps "Contact us" |
| M4 | "The founders." headed a paragraph with no founders: no names, roles or faces. It raises a question it doesn't answer. Names were removed at the owner's request in M11. | Fixed: heading is now "About us." (matches the nav); names remain a later decision (L1) |
| M5 | "Solutions & services" is jargon, and the menu only contains services. | Fixed: "Services" / "Services" |
| M6 | Service panels held 3 sub-items each (nine total). Two of the three areas were collapsed, so most of the offer was hidden behind clicks, and the dropdown descriptions repeated the riskiest items. | Fixed: each panel now holds one plain sentence plus one "For example:" line (see section 5 for rationale) |
| M7 | The search index (behind the disabled flag) had stale terms ("discover develop deliver") and suggested searching "websites", which isn't a service. | Fixed: `assets/header.js` index matches the new copy in both languages |
| M8 | Mobile hero broke as "Complex data / in." with an orphaned word. | Fixed: `data&nbsp;in.` keeps the pair together; desktop is unchanged |
| M9 | No structured data (`Organization` / `ProfessionalService` JSON-LD with locality, email and languages). | Open: N3 |

### Low

| # | Finding | Status |
|---|---|---|
| L1 | No named people. For a new studio without case studies, named founders with a one-line background are the strongest trust signal (see section 3). | Open: owner's decision |
| L2 | The hero button "See what we do ↗" scrolls within the page, but ↗ usually signals an external link. | Open (brand choice; ↓ or → would be more literal) |
| L3 | The email is a personal, capitalised address (`Fryderyk@…`). A role address (`hello@ddcnorth.com`, forwarded) survives team changes and looks tidier in lower case. | Open: N4 |
| L4 | No PNG `apple-touch-icon` or web manifest. The SVG favicon (with dark-mode handling) is good, but iOS home-screen and some link previews fall back to a screenshot. | Open: N2 |
| L5 | About 4 KB of dead CSS from earlier iterations: `.header`, `.contact*`, `.team`, `.tags`, `.intro-strip`, `.hero-note`, `.footer` in `site.css`; `.category-*`, `.utility-links`, `.header-location`, `.dropdown-*` in `header.css`. Harmless, but it confuses future edits. | Open: clean up together with N1 |
| L6 | Legacy `/services/`, `/approach/`, `/about/` stubs always land on the English page. Fine today; revisit if French links get shared. | Open (low) |
| L7 | French typography: colons in "Par exemple :" need a non-breaking space. | Fixed (`&nbsp;:`) |

### What is already good (keep)

- Exactly one `h1`, one `h2` per section and `h3` steps; skip link; visible `:focus-visible` outlines throughout (checked by tabbing through the full page); `lang="en"`/`lang="fr"` and per-link `lang`/`hreflang` in the switcher.
- Reciprocal `hreflang` (en, fr, x-default) and self-referencing canonicals on both pages.
- Body-text contrast is high: muted grey on paper is 7.6:1, on the approach band 7.1:1; navy on paper is 13.3:1.
- Decorative images use `alt=""`, and the hero panel has a single descriptive `aria-label`.
- No console errors, failed requests or horizontal overflow at 1440, 900, 390 or 320 px in either language, before or after this change.
- Native `<details>` accordions and language picker work without JavaScript.

## 3. What other sites do well

Ten sites were reviewed for how they present a few services, earn trust and ask for contact. Several are established studios. What matters is the pattern a small studio can adopt now.

| Site | What it does | Lesson for ddcnorth |
|---|---|---|
| [Sanctuary Computer](https://sanctuary.computer/) | "We specialize in three things" with three numbered cards, then a longer capability list further down. States its working principles: "We price honestly, and work transparently." | Three named areas is a credible, common shape. Process promises (scope and price in writing) work as trust signals when there is no portfolio. |
| [Development Seed](https://developmentseed.org/) | Geospatial firm. Short hero ("See our planet better."), three "What we do" items, and contact as a plain email in the footer. | Even a mature mapping firm keeps the service list to three. A plain email address is normal and enough. |
| [Stamen](https://stamen.com/) | Mapping and data-visualisation studio. Services are listed as bare names, and it calls itself small with a personalised approach. Team photo and "Meet our team". | Being small is a selling point; say it. People are part of the pitch. |
| [Fathom](https://fathom.info/) | One-line hero ("We build platforms and products for understanding data."). Ends the page with "How can we help?" and the email address. | End the page with one human question and a visible address. This was the model for the new About CTA. |
| [Interactive Things](https://www.interactivethings.com/) | "Interested in working with us?" + "Get in touch". Full Zurich street address in the footer. EN/DE switcher in the header. | A concrete location is a trust signal; ddcnorth now names Prince George in the hero. A header language switcher is standard. |
| [Ink & Switch](https://www.inkandswitch.com/) | Text-forward, minimal; four research areas with one-line summaries; contact is "Say hello@inkandswitch.com" in the footer. | One-line summaries per area are enough. A friendly, visible address beats a form. |
| [Kiln](https://www.kiln.digital/) | Small London data studio. Services described in prose; trust built from founder credentials, "Since 2012", awards and client logos. | Until there are clients, founder background is the available proof (see L1). |
| [Small Multiples](https://smallmultiples.com.au/) | Six services with icon + 1–2 sentences. Lists government supplier-panel memberships and a Traditional Custodians acknowledgement. | Later: public-sector supplier registrations, and possibly a land acknowledgement (Prince George is on the traditional territory of the Lheidli T'enneh), both owner decisions. |
| [Graphicacy](https://www.graphicacy.com/), [Order](https://order.design/), [Truth & Beauty — services](https://truth-and-beauty.net/services) | Services aren't a separate list. They appear as tags or links on real projects, and Truth & Beauty lists 2–4 example projects under each service. | The future "Work" section should tag each project with one of the three service areas and link back from each panel. |
| [Room 302 Studio launch post](https://ejfox.com/blog/starting-a-studio-introducing-room-302) | A brand-new studio: says it is "open for business!", lists services, has no case studies yet, mentions "one of our first projects", and asks people to email an idea or dataset or book a call. | Being honest about being new is fine and even disarming. Invite a concrete next step ("tell us about your project"). |

Local context: [Sparkgeo](https://bcbusiness.ca/?p=46192), a geospatial consultancy founded in Prince George in 2010, grew to about 60 people ([PG Daily News](https://pgdailynews.ca/index.php/2019/05/28/sparkgeo-moving-into-the-hubspace/)). Its site blocked automated fetching, so it was not reviewed directly. The precedent still supports leading with "Prince George, BC" rather than hiding it.

**Client portal links.** None of the studios above put a client login in the main navigation. Vendor guidance for design-studio portals ([DesignFiles](https://intercom.help/designfiles/en/articles/13130445-setting-up-your-client-portal-link)) suggests the top-right of the header, plus email signatures.

**Patterns adopted:**
- Few services in plain words.
- Location and "small" stated up front.
- Process promises the team can keep.
- One closing question with a visible email address.

**Patterns left for later:** client logos, testimonials, awards, newsletter sign-ups and a services-tagged work index. They need material the team doesn't have yet.

## 4. Recommendations

### Now (done in this change)

1. Simplified copy in both languages (section 6).
2. One clear contact call-to-action at the end of About, with the address visible; duplicate nav link removed.
3. Footer contrast fix.
4. Title, description and OG metadata rewritten; locale tags added.
5. Search index and no-result hint updated.
6. Mobile headline orphan and French colon spacing fixed.

### Next (small, high value, not done here)

- **N1 — Unbundle and subset the fonts.** This is the biggest technical win.
  - Move the four faces into `assets/fonts/*.woff2`.
  - Subset to Latin + Latin-1 + French punctuation (`pyftsubset --unicodes="U+0000-00FF,U+0152-0153,U+2013-2014,U+2018-201E,U+2026,U+2197,U+00A0"`).
  - Convert Space Mono from TTF to woff2. Or drop it and set the one label in Inter with letter-spacing.
  - Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for Inter 400 and Inter Display 500.
  - Expected result: `site.css` falls from 599 KB to about 14 KB, and the fonts total about 60–90 KB, cached separately.
  - Both OFL licences permit subsetting (neither declares a Reserved Font Name); keep the files in `licenses/`. `scripts/build.sh` already copies `assets/`, so no build change is needed.
  - Remove the dead CSS (L5) at the same time.
- **N2 — Share preview.** Add a 1200 × 630 `og:image` (navy panel, six dots, "Complex data in. Clear results out."), plus `twitter:card=summary_large_image`, a 180 × 180 `apple-touch-icon` and the image's `og:image:alt`, in both languages.
- **N3 — Structured data.** One JSON-LD `ProfessionalService` block per page: name, URL, email, `areaServed: CA`, address locality Prince George, region BC, `knowsLanguage: [en, fr]`, and `sameAs` (LinkedIn) once it exists.
- **N4 — Role email.** Create `hello@ddcnorth.com` forwarding to the founder, and display it in lower case. This needs the owner, since the address appears in 6 places and in the search index.
- **N5 — Business listings.** Create a Google Business Profile and LinkedIn company page for Prince George. Link them from the footer once they exist.

### Later (as the business grows)

- **Work / case studies.**
  - When to add: once there are 2–3 shareable projects. Clearly labelled internal demos or prototypes count too.
  - Where: add `<section id="work">` between Services and Our approach, and a "Work" nav item.
  - What each project shows: client or sector, problem, what was built, and one outcome. Tag it with one of the three service areas, as Graphicacy and Truth & Beauty do.
  - Then add a "See examples" link at the bottom of each service panel, and a short client quote (with permission) under About.
  - Keep the single page until there are more than about 4 projects; after that, a `/work/` page.
- **Client portal link.**
  - Phase 1 (few clients): add a small "Client login" / "Espace client" text link in the **footer**, next to "Contact us". It is easy for clients to find, but prospects, the people this page is for, don't see it as a competing action.
  - Phase 2 (clients use it weekly): promote it to a **header utility link** in the top brand row, just left of the language globe, styled like the globe, with a text label and no icon-only control.
  - Keep it out of the main navigation (Services / approach / About / Talk to us), which is for prospects. On mobile, add it as the last plain row of the menu, under "Talk to us".
  - Also put the portal URL in email signatures.
- **People.** When the founders are comfortable, add names, a one-line background and LinkedIn links to About. This is the strongest trust signal available before case studies exist. The owner removed names in M11, so this is their call.
- **Booking link.** Offer a 20-minute call link (for example Cal.com) next to the email address, if prospects prefer calls.
- **Contact form.** A form behind a Cloudflare Pages Function, only if mailto friction shows up in practice. It needs spam protection and a privacy notice.
- **Privacy page.** Required as soon as the portal, a form or analytics collect personal data (PIPEDA / BC PIPA). Link it from the footer.
- **Per-service pages.** Only once each area has enough real content and examples to rank on its own. Until then, one page with stable anchors (`#service-planning`, `#service-data`, `#service-digital`) is simpler and already deep-linkable.
- **Credentials.** Public-sector supplier registrations (BC Bid, CanadaBuys), a land acknowledgement, and any memberships, once real.

## 5. Why the nine sub-items were condensed (not deleted outright)

- **Kept** the three areas, their names and their IDs. They match how the owner describes the business ("data tools, dashboards/maps, apps & workflows, spatial/visual tools"). They also anchor the header dropdown, the search index, the legacy redirects and any links already shared.
- **Removed** the nine bold sub-headings. Most were specialised claims a new team can't evidence yet: healthcare records, governance and compliance, machine vision, research at scale, indoor navigation. Some named regulated domains that imply privacy and security obligations.
- **Replaced** them with one plain sentence per area and one "For example:" line. The examples are small, concrete starter projects (a dashboard, a field-data app, a digital intake form, floor-plan wayfinding). They help visitors see themselves in the offer without implying a track record. "For example" is honest: these are kinds of work, not completed projects.
- **Kept the accordion.** It is the established visual identity of this section and the deep-link and JS behaviour depend on it. With two short lines per panel, opening one costs little. If the owner later wants all three areas visible at once, convert the panels to always-open blocks. Note that `assets/header.js` closes sibling panels on toggle, so that code would need changing too.
- **Approach and About** were shortened to promises the team controls: understand before building, build what was agreed, and hand over the tool with plain-language notes and help getting started. "Every change is tracked", "complete documentation" and "service afterwards" were dropped. An ongoing-service promise belongs in a contract, not on the homepage.

## 6. Content simplification — exact before/after

Unchanged: the H1 ("Complex data in. / Clear results out." / "Données complexes. / Résultats clairs."), hero button, hero-panel labels ("Connecting the dots." / "From scattered data to clear results."), service names, step names, the approach heading "Three stages, then it’s yours." / "Trois étapes, puis c’est à vous.", the header "Talk to us" / "Parlons-en" button, and the footer.

### Metadata

| Field | Before (EN) | After (EN) |
|---|---|---|
| `<title>` | ddcnorth \| We clear the bottlenecks in your work | ddcnorth \| Data tools, maps and apps · Prince George, BC |
| description | ddcnorth is a Canadian team that takes on your complex data problems. You bring the inputs, we handle everything in between, and you get clear results. | ddcnorth is a small team in Prince George, BC. We build dashboards, maps, apps and workflows around the data you already have. |
| og:title | ddcnorth \| We clear the bottlenecks in your work | ddcnorth \| Complex data in. Clear results out. |
| og:description | Complex data in. Clear results out. You know what goes in and what needs to come out. We design and build everything in between. | A small team in Prince George, BC. We build dashboards, maps, apps and workflows around the data you already have. |
| added | — | `og:site_name`, `og:locale` (en_CA), `og:locale:alternate` (fr_CA) |

| Field | Before (FR) | After (FR) |
|---|---|---|
| `<title>` | ddcnorth \| Nous éliminons les goulots d’étranglement de votre travail | ddcnorth \| Outils de données, cartes et applications · Prince George (C.-B.) |
| description | ddcnorth est une équipe canadienne qui s’attaque à vos problèmes de données complexes. Vous fournissez les intrants, nous nous occupons de tout le reste, et vous obtenez des résultats clairs. | ddcnorth est une petite équipe de Prince George (C.-B.). Nous créons des tableaux de bord, des cartes, des applications et des processus à partir des données que vous avez déjà. |
| og:title | ddcnorth \| Nous éliminons les goulots d’étranglement de votre travail | ddcnorth \| Données complexes. Résultats clairs. |
| og:description | Des données complexes en entrée. Des résultats clairs en sortie. | Une petite équipe de Prince George (C.-B.). Nous créons des tableaux de bord, des cartes, des applications et des processus à partir des données que vous avez déjà. |
| added | — | `og:site_name`, `og:locale` (fr_CA), `og:locale:alternate` (en_CA) |

### Header

| | Before | After |
|---|---|---|
| Dropdown trigger | Solutions & services / Solutions et services | Services / Services |
| Nav links | … About us · **Contact us** · Talk to us ↗ | … About us · Talk to us ↗ (FR: … À propos · Parlons-en ↗) |
| Dropdown: Data & insight | Dashboards, maps and research that turn scattered data into clear answers. | Dashboards, maps and reports that bring scattered data into one view. |
| Dropdown: Apps & workflows | Apps, digital forms and records built around the way you already work. | Simple apps and digital forms that fit the way your team works. |
| Dropdown: Spatial & visual tools | Indoor navigation, machine vision and models that recalculate as inputs change. | Tools for problems that live in a building, a site or an image. |
| FR: Données et analyse | Tableaux de bord, cartes et recherche qui transforment des données éparses en réponses claires. | Tableaux de bord, cartes et rapports qui réunissent des données éparses en une seule vue. |
| FR: Applications et processus | Applications, formulaires numériques et dossiers conçus selon votre façon de travailler. | Applications simples et formulaires numériques adaptés à votre façon de travailler. |
| FR: Outils spatiaux et visuels | Orientation intérieure, vision artificielle et modèles qui se recalculent quand les données changent. | Des outils pour les problèmes liés à un bâtiment, à un site ou à une image. |

### Hero description

- **EN before:** You know what goes in and what needs to come out. We design and build everything in between.
- **EN after:** We’re a small team in Prince George, BC. We build dashboards, maps and apps around the data you already have.
- **FR before:** Vous savez ce qui entre et ce qui doit en sortir. Nous concevons et construisons tout ce qui se trouve entre les deux.
- **FR after:** Nous sommes une petite équipe de Prince George, en Colombie-Britannique. Nous créons des tableaux de bord, des cartes et des applications à partir des données que vous avez déjà.

### Services heading

- **EN before:** You focus on the work. / We remove the workarounds. — We find where time is wasted and build the tools to give it back to you.
- **EN after:** What we build. — Three areas to start with. If your problem doesn’t quite fit, ask us anyway.
- **FR before:** Vous vous concentrez sur le travail. / Nous éliminons les solutions de fortune. — Nous repérons où le temps se perd et créons les outils pour vous le redonner.
- **FR after:** Ce que nous créons. — Trois domaines pour commencer. Si votre besoin n’y correspond pas tout à fait, parlez-nous-en quand même.

### Service panels

**Data & insight / Données et analyse** (`#service-planning`)
- EN before: Bring scattered sources into one clear view. **Data visualization.** Dashboards that bring scattered sources into one live view. **Interactive maps.** Your records layered over spatial data. **Research and evaluation.** Literature searches, transcription and qualitative analysis at scale.
- EN after: Dashboards, maps and reports that bring scattered data into one clear view. **For example:** a live dashboard, your records on an interactive map, or a tidy dataset you can rely on.
- FR before: Réunir des sources éparses en une seule vue claire. **Visualisation de données.** Des tableaux de bord qui réunissent des sources éparses en une seule vue en temps réel. **Cartes interactives.** Vos dossiers superposés aux données géographiques. **Recherche et évaluation.** Recherches documentaires, transcription et analyse qualitative à grande échelle.
- FR after: Des tableaux de bord, des cartes et des rapports qui réunissent vos données éparses en une seule vue claire. **Par exemple :** un tableau de bord à jour, vos dossiers sur une carte interactive ou un jeu de données propre et fiable.

**Apps & workflows / Applications et processus** (`#service-data`)
- EN before: Tools built around the way your team already works. **Mobile and desktop apps.** Applications built around existing workflows. **Healthcare forms and records.** Digital intake and filing. **Governance and compliance.** Records, meetings and filings in one place, with a clear audit trail.
- EN after: Simple apps and digital forms built around the way your team already works. **For example:** a mobile app for field data, a digital intake form, or a shared tracker in place of emailed spreadsheets.
- FR before: Des outils conçus selon la façon dont votre équipe travaille déjà. **Applications mobiles et de bureau.** Des applications conçues autour de vos processus existants. **Formulaires et dossiers de santé.** Accueil et classement numériques. **Gouvernance et conformité.** Registres, réunions et dépôts au même endroit, avec une piste de vérification claire.
- FR after: Des applications simples et des formulaires numériques conçus selon la façon dont votre équipe travaille déjà. **Par exemple :** une application mobile pour la collecte sur le terrain, un formulaire d’accueil numérique ou un outil de suivi partagé plutôt que des feuilles de calcul envoyées par courriel.

**Spatial & visual tools / Outils spatiaux et visuels** (`#service-digital`)
- EN before: When the problem is a building, an image or a design. **Indoor navigation.** Wayfinding for complex facilities. **Machine vision.** Visual inspection turned into structured, auditable data. **Parametric design and planning.** Models that recalculate as inputs change.
- EN after: For problems that live in a building, a site or an image. **For example:** floor-plan wayfinding, photo-based inspection records, or design models that update as inputs change.
- FR before: Quand le problème est un bâtiment, une image ou un design. **Orientation intérieure.** Signalisation et itinéraires pour les installations complexes. **Vision artificielle.** L’inspection visuelle transformée en données structurées et vérifiables. **Conception et planification paramétriques.** Des modèles qui se recalculent quand les données changent.
- FR after: Pour les problèmes liés à un bâtiment, à un site ou à une image. **Par exemple :** l’orientation à partir d’un plan d’étage, des registres d’inspection à partir de photos ou des modèles de conception qui se mettent à jour quand les données changent.

### Our approach

| | Before | After |
|---|---|---|
| Intro (EN) | Scope and price are agreed in writing before the build begins, and every change is tracked. | We agree on scope and price in writing before we start. |
| Understand. | We don’t build anything until we can describe the problem back to you, clearly and precisely. Definitions, nuances and details come first. | We learn how you work, and we don’t build until we can describe the problem back to you. |
| Build. | We build to the agreed scope and show only what’s needed. You get full control to customize the solution you paid for and own. | We build what we agreed on and show you progress along the way. |
| Hand over. | Complete documentation, support while you put it into use, and service afterwards. | You get the finished tool, plain-language notes on how it works, and help getting started. |
| Intro (FR) | La portée et le prix sont convenus par écrit avant le début des travaux, et chaque changement est consigné. | Nous convenons de la portée et du prix par écrit avant de commencer. |
| Comprendre. | Nous ne construisons rien avant de pouvoir vous décrire le problème clairement et précisément. Les définitions, les nuances et les détails passent en premier. | Nous apprenons comment vous travaillez, et nous ne construisons rien avant de pouvoir vous décrire le problème. |
| Construire. | Nous construisons selon la portée convenue et ne montrons que l’essentiel. Vous gardez le plein contrôle pour adapter la solution que vous avez payée et qui vous appartient. | Nous construisons ce qui a été convenu et vous montrons l’avancement en cours de route. |
| Remettre. | Une documentation complète, du soutien pendant la mise en service et un service par la suite. | Vous recevez l’outil terminé, des notes claires sur son fonctionnement et de l’aide pour bien démarrer. |

### About + contact call-to-action

- **EN before:** **The founders.** ddcnorth is a lean Canadian team, founded in 2026. We pair long business experience with current expertise in software and design.
- **EN after:** **About us.** ddcnorth is a small team founded in 2026 in Prince George, British Columbia. We combine years of business experience with current skills in software and design, and we’re just getting started.
  [Button] **Tell us about your project ↗** (mailto, subject "Let’s talk about a project")
  Or write to Fryderyk@ddcnorth.com
- **FR before:** **Les fondateurs.** ddcnorth est une petite équipe canadienne fondée en 2026. Nous allions une longue expérience des affaires à une expertise actuelle en logiciels et en design.
- **FR after:** **À propos.** ddcnorth est une petite équipe fondée en 2026 à Prince George, en Colombie-Britannique. Nous allions de nombreuses années d’expérience en affaires à des compétences actuelles en logiciels et en design, et nous ne faisons que commencer.
  [Bouton] **Parlez-nous de votre projet ↗** (mailto, objet « Parlons de votre projet »)
  Ou écrivez à Fryderyk@ddcnorth.com

### Search index (`assets/header.js`, hidden behind `searchEnabled: false`)

- Descriptions and terms rewritten to match the copy above. Removed healthcare, compliance, machine-vision and "discover/develop/deliver" terms; added maps, forms, floor plan, inspection photos, scope and price, and Prince George.
- The no-results hint now suggests "data", "maps" or "contact" (FR « données », « cartes », « contact ») instead of "websites".

## 7. Files changed and verification

- `index.html`, `fr/index.html`: copy, metadata, nav and About CTA. Both pages have identical element/ID/class structure (274 tags each, compared programmatically).
- `assets/header.js`: search index entries and no-result hint.
- `assets/site.css`: 4 appended lines (`.about-copy .button`, `.about-copy .about-email`, `.about-email a`). Font data is untouched.
- `assets/footer.css`: 1 rule for footer location contrast.
- Unchanged: anchor IDs (`#services`, `#service-planning`, `#service-data`, `#service-digital`, `#approach`, `#about`), so the `services/`, `approach/` and `about/` redirect stubs and `assets/section-redirect.js` needed no edits.

Checked after `sh scripts/build.sh` in headless Chromium:
- EN and FR at 1440 × 900 and 390 × 844, plus overflow at 900 and 320 px: no horizontal overflow, no console errors, no failed requests, every in-page `#fragment` resolves.
- Navigation: the dropdown link to `#service-data` opens that panel and closes the others; the language links preserve the hash; `/services/`, `/approach/`, `/about/` and `/services/#service-digital` redirect to the right anchor; `/fr/#service-digital` opens on load.
- Keyboard: Tab order runs Skip → logo → language → Services → Our approach → About us → Talk to us → hero CTA → three panels → About CTA → email, with a visible outline on each.
- Static checks: `node --check assets/header.js` and `git diff --check` pass.
- Page height at 1440 px: EN 2,490 → 2,545 px (the About CTA adds height); FR 2,563 → 2,618 px. At 390 px: EN 3,167 → 3,119 px; FR 3,285 → 3,150 px.
