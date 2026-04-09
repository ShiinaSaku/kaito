import { GitHubFetcher } from "../dist/index.mjs";

async function main() {
  process.loadEnvFile?.();

  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;

  if (!token) {
    throw new Error(
      "Missing token. Set GITHUB_TOKEN (or GH_TOKEN), or run Node with --env-file=.env",
    );
  }

  const fetcher = new GitHubFetcher(token, {
    ttl: 60_000,
    staleTtl: 300_000,
  });

  const data = await fetcher.query("query { viewer { login name } }");

  console.log({
    login: data.viewer.login,
    name: data.viewer.name,
  });
}

void main();
