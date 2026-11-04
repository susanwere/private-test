import { useEffect, useRef, useState } from 'react';

const JOB_STORIES_URL =
  'https://hacker-news.firebaseio.com/v0/jobstories.json';
const PAGE_SIZE = 6;

interface JobPosting {
  id: number;
  title: string;
  by: string;
  time: number;
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

async function fetchJobItem(id: number): Promise<JobPosting | null> {
  try {
    const response = await fetch(itemUrl(id));
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!isValidJobPosting(data)) return null;
    return data;
  } catch {
    return null;
  }
}

type Status = 'loading' | 'error' | 'ready';

export default function App() {
  const [status, setStatus] = useState<Status>('loading');
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [nextIndex, setNextIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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
      while (cursor < ids.length && initial.length < PAGE_SIZE) {
        const job = await fetchJobItem(ids[cursor]);
        cursor += 1;
        if (job !== null) initial.push(job);
      }
      if (!cancelled) {
        setJobs(initial);
        setJobIds(ids);
        setNextIndex(cursor);
        setStatus('ready');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadMore(): Promise<void> {
    if (loadingMoreRef.current || isLoadingMore) return;
    if (nextIndex >= jobIds.length) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      let cursor = nextIndex;
      const page: JobPosting[] = [];
      while (cursor < jobIds.length && page.length < PAGE_SIZE) {
        const job = await fetchJobItem(jobIds[cursor]);
        cursor += 1;
        if (job !== null) page.push(job);
      }
      if (!mountedRef.current) return;
      if (page.length > 0) {
        setJobs((prev) => [...prev, ...page]);
      }
      setNextIndex(cursor);
    } finally {
      if (mountedRef.current) setIsLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }

  const hasMore = nextIndex < jobIds.length;

  return (
    <main className="app">
      <h1 className="app-title">HN Jobs</h1>
      {status === 'loading' ? (
        <p className="status">Loading...</p>
      ) : status === 'error' ? (
        <p className="status status-error" role="alert">
          Failed to load job postings. Please try again later.
        </p>
      ) : jobs.length === 0 ? (
        <p className="status">No job postings available.</p>
      ) : (
        <>
          <ul className="job-list">
            {jobs.map((job) => (
              <li key={job.id} className="job-item">
                <h2 className="job-title">{job.title}</h2>
                <p className="job-meta">
                  by {job.by} · {formatPostingDate(job.time)}
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
              Load more
            </button>
          )}
        </>
      )}
    </main>
  );
}
