# 02 — UI Engine PRD

## Problem
Legacy `ui_engine` largely behaved as a design-token/design-system layer. The rebuild requires a reusable application UI engine.

## Purpose
Centralize visual primitives, interaction patterns, and reusable application layouts.

## Layers
1. Tokens — typography, spacing, radius, density, colors, rails.
2. Primitives — Button, Field, Table, Dialog, etc.
3. Components — reusable composite UI patterns.
4. Layout templates — workspace, catalog, editor, settings.
5. Navigation patterns — app shell, primary/secondary rails.

## Rule
Apps configure layouts and compose domain screens; apps do not fork base UI patterns without a documented exception.

## Ideal application

```text
tokens -> primitives -> reusable components -> interaction patterns -> layouts
                                                        |
                                                        +-> app screen composition
```

- Tokens are the only shared source for typography, color, spacing, radius, density, focus, and print behavior.
- Primitives own accessibility and base states.
- Components own reusable presentation such as directory tables, fields, status, feedback, and sections.
- Patterns own multi-step interaction such as combobox navigation, inline edit, confirmation, unsaved changes, file drop, and document presentation.
- Layouts own shell, rail, workspace, catalog, editor, settings, and overlays.
- Apps supply columns, domain copy, permissions, actions, validation messages, and workflow composition.

Promote an app-local pattern only after a second real consumer proves identical behavior. UI Engine must contain no StudioFlow, Master Data, or BQ vocabulary.

## UX baseline

Keyboard operation, focus return, accessible names, busy/error/empty/disabled states, narrow-screen behavior, and user-facing English copy are part of the contract. Visual consistency never replaces server permission or domain validation.

## MVP success
- common app shell comes from one place
- Master Data and BQ tables reuse the same table primitives
- layout behavior is template-driven rather than repeated page markup
- app surfaces remain recognizable as one platform without forcing all three apps into the same workflow density
