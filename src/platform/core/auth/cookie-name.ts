/**
 * The locked session cookie name. Kept dependency-free so Next.js proxy
 * configuration can import the same constant without pulling in
 * request-bound modules.
 */
export const SESSION_COOKIE_NAME = "studioflow_session";
