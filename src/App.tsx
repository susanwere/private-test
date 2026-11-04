import { useEffect, useRef, useState } from 'react';

const JOB_STORIES_URL =
  'https://hacker-news.firebaseio.com/v0/jobstories.json';
const PAGE_SIZE = 6;

interface JobPosting {
  id: number;
  title: string;
  by: string;
  time: number;
  url?: string;
}

function itemUrl(id: number): string {
  return `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
}

function isValidJobPosting(value: unknown): value is JobPosting {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record['deleted'] === true) return false;
  if (typeof record['id'] !== 'number' || !Number.isInteger(record['id'])) {
    return false;
  }
  if (typeof record['title'] !== 'string' || record['title'].length === 0) {
    return false;
  }
  if (typeof record['by'] !== 'string' || record['by'].length === 0) {
    return false;
  }
  if (typeof record['time'] !== 'number' || !Number.isFinite(record['time'])) {
    return false;
  }
  return true;
}

function getValidJobUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function formatPostingDate(timeSeconds: number): string {
  return new Date(timeSeconds * 1000).toLocaleDateString();
}

async function fetchJobIds(): Promise<number[]> {
  const response = await fetch(JOB_STORIES_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch job stories: ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data.filter(
    (item): item is number =>
      typeof item === 'number' && Number.isInteger(item),
  );
}

type JobItemResult =
  | { kind: 'ok'; job: JobPosting }
  | { kind: 'skip' }
  | { kind: 'error' };

async function fetchJobItemResult(id: number): Promise<JobItemResult> {
  try {
    const response = await fetch(itemUrl(id));
    if (!response.ok) return { kind: 'error' };
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return { kind: 'error' };
    }
    if (!isValidJobPosting(data)) return { kind: 'skip' };
    return { kind: 'ok', job: data };
  } catch {
    return { kind: 'error' };
  }
}

type Status = 'loading' | 'error' | 'ready';

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadingMoreRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      let ids: number[];
      try {
        ids = await fetchJobIds();
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }
      const initial: JobPosting[] = [];
      let cursor = 0;
      let failed = false;
      while (cursor < ids.length && initial.length < PAGE_SIZE) {
        const result = await fetchJobItemResult(ids[cursor]);
        if (result.kind === 'error') {
          failed = true;
          break;
        }
        cursor += 1;
        if (result.kind === 'ok') initial.push(result.job);
      }
      if (cancelled) return;
      setJobIds(ids);
      if (failed) {
        setJobs([]);
        setNextIndex(0);
        setPageError('Failed to load job postings. Please try again.');
        setStatus('ready');
      } else {
        setJobs(initial);
        setNextIndex(cursor);
        setPageError(null);
        setStatus('ready');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleLoadMore(): Promise<void> {
    if (loadingMoreRef.current || isLoadingMore) return;
    if (nextIndex >= jobIds.length) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setPageError(null);
    try {
      let cursor = nextIndex;
      const page: JobPosting[] = [];
      let failed = false;
      while (cursor < jobIds.length && page.length < PAGE_SIZE) {
        const result = await fetchJobItemResult(jobIds[cursor]);
        if (result.kind === 'error') {
          failed = true;
          break;
        }
        cursor += 1;
        if (result.kind === 'ok') page.push(result.job);
      }
      if (!mountedRef.current) return;
      if (failed) {
        setPageError('Failed to load more jobs. Please try again.');
        return;
      }
      if (page.length > 0) {
        setJobs((prev) => [...prev, ...page]);
      }
      setNextIndex(cursor);
    } finally {
      if (mountedRef.current) setIsLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }

  function handleRetryInitial(): void {
    setPageError(null);
    setStatus('loading');
    setReloadKey((key) => key + 1);
  }

  const hasMore = nextIndex < jobIds.length;

  return (
    <main className="app">
      <h1 className="app-title">HN Jobs</h1>
      {status === 'loading' ? (
        <p className="status" role="status">
          Loading...
        </p>
      ) : status === 'error' ? (
        <div className="error-block">
          <p className="status status-error" role="alert">
            Failed to load job postings. Please try again later.
          </p>
          <button
            type="button"
            className="retry-button"
            onClick={handleRetryInitial}
          >
            Retry
          </button>
        </div>
      ) : pageError !== null && jobs.length === 0 ? (
        <div className="error-block">
          <p className="status status-error" role="alert">
            {pageError}
          </p>
          <button
            type="button"
            className="retry-button"
            onClick={() => void handleLoadMore()}
            disabled={isLoadingMore}
          >
            Retry
          </button>
          {isLoadingMore && (
            <p className="status status-loading" role="status">
              Loading...
            </p>
          )}
        </div>
      ) : jobs.length === 0 ? (
        <p className="status">No job postings available.</p>
      ) : (
        <>
          <ul className="job-list" aria-busy={isLoadingMore}>
            {jobs.map((job) => {
              const href = getValidJobUrl(job.url);
              return (
                <li key={job.id} className="job-item">
                  <h2 className="job-title">
                    {href !== null ? (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        {job.title}
                      </a>
                    ) : (
                      job.title
                    )}
                  </h2>
                  <p className="job-meta">
                    by {job.by} · {formatPostingDate(job.time)}
                  </p>
                </li>
              );
            })}
          </ul>
          {pageError !== null && (
            <div className="error-block error-block-inline">
              <p className="status status-error" role="alert">
                {pageError}
              </p>
              <button
                type="button"
                className="retry-button"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
              >
                Retry
              </button>
            </div>
          )}
          {isLoadingMore && (
            <p className="status status-loading" role="status">
              Loading more jobs...
            </p>
          )}
          {hasMore && pageError === null && (
            <button
              type="button"
              className="load-more"
              onClick={() => void handleLoadMore()}
              disabled={isLoadingMore}
            >
              Load more
            </button>
          )}
        </>
      )}
    </main>
  );
}
