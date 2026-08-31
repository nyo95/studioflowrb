import type { AppPermissionRegistrationInput } from "@platform/core/rbac/registry";

/**
 * App registrations for the platform permission registry and app launcher
 * (CORE.md §3/§4, Foundation F0 deferred registry: "app registry/launcher —
 * ADD NOW; registrations contain metadata/routes, not permissions policy").
 *
 * This composition root lives OUTSIDE platform on purpose: platform never
 * imports app code. Each app owns its permission vocabulary in its public
 * boundary; this file only hands the platform registry the already-public
 * lists plus launcher metadata.
 */
export const APP_REGISTRATIONS: readonly AppPermissionRegistrationInput[] = [];
