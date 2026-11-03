import { useJobPages } from './hooks/useJobPages.ts';
import JobList from './components/JobList.tsx';

export { PAGE_SIZE } from './hooks/useJobPages.ts';

export default function App() {
  const { jobs, status, error, hasMore, isLoadingMore, loadMore } = useJobPages();

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

      <JobList jobs={jobs} />

      {hasMore ? (
        <button type="button" onClick={loadMore} disabled={isLoadingMore} aria-busy={isLoadingMore}>
          {isLoadingMore ? 'Loading more...' : 'Load more'}
        </button>
      ) : null}
    </main>
  );
}
