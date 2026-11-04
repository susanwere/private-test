// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { isValidJobUrl, JOBSTORIES_URL, loadJobPage } from "./job-api";

const jobIds = Array.from({ length: 8 }, (_, index) => index + 1);
function posting(id: number) {
  return {
    id,
    title: `Job ${id}`,
    by: `poster${id}`,
    time: 1700000000,
    url: `https://example.com/jobs/${id}`,
  };
}
function jsonResponse(contents: unknown) {
  return new Response(JSON.stringify(contents), { status: 200 });
}
function installFetch(
  options: {
    failInitial?: boolean;
    failPageOnce?: boolean;
    missingUrl?: boolean;
  } = {},
) {
  let initialFailed = false;
  let pageFailed = false;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === JOBSTORIES_URL) {
      if (options.failInitial && !initialFailed) {
        initialFailed = true;
        throw new Error("Temporary network error");
      }
      return jsonResponse(jobIds);
    }
    const id = Number(/item\/(\d+)\.json$/.exec(url)?.[1]);
    if (id === 7 && options.failPageOnce && !pageFailed) {
      pageFailed = true;
      throw new Error("Temporary detail failure");
    }
    return jsonResponse(
      options.missingUrl && id === 2
        ? { ...posting(id), url: "javascript:alert(1)" }
        : posting(id),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("accessible interactions and resilient states", () => {
  it("renders only HTTP(S) URLs as safe external title links", async () => {
    installFetch({ missingUrl: true });
    render(<App />);
    const link = await screen.findByRole("link", { name: "Job 1" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("link", { name: "Job 2" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Job 2" })).toBeTruthy();
    for (const invalid of [
      "",
      "/relative",
      "javascript:alert(1)",
      "file:///tmp/file",
      "ftp://example.com",
    ]) {
      expect(isValidJobUrl(invalid)).toBe(false);
    }
    expect(isValidJobUrl("https://example.com/jobs")).toBe(true);
  });

  it("supports keyboard focus and Enter activation and hides the final-page button", async () => {
    installFetch();
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Job 1" });
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("link", { name: "Job 1" }),
    );
    for (let index = 0; index < 6; index++) await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Load more" }),
    );
    await user.keyboard("{Enter}");
    await screen.findByRole("link", { name: "Job 8" });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("announces initial loading and errors and retries the ID request", async () => {
    const fetchMock = installFetch({ failInitial: true });
    render(<App />);
    expect(screen.getByRole("status").textContent).toContain("Loading...");
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert")).toBeTruthy();
    await userEvent.setup().click(retry);
    await screen.findByRole("link", { name: "Job 6" });
    expect(
      fetchMock.mock.calls.filter(([input]) => input === JOBSTORIES_URL),
    ).toHaveLength(2);
  });

  it("retains existing jobs and retries the same page after a mixed detail failure", async () => {
    const fetchMock = installFetch({ failPageOnce: true });
    render(<App />);
    await screen.findByRole("link", { name: "Job 6" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    await user.click(retry);
    await screen.findByRole("link", { name: "Job 8" });
    expect(
      screen
        .getAllByRole("listitem")
        .map((item) => item.querySelector("h2")?.textContent),
    ).toEqual(jobIds.map((id) => `Job ${id}`));
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/item/7.json"),
      ),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("disables pagination and announces loading while details are pending", async () => {
    const fetchMock = installFetch();
    render(<App />);
    await screen.findByRole("link", { name: "Job 6" });
    let resolveDetails: (response: Response) => void = () => {
      throw new Error("No pending request");
    };
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveDetails = resolve;
        }),
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Load more" }));
    expect(
      (screen.getByRole("button", { name: "Loading..." }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Loading more jobs",
    );
    expect(screen.getByRole("list").getAttribute("aria-busy")).toBe("true");
    resolveDetails(jsonResponse(posting(7)));
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(8),
    );
  });

  it("issues no detail requests once the cursor is exhausted", async () => {
    const fetchMock = installFetch();
    expect(await loadJobPage([1, 2], 2, fetchMock)).toEqual({
      jobs: [],
      nextIndex: 2,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
