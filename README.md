# Kaito

Kaito is a high-performance, runtime-agnostic GitHub GraphQL fetcher with built-in stale-while-revalidate caching.

It is designed for modern JavaScript runtimes and serverless environments where low latency, predictable caching, and portable fetch behavior matter.

## Highlights

- Runtime-agnostic transport powered by ofetch
- Built-in SWR caching with unstorage
- Deterministic cache keys using stable serialization plus FNV-1a hashing
- Generic query API with strong TypeScript inference
- In-flight deduplication for concurrent identical requests
- Pluggable storage and request layers

## Runtime Compatibility

Kaito is intended to work across:

- Bun
- Node.js
- Cloudflare Workers
- Vercel Edge

## Installation

Add Kaito to your project with your package manager of choice:

```bash
npm install @shiinasaku/kaito
```

```bash
pnpm add @shiinasaku/kaito
```

```bash
yarn add @shiinasaku/kaito
```

```bash
bun add @shiinasaku/kaito
```

For local development in this repository:

```bash
npm install
```

```bash
pnpm install
```

```bash
yarn install
```

```bash
bun install
```

## Quick Start

```ts
import { GitHubFetcher } from "@shiinasaku/kaito";

const fetcher = new GitHubFetcher(process.env.GITHUB_TOKEN ?? "", {
  ttl: 60_000,
  staleTtl: 300_000,
});

const data = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");

console.log(data.viewer.login);
```

## Example

This repository includes a runnable example:

- [examples/basic.mjs](examples/basic.mjs)
- [examples/cache.mjs](examples/cache.mjs)

Run it after building:

```bash
npm run build
GITHUB_TOKEN=your_token_here node examples/basic.mjs
```

```bash
npm run build
node --env-file=.env examples/basic.mjs
```

```bash
pnpm run build
GITHUB_TOKEN=your_token_here node examples/basic.mjs
```

```bash
yarn build
GITHUB_TOKEN=your_token_here node examples/basic.mjs
```

```bash
bun run build
GITHUB_TOKEN=your_token_here node examples/basic.mjs
```

You can set either GITHUB_TOKEN or GH_TOKEN.

Run the cache behavior demo:

```bash
npm run build
node --env-file=.env examples/cache.mjs
```

## SWR Behavior

Kaito follows a stale-while-revalidate strategy:

- Fresh cache: returns cached value immediately
- Stale cache: returns stale value immediately and refreshes in background
- Expired or missing cache: blocks until fresh data is fetched

## API

### GitHubFetcher

```ts
new GitHubFetcher(token: string, options?: GitHubFetcherOptions)
```

### GitHubFetcherOptions

```ts
interface GitHubFetcherOptions {
  ttl?: number;
  staleTtl?: number;
  storage?: Storage;
  cachePrefix?: string;
  ofetch?: FetchOptions<"json">;
  fetch?: typeof globalThis.fetch;
  request?: <T>(request: string, options: FetchOptions<"json">) => Promise<T>;
}
```

- ttl: freshness window in milliseconds, default 60000
- staleTtl: stale serving window in milliseconds after ttl, default 300000
- storage: custom unstorage instance, defaults to in-memory storage
- cachePrefix: namespace for cache keys, default github-fetcher
- ofetch: additional ofetch options for the internal client
- fetch: custom fetch implementation for runtime control
- request: custom request function, useful for advanced integration or testing

### query<T>

```ts
query<T>(gql: string, variables?: Record<string, unknown>): Promise<T>
```

- gql: GraphQL query string
- variables: optional GraphQL variables object
- returns: typed response data

## Custom Storage Example

```ts
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { GitHubFetcher } from "@shiinasaku/kaito";

const storage = createStorage({ driver: memoryDriver() });

const fetcher = new GitHubFetcher("your-token", {
  storage,
  ttl: 30_000,
  staleTtl: 120_000,
});
```

## Development

Run checks:

```bash
vp check
```

Run tests:

```bash
vp test
```

Build the library:

```bash
vp pack
```

## License

MIT
