# Playtrace interface

Use the product register in PRODUCT.md: a calm place to compare real, source-linked games and contribute useful feedback. Site-owned styling lives in css/report.css and css/campaign.css. Preserve the vendored Neorgon header, footer, auth and navigation contracts.

- Palette: pale slate canvas, nearly white surfaces, navy text and amber primary actions. Follow the system dark preference. Use the existing `--pt-*` OKLCH tokens; platform actions inherit their brand accents.
- Typography: Archivo headings, Source Sans 3 body and restrained monospace source/date labels. Game titles lead; Reddit post titles are secondary. Keep full titles available in project notes and accessible button labels.
- Home: five tall, adjoining artwork panels with diagonal cuts on desktop. Always show titles, maker credits and project links. Artwork brightens on hover/focus; no carousel. Stack into wide image strips on mobile. Date the weekly selection and identify a saved fallback.
- Browse: labeled filters, a searchable maker selector, stage controls, grid/list selection and consistent project cards. Limit title and headline lines for steady rows. Give each game one obvious play/store action and one Reddit shortcut; favorite and admin edit controls remain independent of the whole-card action.
- Project notes: a wide banner with overlaid close controls, compact metadata, primary game link, project history and public feedback. Admins edit details or upload an image within the existing dialog. Show conflicts instead of overwriting another editor's work.
- Quick reviews: one searchable combobox combines searching and choosing a game, offer a link to try it, then present one question at a time. Optional study selection is secondary. Loading controls are disabled; an unavailable service shows retry and Browse actions, never an active empty form.
- Footer: one footer for provenance, source/privacy controls and the Neorgon attribution. Avoid a separate policy strip and repeated closing copy.
- Controls: consistent 44px primary form controls, clear default/hover/focus/disabled states, visible keyboard focus, accessible labels for icons and reduced-motion support. Keep mobile headers usable at 320px and avoid horizontal page overflow.

- Favorites: a star filter within Browse, with a pressed state and count. Keep anonymous saves durable and account sync optional. Remove separate Favorites and quiz navigation links.
- Dedicated project pages: stable ID URLs, a full-width banner, compact icon actions, primary play/store link and unobtrusive rating stars. History precedes feedback. Prerender all reading content and metadata.
- Admin Insights: restrained amber charts, complete tables, visible denominators and unknowns. Scope filters sit above charts; source records expand below them. Keep scrollable figures and tables keyboard accessible. Model announcements link to primary sources; comparisons never imply causality.
