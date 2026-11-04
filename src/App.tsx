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
  /** Optional external link for the posting (HN `url` field). */
  url?: string;
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

/**
 * True when `value` is an absolute http(s) URL. Only such URLs render as
 * job title links; anything else renders as plain text.
 */
export function isValidJobUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
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

type JobOutcome =
  | { kind: 'job'; job: Job }
  | { kind: 'invalid' }
  | { kind: 'transient' };

/**
 * Fetch one job detail, distinguishing permanent misses (`invalid`: null,
 * deleted/dead, malformed-but-parsed records) from recoverable request
 * failures (`transient`: network errors, non-OK responses, unparsable
 * bodies). Preserves the record's `url` when it is a string.
 */
async function fetchJobOutcome(
  id: number,
  fetchFn: typeof fetch,
): Promise<JobOutcome> {
  let res: Response;
  try {
    res = await fetchFn(itemUrl(id));
  } catch {
    return { kind: 'transient' };
  }
  if (!res.ok) return { kind: 'transient' };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { kind: 'transient' };
  }
  if (!isValidJob(data)) return { kind: 'invalid' };
  const job: Job = {
    id: data.id,
    title: data.title,
    by: data.by,
    time: data.time,
  };
  if (typeof data.url === 'string') job.url = data.url;
  return { kind: 'job', job };
}

/**
 * Fetch one job detail. Returns `null` for null/deleted/malformed records,
 * non-OK responses, and network/parse failures.
 */
export async function fetchJobById(
  id: number,
  fetchFn: typeof fetch = fetch,
): Promise<Job | null> {
  const outcome = await fetchJobOutcome(id, fetchFn);
  return outcome.kind === 'job' ? outcome.job : null;
}

export interface JobPage {
  jobs: Job[];
  /** Index into `ids` of the first unconsumed ID. */
  nextIndex: number;
}

/**
 * Load one page of up to `limit` valid jobs starting at `startIndex`,
 * preserving endpoint order and skipping permanently invalid records by
 * consuming through remaining IDs. Returns the jobs plus the next unconsumed
 * index. Issues no detail request when `startIndex` is already exhausted.
 *
 * @throws when no valid job could be loaded because of recoverable request
 * failures (network errors, non-OK responses, unparsable bodies). The cursor
 * is not advanced in that case, so callers can retry the same page.
 */
export async function loadJobPage(
  ids: number[],
  startIndex: number,
  fetchFn: typeof fetch = fetch,
  limit: number = JOB_PAGE_SIZE,
): Promise<JobPage> {
  const jobs: Job[] = [];
  let index = Math.max(0, startIndex);
  let transientFailures = 0;
  while (index < ids.length && jobs.length < limit) {
    const outcome = await fetchJobOutcome(ids[index], fetchFn);
    index += 1;
    if (outcome.kind === 'job') jobs.push(outcome.job);
    else if (outcome.kind === 'transient') transientFailures += 1;
  }
  if (jobs.length === 0 && transientFailures > 0) {
    throw new Error('Failed to load jobs: request error');
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
 * permanently invalid records. Throws when the ID request fails, or when
 * details yield no valid job because of recoverable request failures.
 */
export async function loadInitialJobs(
  fetchFn: typeof fetch = fetch,
  limit: number = INITIAL_JOB_COUNT,
): Promise<Job[]> {
  const ids = await fetchJobIds(fetchFn);
  const page = await loadJobPage(ids, 0, fetchFn, limit);
  return page.jobs;
}

/** Fetch IDs plus the first page; throws when either request fails. */
async function loadInitialPage(
  fetchFn: typeof fetch = fetch,
): Promise<{ ids: number[]; page: JobPage }> {
  const ids = await fetchJobIds(fetchFn);
  const page = await loadJobPage(ids, 0, fetchFn);
  return { ids, page };
}

type Status = 'loading' | 'error' | 'ready';

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [status, setStatus] = useState<Status>('loading');
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

  const handleRetryInitial = async () => {
    setStatus('loading');
    try {
      const { ids, page } = await loadInitialPage();
      setJobIds(ids);
      setJobs(page.jobs);
      setNextIndex(page.nextIndex);
      setStatus('ready');
    } catch {
      setStatus('error');
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
        'Failed to load more jobs. Check your connection and try again.',
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
      {status === 'loading' && (
        <p className="jobs-status" role="status">
          Loading...
        </p>
      )}
      {status === 'error' && (
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
      {status === 'ready' && jobs.length === 0 && (
        <p className="jobs-status jobs-empty" role="status">
          No jobs found.
        </p>
      )}
      {status === 'ready' && jobs.length > 0 && (
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
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </>
      )}
    </main>
  );
}
