# Playtrace interface

Use the product register in PRODUCT.md: a calm place to compare real, source-linked games and contribute useful feedback. Site-owned styling lives in css/report.css and css/campaign.css. Preserve the vendored Neorgon header, footer, auth and navigation contracts.

- Palette: pale slate canvas, nearly white surfaces, navy text and amber primary actions. Follow the system dark preference. Use the existing `--pt-*` OKLCH tokens; platform actions inherit their brand accents.
- Typography: Archivo headings, Source Sans 3 body and restrained monospace source/date labels. Game titles lead; Reddit post titles are secondary. Keep full titles available in project notes and accessible button labels.
- Home: a focused introduction alongside five weekly picks. One leading image and four smaller picks, all visible without carousel controls. Date the selection and identify a saved fallback. Stack naturally on narrow screens.
- Browse: labeled filters, a searchable maker selector, stage controls, grid/list selection and consistent project cards. Limit title and headline lines for steady rows. Give each game one obvious play/store action and one Reddit shortcut; favorite and admin edit controls remain independent of the whole-card action.
- Project notes: a wide banner with overlaid close controls, compact metadata, primary game link, project history and public feedback. Admins edit details or upload an image within the existing dialog. Show conflicts instead of overwriting another editor's work.
- Quick reviews: explain the outcome, choose a game, offer a link to try it, then present one question at a time. Optional study selection is secondary. Loading controls are disabled; an unavailable service shows retry and Browse actions, never an active empty form.
- Footer: one footer for provenance, source/privacy controls and the Neorgon attribution. Avoid a separate policy strip and repeated closing copy.
- Controls: consistent 44px primary form controls, clear default/hover/focus/disabled states, visible keyboard focus, accessible labels for icons and reduced-motion support. Keep mobile headers usable at 320px and avoid horizontal page overflow.
