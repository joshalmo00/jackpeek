---
version: "superdesign-alpha"
name: "Midnight Signal Ops"
description: "Near-black, navy-dominant dark system with a rationed crimson accent, blocky square-cornered utility components, and a heavy-weight display type carrying all hierarchy."
colors:
  background: "#000018"
  surface: "#070A20"
  surface-alt: "#0A0F2B"
  text-primary: "#FFFFFF"
  text-secondary: "#C6C5C5"
  text-muted: "#DDDDDD"
  accent: "#E01A33"
  accent-hover: "#751323"
  eyebrow: "#DDC186"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "60px"
    fontWeight: 800
    lineHeight: "1"
    letterSpacing: "-1.2px"
  headline-md:
    fontFamily: "Inter"
    fontSize: "36px"
    fontWeight: 800
    lineHeight: "1.11"
    letterSpacing: "-0.7px"
  body-md:
    fontFamily: "Inter"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: "1.4"
  label-md:
    fontFamily: "Inter"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: "1.33"
    letterSpacing: "-0.5px"
  body-base:
    fontFamily: "Inter"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.5"
  eyebrow-caps:
    fontFamily: "Inter"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "1.4"
spacing:
  base: "8px"
  gap: "24px"
  section-padding: "96px"
  section-gap: "51px"
rounded:
  control: "4px"
  card: "6px"
  pill: "9999px"
  bar: "2px"
components:
  button-primary-hero:
    background: "#E01A33"
    text-color: "#FFFFFF"
    radius: "100px"
    height: "50px"
    padding: "0px"
    shadow: "rgba(0, 0, 0, 0.2) 0px 4px 8px 0px"
  button-nav-cta:
    background: "#E01A33"
    text-color: "#FFFFFF"
    radius: "4px"
    height: "48px"
    padding: "12px 12px 12px 16px"
    hover-background: "#751323"
  button-outline:
    background: "transparent"
    text-color: "#FFFFFF"
    radius: "4px"
    height: "48px"
    border: "1px solid rgba(255,255,255,0.3)"
  button-nav-ghost:
    background: "transparent"
    text-color: "#FFFFFF"
    radius: "4px"
    height: "24px"
    padding: "0px"
    hover-color: "#C6C5C5"
  button-footer-link:
    background: "transparent"
    text-color: "#FFFFFF"
    radius: "0px"
    height: "24px"
    padding: "0px"
  card-nav-panel:
    background: "#070A20"
    radius: "0px"
    padding: "0px"
  card-stat:
    background: "transparent"
    radius: "0px"
    padding: "0px"
  card-solution-tile:
    background: "#070A20"
    radius: "6px"
    padding: "24px 20px"
    border: "oklab(0.949045 -0.0000615716 0.00416207 / 0.7) 0px 0px 0px 1px inset"
  card-problem-panel:
    background: "rgba(239, 238, 235, 0.05)"
    radius: "6px"
    padding: "24px 20px"
    border: "oklab(0.949045 -0.0000615716 0.00416207 / 0.7) 0px 0px 0px 1px inset"
---
# Midnight Signal Ops
Source: https://www.tanium.com

