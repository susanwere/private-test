import { useEffect, useRef, useState } from "react";

import {
  formatJobDate,
  isValidJobUrl,
  loadInitialPage,
  loadJobPage,
  mergeJobs,
  toJobDate,
  type Job,
} from "./job-api";

type Status = "loading" | "error" | "ready";

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { ids, page } = await loadInitialPage();
        if (cancelled) return;
        setJobIds(ids);
        setJobs(page.jobs);
        setNextIndex(page.nextIndex);
        setStatus("ready");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasMore = nextIndex < jobIds.length;

  const handleRetryInitial = async () => {
    setStatus("loading");
    try {
      const { ids, page } = await loadInitialPage();
      setJobIds(ids);
      setJobs(page.jobs);
      setNextIndex(page.nextIndex);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  const handleLoadMore = async () => {
    if (loadingMoreRef.current || isLoadingMore) return;
    if (nextIndex >= jobIds.length) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const startIndex = nextIndex;
    try {
      const page = await loadJobPage(jobIds, startIndex);
      setJobs((prev) => mergeJobs(prev, page.jobs));
      setNextIndex(page.nextIndex);
    } catch {
      // Preserve already loaded jobs and the cursor: retry re-fetches
      // the same page instead of skipping it.
      setLoadMoreError(
        "Failed to load more jobs. Check your connection and try again.",
      );
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  };

  return (
    <main className="jobs">
      <header className="jobs-header">
        <h1>Hacker News Jobs</h1>
        <p>Fresh job postings from Hacker News</p>
      </header>
      {status === "loading" && (
        <p className="jobs-status" role="status">
          Loading...
        </p>
      )}
      {status === "error" && (
        <div className="jobs-status jobs-error" role="alert">
          <p>Failed to load jobs. Please try again.</p>
          <button
            type="button"
            className="retry"
            onClick={() => void handleRetryInitial()}
          >
            Retry
          </button>
        </div>
      )}
      {status === "ready" && jobs.length === 0 && (
        <p className="jobs-status jobs-empty" role="status">
          No jobs found.
        </p>
      )}
      {status === "ready" && jobs.length > 0 && (
        <>
          <ul className="jobs-list" aria-busy={isLoadingMore}>
            {jobs.map((job) => (
              <li key={job.id} className="job-card">
                <h2>
                  {isValidJobUrl(job.url) ? (
                    <a href={job.url} target="_blank" rel="noopener noreferrer">
                      {job.title}
                    </a>
                  ) : (
                    job.title
                  )}
                </h2>
                <p className="job-meta">
                  <span>by {job.by}</span>
                  <time dateTime={toJobDate(job.time).toISOString()}>
                    {formatJobDate(job.time)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
          {isLoadingMore && (
            <p className="jobs-status" role="status">
              Loading more jobs...
            </p>
          )}
          {loadMoreError !== null && !isLoadingMore && (
            <div className="jobs-status jobs-error" role="alert">
              <p>{loadMoreError}</p>
              <button
                type="button"
                className="retry"
                onClick={() => void handleLoadMore()}
              >
                Retry
              </button>
            </div>
          )}
          {hasMore && loadMoreError === null && (
            <button
              type="button"
              className="load-more"
              onClick={() => void handleLoadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
