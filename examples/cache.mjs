import { $fetch } from "ofetch";
import { GitHubFetcher } from "../dist/index.mjs";

function nowMs() {
  return Number(performance.now().toFixed(2));
}

function elapsed(start) {
  return Number((performance.now() - start).toFixed(2));
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  process.loadEnvFile?.();

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      "Missing token. Set GITHUB_TOKEN (or GH_TOKEN), or run Node with --env-file=.env",
    );
  }

  let networkCalls = 0;

  const fetcher = new GitHubFetcher(token, {
    ttl: 1_000,
    staleTtl: 15_000,
    request: async (request, options) => {
      networkCalls += 1;
      return $fetch(request, {
        retry: false,
        ...options,
      });
    },
  });

  const query = "query { viewer { login } }";

  const t1 = nowMs();
  const firstStart = performance.now();
  const first = await fetcher.query(query);
  console.log({
    step: "first",
    login: first.viewer.login,
    elapsedMs: elapsed(firstStart),
    networkCalls,
    atMs: t1,
  });

  const t2 = nowMs();
  const secondStart = performance.now();
  const second = await fetcher.query(query);
  console.log({
    step: "second",
    login: second.viewer.login,
    elapsedMs: elapsed(secondStart),
    networkCalls,
    atMs: t2,
  });

  await wait(1_200);

  const t3 = nowMs();
  const thirdStart = performance.now();
  const third = await fetcher.query(query);
  console.log({
    step: "third-stale",
    login: third.viewer.login,
    elapsedMs: elapsed(thirdStart),
    networkCalls,
    atMs: t3,
  });

  await wait(200);

  console.log({
    step: "after-background-refresh",
    networkCalls,
  });
}

void main();
