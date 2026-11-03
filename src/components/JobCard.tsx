export interface Job {
  id: number;
  title?: string;
  by?: string;
  time?: number;
  url?: string;
  text?: string;
}

export function formatPostedDate(time?: number): string {
  if (typeof time !== 'number') return 'date unknown';
  const date = new Date(time * 1000);
  if (Number.isNaN(date.getTime())) return 'date unknown';
  return date.toISOString().slice(0, 10);
}

export function isValidHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

export default function JobCard({ job }: { job: Job }) {
  const title = job.title ?? `Job ${job.id}`;
  const href = isValidHttpUrl(job.url) ? job.url : null;
  const excerpt = job.text ? stripHtml(job.text).slice(0, 300) : '';

  return (
    <article className="job-posting" data-testid="job-posting">
      <h2>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {title}
          </a>
        ) : (
          <span>{title}</span>
        )}
      </h2>
      <p className="meta">
        {job.by ? `By ${job.by} · ` : ''}Posted {formatPostedDate(job.time)}
      </p>
      {excerpt ? <p>{excerpt}</p> : null}
    </article>
  );
}
