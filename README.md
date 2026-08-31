# `@server/api-gateway` — GraphQL gateway

The **api-gateway** is the single GraphQL entry point for the whole platform.
It stitches the three domain services — **catalog-svc**, **cart-svc**, and
**user-svc** — into one schema so every microfrontend can talk to a single
`/graphql` endpoint instead of three. It is a NestJS application that serves an
**Apollo Server 4** instance on a stitched schema, and also publishes an
**OpenAPI** schema at `/api-docs` and an aggregate `/health` endpoint.

> **Package name is `@server/api-gateway`** — see `package.json`.
> **Status:** Faithful port of the reference `apps/api-gateway`, re-homed as a
> standalone, independently versioned repository.

## How stitching works

The three services are **plain (non-federation) GraphQL servers** — they expose
no `@key` / `_service` directives. The gateway therefore does **not** use
Apollo Federation (`@apollo/gateway` / `@apollo/subgraph` are not installed).
Instead it uses **introspection-based stitching**:

1. **Introspect** each service at startup with a standard
   `getIntrospectionQuery()` POST, then build a local schema with
   `buildClientSchema` (from `graphql`).
2. **Wrap** each client schema with `wrapSchema` (from `@graphql-tools/wrap`),
   supplying an `executor` built by `buildHTTPExecutor` (from
   `@graphql-tools/executor-http`) that delegates every field to the service's
   HTTP endpoint.
3. **Stitch** the wrapped schemas together with `stitchSchemas` (from
   `@graphql-tools/stitch`) into a single `GraphQLSchema`.
4. **Serve** that schema with `ApolloServer` + the `express4` adapter
   (`expressMiddleware`) mounted at `/graphql`.

This approach is service-agnostic: it only requires each service to expose a
standard introspectable GraphQL endpoint, and it needs no federation directives
on the services.

> **Why `buildHTTPExecutor`?** The `Executor` type in `@graphql-tools` is a
> generic function type. A hand-rolled `fetch`-based executor does not satisfy
> it (TS2322). `buildHTTPExecutor` returns a properly-typed
> `DisposableAsyncExecutor` that `SubschemaConfig.executor` accepts.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Gateway info (name, status, links). |
| `POST /graphql` | Stitched GraphQL endpoint (single entry point for all domains). |
| `GET /api-docs` | Swagger UI (OpenAPI). |
| `GET /health` | Aggregate health of the three upstream services. |

Default port: **4200** (override with `PORT`). This matches the shell's shared
Apollo client, which defaults to `http://localhost:4200/graphql`.

## GraphQL schema

The gateway exposes the **merged** schema — the union of the catalog, cart, and
user domains:

```graphql
type Query {
  # catalog
  products(input: ProductFilterInput): [Product!]!
  product(id: ID!): Product
  categories: [Category!]!
  # cart
  cart(cartId: ID!): Cart
  # user
  me: User
  orders: [Order!]!
}

type Mutation {
  # cart
  addItemToCart(cartId: ID!, input: AddItemInput!): Cart!
  updateCartItem(cartId: ID!, itemId: ID!, input: UpdateItemInput!): Cart!
  removeItemFromCart(cartId: ID!, itemId: ID!): Cart!
  clearCart(cartId: ID!): Cart!
  # user
  login(input: LoginInput!): User!
  updateProfile(input: UpdateProfileInput!): User!
}
```

The concrete field types (`Product`, `Cart`, `User`, `Money`, `DateTime`, …)
are resolved from the introspected service schemas at runtime.

## Upstream services

The gateway discovers its upstreams from the `GATEWAY_SERVICES` env var
(comma-separated list of endpoints) or falls back to the defaults:

| Service | Default endpoint |
| --- | --- |
| catalog-svc | `http://localhost:4001/graphql` |
| cart-svc | `http://localhost:4002/graphql` |
| user-svc | `http://localhost:4003/graphql` |

Override with, e.g.:

