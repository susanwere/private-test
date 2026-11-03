import { useCallback, useEffect, useRef, useState } from 'react';

export const PAGE_SIZE = 6;

const HN_API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';

export interface HnItem {
  id: number;
  type?: string;
  by?: string;
  time?: number;
  title?: string;
  text?: string;
  url?: string;
  deleted?: boolean;
  dead?: boolean;
}

export type FetchIdsFn = (signal?: AbortSignal) => Promise<number[]>;
export type FetchItemFn = (id: number, signal?: AbortSignal) => Promise<HnItem | null>;

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function fetchJobStoryIds(signal?: AbortSignal): Promise<number[]> {
  const response = await fetch(`${HN_API_BASE_URL}/jobstories.json`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch job IDs: ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data.filter((value): value is number => typeof value === 'number');
}

export async function fetchItem(id: number, signal?: AbortSignal): Promise<HnItem | null> {
  const response = await fetch(`${HN_API_BASE_URL}/item/${id}.json`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch item ${id}: ${response.status}`);
  }
  const data = (await response.json()) as HnItem | null;
  return data;
}

export function isValidJobItem(item: HnItem | null): item is HnItem {
  if (item === null) return false;
  if (typeof item.id !== 'number') return false;
  if (item.deleted === true || item.dead === true) return false;
  return true;
}

export interface JobPage {
  jobs: HnItem[];
  nextCursor: number;
  detailFailed: boolean;
}

/**
 * Fetch one page of valid jobs starting at `startCursor`.
 *
 * Walks `ids` in order, fetching successive item details and skipping
 * null/missing/deleted/dead/failed records until `pageSize` valid jobs are
 * collected or the ID list is exhausted. Already-seen IDs are never
 * re-fetched, so duplicates in the feed cannot surface as duplicate jobs.
 * Issues no detail request when `startCursor` is already past the end.
 */
export async function fetchJobPage(
  ids: number[],
  startCursor: number,
  fetchItemFn: FetchItemFn,
  pageSize: number = PAGE_SIZE,
  seenIds?: ReadonlySet<number>,
  signal?: AbortSignal,
): Promise<JobPage> {
  const jobs: HnItem[] = [];
  const collected = new Set<number>();
  seenIds?.forEach((id) => collected.add(id));
  let cursor = Math.max(0, Math.min(startCursor, ids.length));
  let detailFailed = false;

  while (cursor < ids.length && jobs.length < pageSize) {
    if (signal?.aborted) break;
    const id = ids[cursor];
    cursor += 1;
    if (collected.has(id)) continue;
    try {
      const item = await fetchItemFn(id, signal);
      if (signal?.aborted) break;
      if (!isValidJobItem(item)) continue;
      if (collected.has(item.id)) continue;
      collected.add(item.id);
      jobs.push(item);
    } catch (err) {
      if (isAbortError(err)) break;
      detailFailed = true;
    }
  }

  return { jobs, nextCursor: cursor, detailFailed };
}

export type InitialLoadStatus = 'ready' | 'empty' | 'details-error';

export interface InitialLoadResult {
  status: InitialLoadStatus;
  detailFailed: boolean;
}

/**
 * Framework-free pager owning the ordered ID list, the traversal cursor, the
 * displayed jobs, and the in-flight guard. `loadMore` calls that overlap an
 * in-progress page share its promise, so rapid clicks issue a single fetch.
 * A generation counter plus a per-ID single-flight map make overlapping
 * `loadInitial` calls (StrictMode double-mount, remount) safe: concurrent
 * detail fetches for the same ID share one request, and only the latest
 * generation commits cursor/jobs state.
 */
export class JobPager {
  private ids: number[] = [];
  private cursor = 0;
  private readonly jobs: HnItem[] = [];
  private readonly seenIds = new Set<number>();
  private readonly detailFlight = new Map<number, Promise<HnItem | null>>();
  private inFlight: Promise<JobPage> | null = null;
  private generation = 0;
  private readonly fetchIds: FetchIdsFn;
  private readonly fetchItemFn: FetchItemFn;
  private readonly pageSize: number;

  constructor(fetchIds: FetchIdsFn, fetchItemFn: FetchItemFn, pageSize: number = PAGE_SIZE) {
    this.fetchIds = fetchIds;
    this.fetchItemFn = fetchItemFn;
    this.pageSize = pageSize;
  }

  get jobList(): HnItem[] {
    return [...this.jobs];
  }

  get hasMore(): boolean {
    return this.cursor < this.ids.length;
  }

  get loadingMore(): boolean {
    return this.inFlight !== null;
  }

  /** Fetches the ID list, then the first page. Throws when IDs fail to load. */
  async loadInitial(signal?: AbortSignal): Promise<InitialLoadResult> {
    const gen = ++this.generation;
    this.inFlight = null;
    const ids = await this.fetchIds(signal);
    this.throwIfStale(gen, signal);
    this.ids = ids;
    this.cursor = 0;
    this.jobs.length = 0;
    this.seenIds.clear();
    const page = await this.runPage(gen, signal);
    this.throwIfStale(gen, signal);
    if (this.jobs.length === 0) {
      return {
        status: page.detailFailed ? 'details-error' : 'empty',
        detailFailed: page.detailFailed,
      };
    }
    return { status: 'ready', detailFailed: page.detailFailed };
  }

  /**
   * Appends the next page of valid jobs. Overlapping calls share the
   * in-flight request; calls after exhaustion return empty without fetching.
   */
  async loadMore(signal?: AbortSignal): Promise<JobPage> {
    if (this.inFlight !== null) return this.inFlight;
    if (!this.hasMore) {
      return { jobs: [], nextCursor: this.cursor, detailFailed: false };
    }
    const gen = this.generation;
    const pending = this.runPage(gen, signal);
    this.inFlight = pending;
    try {
      return await pending;
    } finally {
      if (this.inFlight === pending) this.inFlight = null;
    }
  }

  private throwIfStale(gen: number, signal?: AbortSignal): void {
    if (gen !== this.generation || signal?.aborted === true) {
      throw new DOMException('Aborted', 'AbortError');
    }
  }

  /** Deduplicates concurrent detail fetches for the same ID. */
  private fetchDetail(id: number, signal?: AbortSignal): Promise<HnItem | null> {
    const existing = this.detailFlight.get(id);
    if (existing !== undefined) return existing;
    const pending = this.fetchItemFn(id, signal);
    this.detailFlight.set(id, pending);
    const cleanup = (): void => {
      if (this.detailFlight.get(id) === pending) this.detailFlight.delete(id);
    };
    pending.then(cleanup, cleanup);
    return pending;
  }

  private async runPage(gen: number, signal?: AbortSignal): Promise<JobPage> {
    const page = await fetchJobPage(
      this.ids,
      this.cursor,
      (id, itemSignal) => this.fetchDetail(id, itemSignal),
      this.pageSize,
      this.seenIds,
      signal,
    );
    if (gen !== this.generation) return page;
    this.cursor = page.nextCursor;
    for (const job of page.jobs) {
      this.seenIds.add(job.id);
      this.jobs.push(job);
    }
    return page;
  }
}

export type JobPagesStatus = 'loading' | 'ready' | 'ids-error' | 'details-error' | 'empty';

export interface UseJobPagesOptions {
  fetchIds?: FetchIdsFn;
  fetchItemFn?: FetchItemFn;
  pageSize?: number;
}

export interface UseJobPagesResult {
  jobs: HnItem[];
  status: JobPagesStatus;
  error: string | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

export function useJobPages(options: UseJobPagesOptions = {}): UseJobPagesResult {
  const { fetchIds = fetchJobStoryIds, fetchItemFn = fetchItem, pageSize = PAGE_SIZE } = options;
  const [pager] = useState(() => new JobPager(fetchIds, fetchItemFn, pageSize));
  const [jobs, setJobs] = useState<HnItem[]>([]);
  const [status, setStatus] = useState<JobPagesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const runIdRef = useRef<number>(0);
  const loadMoreControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    runIdRef.current += 1;
    const runId = runIdRef.current;
    const controller = new AbortController();
    const isCurrent = (): boolean =>
      mountedRef.current && runId === runIdRef.current && !controller.signal.aborted;

    async function load(): Promise<void> {
      try {
        const result = await pager.loadInitial(controller.signal);
        if (!isCurrent()) return;
        if (result.status === 'ready') {
          setJobs(pager.jobList);
          setHasMore(pager.hasMore);
          setStatus('ready');
        } else if (result.status === 'empty') {
          setJobs([]);
          setHasMore(false);
          setStatus('empty');
        } else {
          setError('Failed to load job details. Please try again.');
          setStatus('details-error');
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (isAbortError(err)) return;
        setError('Failed to load jobs. Please try again.');
        setStatus('ids-error');
      }
    }

    load().catch(() => {
      // State is handled inside load(); this guards against unhandled rejections.
    });

    return () => {
      mountedRef.current = false;
      controller.abort();
      loadMoreControllerRef.current?.abort();
    };
  }, [pager]);

  const loadMore = useCallback(() => {
    if (!mountedRef.current) return;
    if (!pager.hasMore || pager.loadingMore) return;
    const runId = runIdRef.current;
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    const isCurrent = (): boolean => mountedRef.current && runId === runIdRef.current;
    setIsLoadingMore(true);
    pager.loadMore(controller.signal).then(
      () => {
        if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null;
        if (!isCurrent() || controller.signal.aborted) return;
        setJobs(pager.jobList);
        setHasMore(pager.hasMore);
        setIsLoadingMore(false);
      },
      (err: unknown) => {
        if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null;
        if (!isCurrent()) return;
        if (isAbortError(err) || controller.signal.aborted) {
          // Aborted on unmount; if somehow still current, release the button.
          setIsLoadingMore(false);
          return;
        }
        // Per-item detail failures are already skipped inside the pager with
        // partial results committed; a rejected page only releases the button
        // so displayed jobs are never lost.
        setIsLoadingMore(false);
      },
    );
  }, [pager]);

  return { jobs, status, error, hasMore, isLoadingMore, loadMore };
}