## Overview
This is a dark-mode-default enterprise system built on a near-black navy field (#000018/#070A20/#0A0F2B) with a single saturated crimson (#E01A33) rationed to CTAs, eyebrow accents, and alert chips. The aesthetic reads as Swiss-influenced utility dressed for security software: heavy 800-weight Inter carries all hierarchy, corners stay mostly square (0–6px) except for two deliberate pill CTAs and the nav's utility buttons, and content is organized into dense, ruled three- and four-up card rows rather than illustrated bento tiles. It is enterprise-B2B minimalism with a technical, almost terminal-adjacent voice — dot-grid textures, ticker marquees, and monospace-flavored data panels puncture the otherwise clean type-led composition.

## Composition
The first screen opens on a full-bleed teal-black gradient wash behind a centered, two-line display headline (white line over crimson line), a slim body sentence, and a paired pill/outline button row — classic centered hero, not asymmetric split. Directly below, a dark inverted device-style panel (navy #070A20 with a dot-pattern overlay) shows a product surface, breaking the vertical rhythm with a full-bleed media block. Scrolling down, the page settles into a strict repeating rhythm: eyebrow (gold caps) → bold headline → gray body sentence → row of cards, repeated for a logo strip, a three-card problem grid, a two-column proof/chat panel with a scrolling alert ticker, a four-up stat row, and a six-card platform/solution grid, before a link-dense footer. The deliberate choice is a single-column vertical stack of full-width sections (each capped at max-width 1536px) rather than an alternating zig-zag layout — every section aligns to the same left-reading eyebrow/headline column, rejecting playful asymmetry in favor of a scannable, repeatable enterprise cadence.

## Colors
Background is genuinely near-black navy, not gradient-saturated: pixel data shows #000018 (~37%) and #001830 (~31%) as the dominant field, with #181848/#181830 filling secondary bands — confirming a flat dark navy base, not a full-frame aurora. #070A20 (~30% of declared UI area) is the card/panel surface, #0A0F2B is the footer and secondary-panel surface. Text is white (#FFFFFF) for primary content and headlines, #C6C5C5 for secondary/body copy, #DDDDDD for tertiary labels. The crimson #E01A33 is the only saturated hue in the system (~0.2% of pixels) — reserved exclusively for primary CTAs, the alert-ticker ribbon square, percentage numerals in the stat row, and small underline/dot accents. Gold (#DDC186-adjacent) is used only for eyebrow labels, never for buttons or body text. Borders use a near-white inset ring at 70% opacity (`oklab(0.949045 -0.0000615716 0.00416207 / 0.7) 0px 0px 0px 1px inset`) rather than a visible stroke color — cards are edge-lit, not outlined. Nothing else carries color: icons, dividers, and secondary buttons stay monochrome white/gray, keeping crimson legible as the single call-to-action signal.

## Typography
Inter is the only family in the system, doing all work through weight and size rather than family-switching — there is no serif or mono accent face; data panels imitate monospace visually through letter-spaced dot-grid backgrounds and tabular ticker text, not an actual monospace font. Display headline is 60px/800 at -1.2px tracking, used once per hero for a two-line, two-color (white/crimson) statement. Section headlines drop to 36px/800 at -0.7px tracking. A 24px/800 label token marks card titles inside the solution and problem grids. Body copy runs 20px for lead sentences under headlines and 16px for dense card text, both weight 400 at generous 1.4–1.5 line-height against the dark field. Eyebrow labels are small, bold, wide-tracked caps in the gold tone, sitting above every headline as the section's signature marker.

## Layout
Content is capped at 1536px max-width with 96px section padding and 51px inter-section gaps, giving each band clear air despite the dense card content. Card grids favor 3-across (32px gap, full-width equal thirds) for the problem-statement row and the platform/solution row (two stacked rows of 3), and 4-across (48px/32px gap) for the stat row and footer link columns. The nav-adjacent product panels and problem/proof cards run edge-to-edge full-width singles (100% rows) rather than grid items. Card radius is a tight 6px with 24px/20px padding — a squared-off, document-like density rather than plush spacious cards. The grid is fixed-column at this breakpoint (no auto-fit) and collapses conventionally on narrower viewports; density stays high throughout, with ruled dividers (thin bottom borders) separating card title from body rather than shadow-elevation.

## Components
- **Navbar**: edge-to-edge square bar, 146px tall (includes a slim announcement strip above the 80px-ish main row), 0px radius on all four corners, sticky, transparent background over the hero gradient. 16 total nav items across a logo mark, ~6 dropdown menu groups, a locale/globe control, a search icon, a "Login" utility link, an outlined "Contact us" button, and the filled crimson CTA (#E01A33, white text, 4px radius, 48px height, 12px/12px/12px/16px padding, hover darkens to #751323).
- **Hero primary button**: an observed near-white-adjacent pill sits as secondary in this instance — but the true primary here is the filled crimson pill "Learn more"-style button: #E01A33 fill, white text, full pill radius (100px), 50px height, zero internal padding beyond centered label, resting shadow `rgba(0,0,0,0.2) 0px 4px 8px 0px`. Beside it, a secondary hero button is a transparent/outline rectangle with a thin light border, square-ish 4px corners, same 48–50px height — this is the outline variant, not a second primary.
- **Nav ghost buttons**: transparent fill, white text, 4px radius, 24px height, no padding, used for the small utility links ("Login" style); hover fades text to #C6C5C5.
- **Footer text-links**: transparent, white text, 0px radius (plain links), 24px height — three-plus columns of these make up the footer link matrix.
- **Media/device panel**: one large full-bleed panel directly under the hero, inverted navy fill (#070A20), 0px radius, containing a dot/glyph texture background and an embedded video-style play control — spans near-full content width as a single 100%-width row.
- **Logo strip**: a horizontal row of ~7 grayscale/full-color partner marks on the #0A0F2B surface band, centered under a small caps label; no card chrome, just evenly spaced logo lockups.
- **Problem card triptych**: 3 cards in one row (32/32/32 split), transparent fill, 0px radius, each holding a bold white sub-heading and a gray 16px body paragraph — no icon, no border chrome beyond the shared inset ring.
- **Proof/chat panel**: a two-column band — left is eyebrow + headline + crimson pill CTA; right is a single dark chat-style card (#070A20-ish, 0px radius) showing a simulated conversational UI with checkbox rows, chip confirmations, and an input bar; full-width single-row (100%) card.
- **Alert ticker**: a full-bleed horizontal marquee band beneath the proof panel, carrying small severity chips (amber "HIGH", red "CRITICAL") followed by monospace-flavored alert text, scrolling continuously left-to-right.
- **Stat/numeral row**: 4 cards in one row (23/23/23/23), transparent, 0px radius, each stacked top-to-bottom as partner logo mark → oversized numeral (white number + crimson "%") → gray descriptor sentence → a small "Learn more" arrow-link; thin vertical rule dividers separate the four.
- **Platform/solution card grid**: 6 cards in two rows of 3 (100% width panels reflow to thirds), #070A20 fill, 0px radius, inset-ring border, each with a gold caps eyebrow, bold white sub-heading, gray body sentence, a thin horizontal rule, and a "Learn more" arrow-link — a document-tile pattern repeated identically across both rows.
- **Footer**: background #0A0F2B, 0px radius throughout, logo + 4 social icon chips top-left, a crimson outline "Contact us" button, then 4–5 columns of plain text links (99 total), a bottom bar with an event callout and legal links.

## Graphics & Effects
The hero gradient is a dark teal-navy wash (`#000018`→`#001830`→`#181848` family per pixel field) confined to the hero viewport only — it does not repeat lower on the page, which returns to flat #000018/#070A20 immediately after the first fold. The embedded product panel carries a fine dot/glyph pattern texture (small "T"-glyph dot-grid) at low opacity over its navy fill, giving a technical, radar-like surface rather than a photographic image. Cards use an inset hairline border for edge definition (`oklab(0.949045 -0.0000615716 0.00416207 / 0.7) 0px 0px 0px 1px inset`) instead of drop shadows — elevation is implied by fill-contrast against the near-black page, not by cast shadow, except the hero CTA pill which carries a soft `rgba(0,0,0,0.2) 0px 4px 8px 0px` shadow. A `blur(8px)` backdrop-filter is available for glass-style overlays (search/utility panels in the nav). The alert ticker is a live marquee surface (via `trustbar-marquee` / `marquee-scroll` keyframes), not a static strip — its default rebuild stand-in should be a horizontally looping row of severity-tagged text chips.

## Motion
Interactive color/background transitions run fast and uniform: 0.15s–0.3s `cubic-bezier(0.4, 0, 0.2, 1)` on color, background-color, border-color, and gradient-stop properties — covering hover states on buttons and links. Transform-based interactions (press/scale) use a snappier 0.15s on the same easing curve. Looping elements use dedicated keyframes: `trustbar-marquee` and `trustbar-marquee-reverse` drive the logo strip and alert ticker in opposite directions, `trustbar-logo-fade-in` staggers logo entrance, and `spin`/`marquee`/`marquee-scroll` cover loading and secondary scrolling-content needs. The overall motion character is utilitarian and continuous (ticking marquees, fast hover fades) rather than springy or bouncy — nothing overshoots.

## Guardrails
- Never render the hero as a full-frame saturated gradient — the teal-navy wash is confined to the hero band only; everything below returns to flat near-black.
- Never give card corners more than 6px radius — this system is square/document-like, not soft or bento-rounded; reserve full pill radius (100px/9999px) strictly for the hero primary CTA and nav CTA family.
- Never substitute the nav's glass/ghost button styling for the hero primary — the hero primary is the solid crimson pill with shadow, not a transparent or outline variant.
- Keep crimson confined to CTAs, numerals, and alert chips — do not tint backgrounds, icons, or body text with it.
- Preserve the edge-to-edge, 0-radius, transparent-background navbar exactly — do not convert it into an inset, floating, or rounded-capsule bar.
- Keep card definition to inset hairline borders, not drop shadows, except on the two pill buttons and any explicitly glass panel.