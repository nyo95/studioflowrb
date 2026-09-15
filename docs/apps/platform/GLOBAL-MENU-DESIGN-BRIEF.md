# Global Menu Design Brief

Status: design input, not a final design decision.
Created: 2026-09-16.

This brief records owner feedback about the global app menu and settings entry
points. It should guide the next design pass, but it does not lock the final
layout, hierarchy, copy, spacing, or component treatment.

## Observed UI

The current top navigation shows app destinations as text links:

- Master Data
- Bill of Quantity
- StudioFlow
- account menu

The selected app is visually emphasized in the top bar. The account menu also
currently exposes settings-related destinations separately.

## Design Problem

The global menu needs a clearer home in the interface. It should support
switching between major applications without competing with app-specific
sidebars, page-level actions, or the account/settings area.

The design pass should avoid treating the current top-row placement as already
approved. It is only the current implementation.

## Options To Explore

### Option A — Keep global app switcher in the top bar

Use the top bar as the permanent global app switcher, with the current app
clearly selected.

Potential strengths:

- Fast cross-app switching on desktop.
- Existing mental model is visible.
- Keeps app switching separate from each app's left sidebar.

Risks to resolve:

- Top bar can become crowded as apps/settings grow.
- Text tabs may compete with page-level title and actions.
- Mobile treatment needs a compact version.

Open design questions:

- Should app labels remain full text, or collapse into an app switcher at
  narrower widths?
- Should settings appear as a global app destination, or stay behind the
  account/settings entry?
- How many apps can fit before this pattern breaks?

### Option B — Replace app links with one app switcher control

Show the current app name near the brand/logo and open a dropdown or command
menu for switching apps.

Potential strengths:

- Top bar stays cleaner.
- Scales better when more apps are added.
- Keeps only one visible active app label.

Risks to resolve:

- Switching apps becomes one click deeper.
- Discoverability may be lower for users who often move between apps.
- The dropdown needs clear grouping if global settings also lives there.

Open design questions:

- Should the switcher sit beside the logo or beside the page title?
- Should it include app descriptions, recent pages, or only app names?
- Should global settings be listed in the same menu or remain separate?

### Option C — Put global app navigation in a collapsible rail

Use a slim global rail for app-level destinations, then keep each app's sidebar
for local sections such as Today, Projects, Clients, or Settings.

Potential strengths:

- Clear separation between global app navigation and app-local navigation.
- Scales better than horizontal text links.
- Keeps app context visible while preserving a top bar for account/actions.

Risks to resolve:

- Adds another navigation region.
- Can feel heavy for a compact operational tool.
- Needs careful mobile behavior.

Open design questions:

- Is a global rail worth the added structure for the current app count?
- Should the app rail show icons only, text labels, or progressive disclosure?
- How does the active app rail interact with the app-specific sidebar?

### Option D — Move app switching into a launcher/home pattern

Keep the top bar focused on current workspace/account and make app switching
primarily happen through a launcher, home page, or keyboard/search control.

Potential strengths:

- Cleanest day-to-day app surface.
- Avoids persistent navigation clutter.
- Can become powerful later if search/recent work is added.

Risks to resolve:

- Cross-app movement is less immediate.
- Users may miss visible app availability.
- Requires a strong launcher interaction to avoid feeling hidden.

Open design questions:

- Is cross-app switching frequent enough to require persistent controls?
- Should the launcher be command-style, tile-style, or both?
- What is the fallback for users without keyboard habits?

## Settings Relationship

This brief should be considered together with KB-031:

- Users and Roles & Access are part of Foundation/General Settings.
- The account menu should not become a long administration menu.
- A centralized settings canvas with one settings sidebar is preferred as the
  direction to explore, but the final presentation remains a design decision.

Possible account menu simplification for exploration:

- Account
- Settings
- Sign out

The exact labels and grouping should be decided during design, not assumed by
implementation.

## Decision Inputs Needed

Before implementation, the design pass should answer:

- Where should the global app switcher live on desktop?
- What does it become on mobile?
- Is app switching frequent enough to deserve persistent visible navigation?
- Should global settings be an app-level destination, account-menu destination,
  or both through different entry points?
- How should the active app be shown without making the top bar visually noisy?
- What is the maximum expected number of first-level apps in the near term?

## Non-Decisions

This document does not decide:

- final placement;
- final visual style;
- labels;
- icon choices;
- responsive breakpoints;
- whether the top bar, rail, or launcher is the winning pattern.

Those should be handled in the dedicated design pass.
