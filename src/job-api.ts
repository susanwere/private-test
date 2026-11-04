export const JOBSTORIES_URL =
  "https://hacker-news.firebaseio.com/v0/jobstories.json";

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
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A record is a valid job posting when it is a non-null object with a numeric
 * `id`, non-empty `title`/`by`, numeric `time`, and no `deleted`/`dead` flag.
 */
export function isValidJob(value: unknown): value is Job {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.deleted === true || record.dead === true) return false;
  return (
    typeof record.id === "number" &&
    Number.isFinite(record.id) &&
    isNonEmptyString(record.title) &&
    isNonEmptyString(record.by) &&
    typeof record.time === "number" &&
    Number.isFinite(record.time)
  );
}

/**
 * True when `value` is an absolute http(s) URL. Only such URLs render as
 * job title links; anything else renders as plain text.
 */
export function isValidJobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
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
    throw new Error("Invalid job IDs response");
  }
  return data.filter(
    (id): id is number => typeof id === "number" && Number.isFinite(id),
  );
}

type JobOutcome =
  | { kind: "job"; job: Job }
  | { kind: "invalid" }
  | { kind: "transient" };

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
    return { kind: "transient" };
  }
  if (!res.ok) return { kind: "transient" };
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { kind: "transient" };
  }
  if (!isValidJob(data)) return { kind: "invalid" };
  const job: Job = {
    id: data.id,
    title: data.title,
    by: data.by,
    time: data.time,
  };
  if (typeof data.url === "string") job.url = data.url;
  return { kind: "job", job };
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
  return outcome.kind === "job" ? outcome.job : null;
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
 * @throws when any detail request has a recoverable failure. The whole page
 * remains uncommitted so retry cannot silently skip a failed posting.
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
    if (outcome.kind === "job") jobs.push(outcome.job);
    else if (outcome.kind === "transient") transientFailures += 1;
  }
  if (transientFailures > 0) {
    throw new Error("Failed to load jobs: request error");
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
export async function loadInitialPage(
  fetchFn: typeof fetch = fetch,
): Promise<{ ids: number[]; page: JobPage }> {
  const ids = await fetchJobIds(fetchFn);
  const page = await loadJobPage(ids, 0, fetchFn);
  return { ids, page };
}
