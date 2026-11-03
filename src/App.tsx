import type { ReactNode } from 'react';
import { useJobPages } from './hooks/useJobPages.ts';
import JobList from './components/JobList.tsx';

export { PAGE_SIZE } from './hooks/useJobPages.ts';

function Shell({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <main className="page">
      <header className="page-header">
        <h1>Open roles</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </main>
  );
}

export default function App() {
  const { jobs, status, error, hasMore, isLoadingMore, loadMore } = useJobPages();

  if (status === 'loading') {
    return (
      <Shell>
        <p>Loading...</p>
      </Shell>
    );
  }

  if (status === 'ids-error' || status === 'details-error') {
    return (
      <Shell>
        <p role="alert">{error ?? 'Failed to load jobs. Please try again.'}</p>
      </Shell>
    );
  }

  if (status === 'empty') {
    return (
      <Shell>
        <p>No jobs available.</p>
      </Shell>
    );
  }

  return (
    <Shell subtitle={`Showing ${jobs.length} positions`}>
      <JobList jobs={jobs} />

      {hasMore ? (
        <button type="button" onClick={loadMore} disabled={isLoadingMore} aria-busy={isLoadingMore}>
          {isLoadingMore ? 'Loading more...' : 'Load more'}
        </button>
      ) : null}
    </Shell>
  );
}
