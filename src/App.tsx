import { useEffect, useRef, useState } from 'react';

export const JOBSTORIES_URL =
  'https://hacker-news.firebaseio.com/v0/jobstories.json';

export const INITIAL_JOB_COUNT = 6;

/** Number of valid postings appended per page (initial + each Load more). */
export const JOB_PAGE_SIZE = INITIAL_JOB_COUNT;

export function itemUrl(id: number): string {
  return `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
}

export interface Job {
  id: number;
  title: string;
  by: string;
  /** Posting time in seconds since epoch, as returned by the HN API. */
  time: number;
}

/** Convert HN `time` seconds to a `Date` (seconds -> milliseconds). */
export function toJobDate(timeSeconds: number): Date {
  return new Date(timeSeconds * 1000);
}

/** Format HN `time` seconds for display. */
export function formatJobDate(timeSeconds: number): string {
  return toJobDate(timeSeconds).toLocaleDateString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * A record is a valid job posting when it is a non-null object with a numeric
 * `id`, non-empty `title`/`by`, numeric `time`, and no `deleted`/`dead` flag.
 */
export function isValidJob(value: unknown): value is Job {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.deleted === true || record.dead === true) return false;
  return (
    typeof record.id === 'number' &&
    Number.isFinite(record.id) &&
    isNonEmptyString(record.title) &&
    isNonEmptyString(record.by) &&
    typeof record.time === 'number' &&
    Number.isFinite(record.time)
  );
}

/** Fetch ordered job IDs, preserving endpoint order. Throws on failure. */
export async function fetchJobIds(
  fetchFn: typeof fetch = fetch,
): Promise<number[]> {
  const res = await fetchFn(JOBSTORIES_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch job IDs: ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Invalid job IDs response');
  }
  return data.filter(
    (id): id is number => typeof id === 'number' && Number.isFinite(id),
  );
}

/**
 * Fetch one job detail. Returns `null` for null/deleted/malformed records,
 * non-OK responses, and network/parse failures.
 */
export async function fetchJobById(
  id: number,
  fetchFn: typeof fetch = fetch,
): Promise<Job | null> {
  try {
    const res = await fetchFn(itemUrl(id));
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!isValidJob(data)) return null;
    return { id: data.id, title: data.title, by: data.by, time: data.time };
  } catch {
    return null;
  }
}

export interface JobPage {
  jobs: Job[];
  /** Index into `ids` of the first unconsumed ID. */
  nextIndex: number;
}

/**
 * Load one page of up to `limit` valid jobs starting at `startIndex`,
 * preserving endpoint order and skipping invalid/failed records by consuming
 * through remaining IDs. Returns the jobs plus the next unconsumed index.
 * Issues no detail request when `startIndex` is already exhausted.
 */
export async function loadJobPage(
  ids: number[],
  startIndex: number,
  fetchFn: typeof fetch = fetch,
  limit: number = JOB_PAGE_SIZE,
): Promise<JobPage> {
  const jobs: Job[] = [];
  let index = Math.max(0, startIndex);
  while (index < ids.length && jobs.length < limit) {
    const job = await fetchJobById(ids[index], fetchFn);
    index += 1;
    if (job !== null) jobs.push(job);
  }
  return { jobs, nextIndex: index };
}

/** Append page jobs while dropping IDs already present (repeat-click safe). */
export function mergeJobs(existing: Job[], incoming: Job[]): Job[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((job) => job.id));
  const fresh = incoming.filter((job) => !seen.has(job.id));
  if (fresh.length === 0) return existing;
  return [...existing, ...fresh];
}

/**
 * Load the first `limit` valid jobs, preserving endpoint order and skipping
 * invalid/failed records. Throws only when the ID request itself fails.
 */
export async function loadInitialJobs(
  fetchFn: typeof fetch = fetch,
  limit: number = INITIAL_JOB_COUNT,
): Promise<Job[]> {
  const ids = await fetchJobIds(fetchFn);
  const page = await loadJobPage(ids, 0, fetchFn, limit);
  return page.jobs;
}

type Status = 'loading' | 'error' | 'ready';

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await fetchJobIds();
        if (cancelled) return;
        const page = await loadJobPage(ids, 0);
        if (cancelled) return;
        setJobIds(ids);
        setJobs(page.jobs);
        setNextIndex(page.nextIndex);
        setStatus('ready');
      } catch {
        if (cancelled) return;
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasMore = nextIndex < jobIds.length;

  const handleLoadMore = async () => {
    if (loadingMoreRef.current || isLoadingMore) return;
    if (nextIndex >= jobIds.length) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    const startIndex = nextIndex;
    try {
      const page = await loadJobPage(jobIds, startIndex);
      setJobs((prev) => mergeJobs(prev, page.jobs));
      setNextIndex(page.nextIndex);
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
      {status === 'loading' && (
        <p className="jobs-status" role="status">
          Loading...
        </p>
      )}
      {status === 'error' && (
        <p className="jobs-status jobs-error" role="alert">
          Failed to load jobs. Please try again later.
        </p>
      )}
      {status === 'ready' && jobs.length === 0 && (
        <p className="jobs-status jobs-empty" role="status">
          No jobs found.
        </p>
      )}
      {status === 'ready' && jobs.length > 0 && (
        <>
          <ul className="jobs-list">
            {jobs.map((job) => (
              <li key={job.id} className="job-card">
                <h2>{job.title}</h2>
                <p className="job-meta">
                  <span>by {job.by}</span>
                  <time dateTime={toJobDate(job.time).toISOString()}>
                    {formatJobDate(job.time)}
                  </time>
                </p>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              className="load-more"
              onClick={() => void handleLoadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </main>
  );
}
