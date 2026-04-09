import { GitHubFetcher } from "../src/index.ts";

async function main() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  if (!token) {
    throw new Error("Missing token. Set GITHUB_TOKEN (or GH_TOKEN)");
  }

  const fetcher = new GitHubFetcher(token, {
    ttl: 60_000,
    staleTtl: 300_000,
  });

  const data = await fetcher.query<{ viewer: { login: string; name: string | null } }>(
    "query Viewer($includeName: Boolean!) { viewer { login name @include(if: $includeName) } }",
    { includeName: true },
  );

  console.log({
    login: data.viewer.login,
    name: data.viewer.name,
  });
}

void main();
