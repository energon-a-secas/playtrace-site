# Playtrace

## Register

product

## Users and purpose

Curious players and independent makers discover games shared by their creators on r/aigamedev. They need a preview, a clear source, a project's history and a public place to consolidate useful feedback without searching a long social feed.

## Scene

Players compare source-linked games in a calm, report-like reading surface. Pale slate, navy type and amber actions support daylight browsing; the interface follows the system dark preference in low light. Archivo headings and Source Sans 3 body text are self-hosted with their font licenses.

## Session outcome

Find a game to try, understand what changed, and share a useful note with an optional ideal price. Reading and contributing never require an account. Each browser can edit or remove its own public contribution. Collection reaches back to the community's creation in December 2022, with newest updates first and honest progress while historical collection continues.

Two optional multi-select questions invite a quick first impression, followed by an optional note. Keep the questions before existing contributions on narrow screens. Display name and ideal price expand only when wanted. Publish aggregate choices alongside the conversation without presenting visitor responses as verified players.

A highlighted header link opens a dedicated screenshot-game page, separate from the collection. Its five-question round offers a short discovery break using 20 curated projects with available builds and verified game names. Include demos, label them honestly, and avoid Reddit headlines or title-screen images as clues. Reveal names after the round, connect results to the real projects, and save recognition and chosen-name counts. Skips and unavailable images are separate from wrong answers; repeat rounds do not represent unique people. Visitors can delete their own quiz records, and admins can view aggregated choice distributions.

## Voice and principles

Curious, direct and grounded. Show real games before explaining the platform. Put constructive feedback before price. Treat an ideal price as a suggestion for the maker. Separate creator-described claims from reviewed metadata. Expose source dates and archive coverage. Derive collection insights from records; never manufacture votes, traction or urgency. Clearly identify visitor contributions and their public visibility.

## Anti-references

No auction pressure, invented revenue projections, cryptocurrency cues or decorative dashboard metrics. No generated game artwork passed off as an actual preview. Backend setup details stay out of the discovery flow.

## Accessibility and system

Use the canonical Neorgon tokens and Header, Footer, Auth, DOM and navigation kits. Native controls and dialogs support keyboards and touch. Keep visible focus, useful image fallbacks, reduced motion and layouts that fit narrow screens. The report-inspired visual dialect is scoped in `css/report.css`, preserving shared kit behavior. Brand amber is `#f9b73f`; action text uses navy for contrast.

## Editorial care

Project details lead with artwork filling the banner, with Project notes and a white outlined close control overlaid for contrast. Compact shortcuts sit beside the tags, with a clear Visit game button beside the title. Icon shortcuts have hover and keyboard labels, with visible captions on touch screens. Project history and source context precede player feedback, which is the final section. Each section owns its top divider, so hidden media never leaves doubled rules. The index explanation is a separate About article. Updates are subsequent source posts after the first showcase. Public change requests feed a private admin inbox; administrators can edit titles, descriptions, project links, genres, stages, device lists, tags, and previews without overwriting source history. Edits survive future archive imports and conflicting detail edits require a reload. Steam store prices stay visibly separate from player price suggestions. Only a verified server-side identity grants administrative access.

## Project platforms

The Platform filter describes the linked destination: itch.io, Steam, a code repository, another project website, or no project link. Each validated game derives its `distribution` field from its HTTPS `projectUrl`, so existing and newly collected records receive labels without reimporting the archive. This is separate from `platforms`, which describes supported devices under Runs on, and `stage`, which describes development progress. A store URL identifies a destination; it does not establish a completed release. Confirmed Steam metadata retains its own release and price labels.

## Source inclusion

Posts with the exact Demo | Project | Workflow flair are eligible for automatic inclusion. Older unlabeled game showcases can be included after individual review, with their missing flair preserved and an explicit review marker. Explicitly excluded flairs never qualify for that exception. Apply the same rule to historical imports and existing records. Hide excluded projects without deleting their stored contributions. Cards open project details across the whole surface; independent genre chips apply filters and the Reddit icon opens the latest source post.

## Names and editorial taxonomy

Use the actual game name as the title and the original Reddit headline as supporting context. Prefer verified store metadata, specific project URLs and explicit names in source text; keep uncertain headlines for review. Admin names win over automation. Categories belong to a shared saved registry: administrators can add missing genres from the editing dropdown and reuse them across projects. Clicker is included. Keep playable GitHub Pages URLs separate from the source-code repository, with independent Visit game and Source code actions.

## Discovery and research navigation

Home is a focused introduction with five weekly highlights and clear routes into Browse, the quiz, Quick reviews and Favorites. Show all five picks without an automatic carousel. Rotate unpinned picks on Saturdays at midnight in America/Santiago, preserving administrator exclusions and pinned games. Admins can reorder and replace the selection under Weekly highlights. Browse owns collection search and filters. The Maker field supports typing and keyboard selection. Favorites are account-private; a separate guest rating is one editable one-to-five-star contribution per browser/game. Branded Steam, itch.io and Reddit actions open their destinations independently of the card. Hover glints are brief and disabled for reduced motion.

Quick reviews (`research.html`) is a standalone, embeddable surface. Start with a game selection and an obvious link to try it; keep optional questionnaire topics in a disclosure. Disable loading forms and replace unavailable ones with a retry and a Browse route. Present one question at a time, with back/skip controls and a final save. Admins can create reusable or project-specific forms with one to five questions and research topics. Preserve revision-specific metrics. Research answers are private and may be analyzed by Jev, with that use disclosed before submission. Public project comments retain their existing visible consent and removal controls.

## Evidence queue

Editors can inspect link health, store metadata, linked source posts and cited feedback drafts. Distinguish a broken link from blocked access or a timeout. HTTP success alone never implies a playable build. Steam/itch evidence can improve automatic artwork or playable labels, while manual editorial choices win. Do not delete entries or publish AI reviews automatically after checks. Every review statement must link to real original comments and show sampling limits. Model probabilities are not guarantees.

Near-identical reposts by the same author within 48 hours keep the latest entry and combine source history, with redirects and preserved contributions. Different known project links prevent consolidation. The source timeline and original attribution remain readable.

Administrators see Edit buttons directly on cards and in project notes. Edit details in the existing project dialog with revision conflict protection; keep thumbnail uploads beside that editor. Approved uploaded images are served from R2 without catalogue database reads. Source and privacy controls belong in the single site footer.
