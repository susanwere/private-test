import { useEffect, useState } from 'react';

export const PAGE_SIZE = 6;

const HN_API_BASE_URL = 'https://hacker-news.firebaseio.com/v0';

interface HnItem {
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

async function fetchJobStoryIds(signal?: AbortSignal): Promise<number[]> {
  const response = await fetch(`${HN_API_BASE_URL}/jobstories.json`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch job IDs: ${response.status}`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) return [];
  return data.filter((value): value is number => typeof value === 'number');
}

async function fetchItem(id: number, signal?: AbortSignal): Promise<HnItem | null> {
  const response = await fetch(`${HN_API_BASE_URL}/item/${id}.json`, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch item ${id}: ${response.status}`);
  }
  const data = (await response.json()) as HnItem | null;
  return data;
}

function isValidJobItem(item: HnItem | null): item is HnItem {
  if (item === null) return false;
  if (typeof item.id !== 'number') return false;
  if (item.deleted === true || item.dead === true) return false;
  return true;
}

function formatPosted(time?: number): string {
  if (typeof time !== 'number') return 'date unknown';
  const date = new Date(time * 1000);
  if (Number.isNaN(date.getTime())) return 'date unknown';
  return date.toISOString().slice(0, 10);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

type Status = 'loading' | 'ready' | 'ids-error' | 'details-error' | 'empty';

export default function App() {
  const [jobs, setJobs] = useState<HnItem[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function load(): Promise<void> {
      try {
        const ids = await fetchJobStoryIds(controller.signal);
        if (!mounted || controller.signal.aborted) return;
        if (ids.length === 0) {
          setJobs([]);
          setStatus('empty');
          return;
        }
        const valid: HnItem[] = [];
        let detailFailed = false;
        for (const id of ids) {
          if (valid.length >= PAGE_SIZE) break;
          if (controller.signal.aborted) return;
          try {
            const item = await fetchItem(id, controller.signal);
            if (!mounted || controller.signal.aborted) return;
            if (!isValidJobItem(item)) continue;
            valid.push(item);
          } catch (err) {
            if (!mounted || controller.signal.aborted) return;
            if (err instanceof DOMException && err.name === 'AbortError') return;
            detailFailed = true;
          }
        }
        if (!mounted || controller.signal.aborted) return;
        if (valid.length === 0) {
          if (detailFailed) {
            setError('Failed to load job details. Please try again.');
            setStatus('details-error');
          } else {
            setJobs([]);
            setStatus('empty');
          }
          return;
        }
        setJobs(valid);
        setStatus('ready');
      } catch (err) {
        if (!mounted || controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Failed to load jobs. Please try again.');
        setStatus('ids-error');
      }
    }

    load().catch(() => {
      // State is handled inside load(); this guards against unhandled rejections.
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  if (status === 'loading') {
    return (
      <main className="page">
        <header className="page-header">
          <h1>Open roles</h1>
        </header>
        <p>Loading...</p>
      </main>
    );
  }

  if (status === 'ids-error' || status === 'details-error') {
    return (
      <main className="page">
        <header className="page-header">
          <h1>Open roles</h1>
        </header>
        <p role="alert">{error ?? 'Failed to load jobs. Please try again.'}</p>
      </main>
    );
  }

  if (status === 'empty') {
    return (
      <main className="page">
        <header className="page-header">
          <h1>Open roles</h1>
        </header>
        <p>No jobs available.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Open roles</h1>
        <p>Showing {jobs.length} positions</p>
      </header>

      <ul className="job-list" aria-label="Job postings">
        {jobs.map((job) => (
          <li key={job.id}>
            <article className="job-posting" data-testid="job-posting">
              <h2>{job.title ?? `Job ${job.id}`}</h2>
              <p className="meta">
                {job.by ? `By ${job.by} · ` : ''}Posted {formatPosted(job.time)}
              </p>
              {job.text && stripHtml(job.text) ? <p>{stripHtml(job.text).slice(0, 300)}</p> : null}
              {job.url ? (
                <p>
                  <a href={job.url} target="_blank" rel="noreferrer">
                    View posting
                  </a>
                </p>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
