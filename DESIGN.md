# DESIGN.md - VOIDWEAR Demo Store

## Context (from discovery)

- Artifact type: ecommerce demo store
- Positioning: creative, utilitarian streetwear
- Audience: influencers and prospective barter clients reviewing a clothing-store demo | Primary action: explore a product and add it to the demo cart
- Adjectives: stark, urban, direct, kinetic
- Visual word translations: stark -> monochrome contrast and hard outlines; urban -> concrete photography and compressed labels; direct -> compact store controls and plain calls to action; kinetic -> rails, scan lines, and transform-only feedback
- Aesthetic essence: monochrome, brutal, streetwear
- Single-minded proposition: this should feel like a credible independent Ukrainian streetwear storefront, not a generic ecommerce template
- Mode: light content field with black navigation and dark delivery block | Density: balanced
- Constraints: preserve the approved screenshot-led visual system; support complete RU and EN text without clipping on mobile; demo checkout only

## Aesthetic

- Direction: monochrome brutalist streetwear
- Defining trait: hard black rules and rectangular controls structure every section
- Signature move: moving typography rails and scan-grid hero treatment

## Typography

- Display and body: existing heavy sans system retained to match the approved reference screens
- Scale: compact metadata, oversized hero and section display; mobile uses explicit breakpoints rather than viewport-scaled body text

## Color

- Strategy: grayscale only, preserving the storefront's high-contrast identity
- Palette: bg `oklch(1 0 0)` | `#fff`; surface `oklch(.96 0 0)` | `#f4f4f4`; fg `oklch(.02 0 0)` | `#050505`; muted `oklch(.5 0 0)` | `#646464`; border `oklch(.07 0 0)` | `#111`

## Spacing, radius, shadow

- Spacing base: 4px
- Radius: 0px except the cart count badge
- Shadow approach: defined edges and only functional overlay elevation

## Layout and composition

- Grid: responsive product grid, one column on mobile
- Responsive: mobile-first overrides under 640px; language control keeps a fixed-width column so navigation labels wrap instead of shrinking

## Components and states

- Navigation: hover rail, visible keyboard focus, pointer cursor
- Language control: two-button segmented control with `aria-pressed` state and persistent selection
- Product size: selectable buttons with visible active state
- Cart: translated product rows, selected size, quantity, and total

## Motion

- Motion uses transform and opacity under 220ms for controls; continuous hero rails remain decorative
- Reduced motion disables transitions and animations

## Accessibility

- Keyboard operability: links, buttons, language switch, size controls, modal and cart controls
- Language switch uses semantic buttons and `aria-pressed`
- Text does not rely on color alone: selected language and size also have state semantics

## Slop audit

- Date: 2026-07-23 | Result: pass
- Notes: kept the original monochrome brutalist direction, avoided rounded SaaS toggles and generic colored language menus, preserved readable mobile wrapping.

## Changelog

- 2026-07-23: documented the existing storefront system and added RU/EN localization constraints.
