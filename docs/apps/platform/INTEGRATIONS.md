# Platform integrations

Native companion clients use `Authorization: Bearer sfk_<prefix>_<secret>` at
`/api/integrations/v1`. A secret is shown once when its owner creates it; only
its SHA-256 digest is stored. Every request is evaluated using the owner's live
roles, the token's scopes, and the route's declared grant.

`GET /api/integrations/v1/ping` is the reference endpoint. It needs scope
`integration:ping` and grant `platform.integration.ping`. `POST` to the same
path requires `Idempotency-Key` and demonstrates safe replay.

To add an endpoint, define its app-owned wire schema, declare one scope and its
matching RBAC grant, then export a thin route using
`createIntegrationRouteHandler`. A write must set `write: true`; its handler
receives the open `transaction` client and must perform every extension write
with that client. The kit then commits the extension write, replay record, and
audit together (or rolls all three back). Successful and deterministic client
error responses are replayable; server failures are deliberately not retained
so the same key can be retried. Routes must not import Prisma or another app's
internals.

Request bodies are limited to 1 MiB before JSON parsing. A route with a known
larger contract, such as a future SketchUp snapshot, must explicitly set its
own `bodyLimitBytes` when it is introduced.
