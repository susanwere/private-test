import JobCard, { type Job } from './JobCard.tsx';

export type { Job } from './JobCard.tsx';

export default function JobList({ jobs }: { jobs: Job[] }) {
  return (
    <ul className="job-list" aria-label="Job postings">
      {jobs.map((job) => (
        <li key={job.id}>
          <JobCard job={job} />
        </li>
      ))}
    </ul>
  );
}
