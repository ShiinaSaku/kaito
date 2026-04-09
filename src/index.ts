import { $fetch, type FetchOptions } from "ofetch";
import { createStorage, type Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";

export interface GitHubFetcherOptions {
  ttl?: number;
  staleTtl?: number;
  storage?: Storage;
  cachePrefix?: string;
  ofetch?: FetchOptions<"json">;
  fetch?: typeof globalThis.fetch;
  request?: <T>(request: string, options: FetchOptions<"json">) => Promise<T>;
}

interface GitHubGraphQLError {
  message: string;
}

interface GitHubGraphQLResponse<T> {
  data?: T;
  errors?: GitHubGraphQLError[];
}

interface CacheEnvelope<T> {
  freshUntil: number;
  staleUntil: number;
  value: T;
}

type Variables = Record<string, unknown> | undefined;

export class GitHubFetcher {
  private readonly token: string;
  private readonly ttl: number;
  private readonly staleTtl: number;
  private readonly storage: Storage;
  private readonly cachePrefix: string;
  private readonly client: ReturnType<typeof $fetch.create>;
  private readonly requester: <T>(request: string, options: FetchOptions<"json">) => Promise<T>;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(token: string, options: GitHubFetcherOptions = {}) {
    if (!token.trim()) {
      throw new Error("GitHub token is required");
    }

    this.token = token;
    this.ttl = options.ttl ?? 60_000;
    this.staleTtl = options.staleTtl ?? 300_000;
    this.storage = options.storage ?? createStorage({ driver: memoryDriver() });
    this.cachePrefix = options.cachePrefix ?? "github-fetcher";
    this.client = $fetch.create(
      {
        retry: 2,
        retryDelay: 250,
        ...options.ofetch,
      } as FetchOptions,
      options.fetch ? { fetch: options.fetch } : {},
    );
    this.requester =
      options.request ?? ((request, requestOptions) => this.client(request, requestOptions));
  }

  async query<T>(gql: string, variables?: Variables): Promise<T> {
    if (!gql.trim()) {
      throw new Error("GraphQL query is required");
    }

    const payload = {
      query: gql,
      variables: variables ?? {},
    };

    const key = this.cacheKey(payload);
    const now = Date.now();
    const cached = await this.readCache<T>(key);

    if (cached && now < cached.freshUntil) {
      return cached.value;
    }

    if (cached && now < cached.staleUntil) {
      this.refreshInBackground<T>(key, payload);
      return cached.value;
    }

    return this.fetchAndCache<T>(key, payload);
  }

  private refreshInBackground<T>(key: string, payload: { query: string; variables: Variables }) {
    if (this.inflight.has(key)) {
      return;
    }

    const job = this.fetchAndCache<T>(key, payload);
    void job.catch(() => undefined);
  }

  private async fetchAndCache<T>(
    key: string,
    payload: { query: string; variables: Variables },
  ): Promise<T> {
    const active = this.inflight.get(key) as Promise<T> | undefined;
    if (active) {
      return active;
    }

    const job = (async () => {
      const data = await this.fetchFromGitHub<T>(payload);
      await this.writeCache(key, data);
      return data;
    })().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, job as Promise<unknown>);
    return job;
  }

  private async fetchFromGitHub<T>(payload: { query: string; variables: Variables }): Promise<T> {
    const headers = mergeHeaders({
      authorization: `Bearer ${this.token}`,
      "content-type": "application/json",
      accept: "application/json",
    });

    const response = await this.requester<GitHubGraphQLResponse<T>>(
      "https://api.github.com/graphql",
      {
        method: "POST",
        headers,
        body: payload,
      },
    );

    if (response.errors && response.errors.length > 0) {
      throw new Error(response.errors.map((entry) => entry.message).join("; "));
    }

    if (typeof response.data === "undefined") {
      throw new Error("GitHub GraphQL response did not include data");
    }

    return response.data;
  }

  private cacheKey(payload: { query: string; variables: Variables }): string {
    const normalized = stableStringify(payload);
    return `${this.cachePrefix}:${fnv1a(normalized)}`;
  }

  private async readCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
    const parsed = await this.storage.getItem<CacheEnvelope<T>>(key);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    if (typeof parsed.freshUntil !== "number" || typeof parsed.staleUntil !== "number") {
      return null;
    }

    return parsed;
  }

  private async writeCache<T>(key: string, value: T): Promise<void> {
    const now = Date.now();
    const entry: CacheEnvelope<T> = {
      freshUntil: now + this.ttl,
      staleUntil: now + this.ttl + this.staleTtl,
      value,
    };

    await this.storage.setItem(key, entry);
  }
}

function stableStringify(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function mergeHeaders(...inputs: Array<unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const input of inputs) {
    if (!input) {
      continue;
    }

    if (Array.isArray(input)) {
      for (const entry of input) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const value = normalizeHeaderValue(entry[1]);
          if (value !== null) {
            headers[String(entry[0]).toLowerCase()] = value;
          }
        }
      }
      continue;
    }

    if (typeof input === "object") {
      const maybeEntries = input as {
        entries?: () => IterableIterator<[unknown, unknown]>;
      };
      if (typeof maybeEntries.entries === "function") {
        for (const [key, value] of maybeEntries.entries()) {
          const normalized = normalizeHeaderValue(value);
          if (normalized !== null) {
            headers[String(key).toLowerCase()] = normalized;
          }
        }
        continue;
      }

      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        const normalized = normalizeHeaderValue(value);
        if (normalized !== null) {
          headers[key.toLowerCase()] = normalized;
        }
      }
    }
  }
  return headers;
}

function normalizeHeaderValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return `${value}`;
  }

  return null;
}
