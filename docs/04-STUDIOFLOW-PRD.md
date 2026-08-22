# 04 — StudioFlow PRD

## Role
Main application for managing design projects and their operational workflow.

## Owns
- Project
- membership / project access context
- project phases/workflow
- tasks/activity/checklists
- deliverables
- project schedules
- project-specific extension state

## Master Data integration
The Library extension may read canonical Brand/Product information from Master Data through its public contract.

## Does not own
- canonical Brand identity
- canonical SKU identity
- supplier master
- global pricing
- BQ breakdown and estimator costing state

## MVP filter
Every legacy feature must prove it supports project execution. Convenience features that duplicate another app's ownership are candidates for purge or merge.