```bash
GATEWAY_SERVICES="http://localhost:4001/graphql,http://localhost:4002/graphql,http://localhost:4003/graphql"
```

## Aggregate health

`GET /health` (`src/app/health/health.controller.ts`) fans out to each
upstream service's `/health` endpoint (3s timeout each) and reports:

```json
{
  "status": "ok | degraded",
  "timestamp": "2026-08-28T00:00:00.000Z",
  "services": [
    { "service": "catalog-svc", "status": "up", "latencyMs": 12 },
    { "service": "cart-svc", "status": "up", "latencyMs": 9 },
    { "service": "user-svc", "status": "down", "latencyMs": 3000, "error": "..." }
  ]
}
```

`status` is `ok` when every upstream is up, `degraded` otherwise.

## Auth (JWT stub)

`src/app/auth/jwt.guard.ts` provides a `JwtGuard` stub. In production it would
verify an `Authorization: Bearer <token>` header; for the reference
architecture it accepts all requests so the gateway can be exercised without a
real auth provider.

## Consuming `@server/shared`

`app.module.ts` imports `AppConfigModule` and `SharedModule` from
`@server/shared`; `main.ts` applies the global `AllExceptionsFilter` and
`LoggingInterceptor`. This gives the gateway, for free:

- structured request logging
- a consistent error envelope for every exception

`@server/shared` is a **workspace dependency** (`workspace:*`). In this
standalone repo it resolves through the pnpm workspace link to
`server-shared/dist/index.js` (main) + `dist/index.d.ts` (types) — so
**`server-shared` must be built (`tsc` → `dist/`) before this repo is
typechecked, tested, or built**. CI does this automatically (see
`.github/workflows/ci.yml`).

## Stack

| Concern | Choice |
| --- | --- |
| Runtime | Node 22 LTS, CommonJS |
| Framework | NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `@nestjs/platform-express`, `@nestjs/swagger`) |
| GraphQL | Apollo Server 4 + `@graphql-tools/stitch` / `wrap` / `executor-http` |
| Build | `tsc` → `dist/` (CommonJS) |
| Tests | Jest + ts-jest |
| Lint | ESLint 9 (flat) + typescript-eslint |
| Types | TypeScript 5.9 |

## Repository layout

```
gateway/
├── .github/workflows/ci.yml   # lint → typecheck → test → build
├── .npmrc                     # @server → GitHub Packages
├── .nvmrc                     # Node 22
├── .env.example               # PORT, GATEWAY_SERVICES, …
├── eslint.config.mjs          # flat ESLint 9 config
├── jest.config.cts            # Jest + ts-jest
├── package.json               # @server/api-gateway (private)
├── tsconfig.json              # base compiler options
├── tsconfig.build.json        # build → dist/
├── tsconfig.spec.json         # test (Jest)
└── src/
    ├── main.ts                # bootstrap (Apollo + Swagger + /graphql)
    └── app/
        ├── app.module.ts
        ├── app.controller.ts
        ├── app.controller.spec.ts
        ├── auth/jwt.guard.ts
        ├── gateway/           # GatewayService (introspect + stitch)
        └── health/            # aggregate /health
```

## Build & run

```bash
pnpm install
pnpm build          # tsc → dist/
pnpm start          # node dist/main.js
pnpm dev            # tsx watch src/main.ts
pnpm test           # Jest
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
```

## Dependencies

The gateway declares (in `package.json`):

- `@apollo/server` — the GraphQL server (express4 adapter).
- `@graphql-tools/stitch` — merges the wrapped service schemas.
- `@graphql-tools/wrap` — wraps each client schema with a delegating executor.
- `@graphql-tools/executor-http` — `buildHTTPExecutor` for HTTP delegation.
- `graphql` — `buildClientSchema` / `getIntrospectionQuery` for introspection.
- `@nestjs/*` — the NestJS runtime (common, core, config, platform-express, swagger).
- `@server/shared` — shared config / logging / error filter (workspace dep).
