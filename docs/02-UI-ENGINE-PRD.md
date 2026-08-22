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

## MVP success
- common app shell comes from one place
- Master Data and BQ tables reuse the same table primitives
- layout behavior is template-driven rather than repeated page markup
