import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { GitHubFetcher } from "../src/index.ts";

describe("GitHubFetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns fresh cache without refetch", async () => {
    const requestMock = vi.fn().mockResolvedValue({ data: { viewer: { login: "alpha" } } });

    const fetcher = new GitHubFetcher("token", {
      ttl: 1_000,
      staleTtl: 5_000,
      request: requestMock,
    });

    const first = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");
    const second = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");

    expect(first.viewer.login).toBe("alpha");
    expect(second.viewer.login).toBe("alpha");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  test("serves stale value and revalidates in background", async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { viewer: { login: "alpha" } } })
      .mockResolvedValueOnce({ data: { viewer: { login: "beta" } } });

    const fetcher = new GitHubFetcher("token", {
      ttl: 1,
      staleTtl: 10_000,
      request: requestMock,
    });

    const first = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");
    await wait(5);

    const second = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");
    await Promise.resolve();
    await Promise.resolve();

    const third = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");

    expect(first.viewer.login).toBe("alpha");
    expect(second.viewer.login).toBe("alpha");
    expect(third.viewer.login).toBe("beta");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  test("blocks and refetches when stale window has elapsed", async () => {
    const requestMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { viewer: { login: "alpha" } } })
      .mockResolvedValueOnce({ data: { viewer: { login: "gamma" } } });

    const fetcher = new GitHubFetcher("token", {
      ttl: 1,
      staleTtl: 1,
      request: requestMock,
    });

    const first = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");
    await wait(10);

    const second = await fetcher.query<{ viewer: { login: string } }>("query { viewer { login } }");

    expect(first.viewer.login).toBe("alpha");
    expect(second.viewer.login).toBe("gamma");
    expect(requestMock).toHaveBeenCalledTimes(2);
  });
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
