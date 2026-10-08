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
`createIntegrationRouteHandler`. A write must set `write: true`; the kit
authenticates, validates, stores/replays the response, audits the write, and
uses the standard safe envelope. Routes must not import Prisma or another
app's internals.
