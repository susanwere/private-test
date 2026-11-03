import { useState } from 'react';

interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  description: string;
  postedAt: string;
}

const JOBS: Job[] = [
  { id: 1, title: 'Frontend Developer', company: 'Acme Corp', location: 'New York, NY', type: 'Full-time', salary: '$110k – $140k', description: 'Build accessible React interfaces.', postedAt: '2026-10-28' },
  { id: 2, title: 'Backend Engineer', company: 'Northwind', location: 'Remote', type: 'Full-time', salary: '$120k – $155k', description: 'Design Node.js APIs and Postgres schemas.', postedAt: '2026-10-27' },
  { id: 3, title: 'Product Designer', company: 'Framerly', location: 'San Francisco, CA', type: 'Full-time', salary: '$105k – $135k', description: 'Own end-to-end product design.', postedAt: '2026-10-27' },
  { id: 4, title: 'DevOps Engineer', company: 'Cloudnine', location: 'Austin, TX', type: 'Full-time', salary: '$125k – $160k', description: 'Manage AWS with Terraform.', postedAt: '2026-10-26' },
  { id: 5, title: 'Data Scientist', company: 'Statly', location: 'Boston, MA', type: 'Full-time', salary: '$130k – $170k', description: 'Build churn models.', postedAt: '2026-10-26' },
  { id: 6, title: 'Mobile Developer', company: 'Pocketapp', location: 'Remote', type: 'Contract', salary: '$70 – $95/hr', description: 'Ship React Native features.', postedAt: '2026-10-25' },
  { id: 7, title: 'QA Engineer', company: 'Testbench', location: 'Chicago, IL', type: 'Full-time', salary: '$85k – $110k', description: 'Write Playwright suites.', postedAt: '2026-10-25' },
  { id: 8, title: 'Engineering Manager', company: 'Acme Corp', location: 'New York, NY', type: 'Full-time', salary: '$165k – $200k', description: 'Lead a team of 6.', postedAt: '2026-10-24' },
  { id: 9, title: 'Technical Writer', company: 'Docsmith', location: 'Remote', type: 'Part-time', salary: '$50 – $70/hr', description: 'Write API guides.', postedAt: '2026-10-24' },
  { id: 10, title: 'Security Engineer', company: 'Vaultsec', location: 'Seattle, WA', type: 'Full-time', salary: '$140k – $180k', description: 'Run threat reviews.', postedAt: '2026-10-23' },
  { id: 11, title: 'ML Engineer', company: 'Statly', location: 'Remote', type: 'Full-time', salary: '$150k – $190k', description: 'Deploy ranking models.', postedAt: '2026-10-23' },
  { id: 12, title: 'Support Specialist', company: 'Helpdeskly', location: 'Denver, CO', type: 'Full-time', salary: '$55k – $70k', description: 'Triage tickets.', postedAt: '2026-10-22' },
  { id: 13, title: 'SRE', company: 'Cloudnine', location: 'Remote', type: 'Full-time', salary: '$135k – $175k', description: 'Improve uptime and alerting.', postedAt: '2026-10-22' },
  { id: 14, title: 'UI Engineer', company: 'Framerly', location: 'Los Angeles, CA', type: 'Full-time', salary: '$115k – $145k', description: 'Build design-system components.', postedAt: '2026-10-21' },
  { id: 15, title: 'Product Manager', company: 'Northwind', location: 'New York, NY', type: 'Full-time', salary: '$125k – $160k', description: 'Define payments roadmap.', postedAt: '2026-10-21' },
  { id: 16, title: 'Data Engineer', company: 'Pipely', location: 'Remote', type: 'Full-time', salary: '$130k – $165k', description: 'Build dbt pipelines.', postedAt: '2026-10-20' },
  { id: 17, title: 'iOS Developer', company: 'Pocketapp', location: 'Cupertino, CA', type: 'Full-time', salary: '$130k – $165k', description: 'Build SwiftUI screens.', postedAt: '2026-10-20' },
  { id: 18, title: 'Android Developer', company: 'Pocketapp', location: 'Remote', type: 'Full-time', salary: '$125k – $160k', description: 'Ship Kotlin features.', postedAt: '2026-10-19' },
  { id: 19, title: 'Solutions Architect', company: 'Cloudnine', location: 'Boston, MA', type: 'Full-time', salary: '$150k – $185k', description: 'Guide migrations.', postedAt: '2026-10-19' },
  { id: 20, title: 'Growth Marketer', company: 'Loopwire', location: 'Remote', type: 'Full-time', salary: '$90k – $120k', description: 'Run acquisition experiments.', postedAt: '2026-10-18' },
  { id: 21, title: 'Customer Success Manager', company: 'Helpdeskly', location: 'Chicago, IL', type: 'Full-time', salary: '$80k – $105k', description: 'Own onboarding.', postedAt: '2026-10-18' },
  { id: 22, title: 'Full-Stack Developer', company: 'Northwind', location: 'Remote', type: 'Full-time', salary: '$120k – $155k', description: 'React and Node dashboards.', postedAt: '2026-10-17' },
  { id: 23, title: 'Research Scientist', company: 'Statly', location: 'San Francisco, CA', type: 'Full-time', salary: '$170k – $210k', description: 'Prototype LLM evals.', postedAt: '2026-10-17' },
  { id: 24, title: 'HR Generalist', company: 'Acme Corp', location: 'New York, NY', type: 'Full-time', salary: '$70k – $90k', description: 'Support hiring.', postedAt: '2026-10-16' },
  { id: 25, title: 'Finance Analyst', company: 'Ledgerly', location: 'Remote', type: 'Full-time', salary: '$85k – $110k', description: 'Forecasts and reporting.', postedAt: '2026-10-16' },
  { id: 26, title: 'Legal Counsel', company: 'Ledgerly', location: 'Washington, DC', type: 'Full-time', salary: '$160k – $200k', description: 'Review contracts.', postedAt: '2026-10-15' },
  { id: 27, title: 'Content Strategist', company: 'Docsmith', location: 'Remote', type: 'Contract', salary: '$60 – $80/hr', description: 'Editorial calendar.', postedAt: '2026-10-15' },
  { id: 28, title: 'Sales Engineer', company: 'Pipely', location: 'Austin, TX', type: 'Full-time', salary: '$110k – $150k', description: 'Demos and POCs.', postedAt: '2026-10-14' },
  { id: 29, title: 'Business Analyst', company: 'Northwind', location: 'Denver, CO', type: 'Full-time', salary: '$80k – $100k', description: 'Requirements docs.', postedAt: '2026-10-14' },
  { id: 30, title: 'Intern, Software Engineering', company: 'Acme Corp', location: 'Remote', type: 'Internship', salary: '$30/hr', description: 'Paid internship.', postedAt: '2026-10-13' },
];

const PAGE_SIZE = 5;

export default function App() {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleJobs = JOBS.slice(0, visibleCount);
  const hasMore = visibleCount < JOBS.length;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Open roles</h1>
        <p>
          Showing {visibleJobs.length} of {JOBS.length} positions
        </p>
      </header>

      <ul className="job-list" aria-label="Job postings">
        {visibleJobs.map((job) => (
          <li key={job.id}>
            <article className="job-posting" data-testid="job-posting">
              <h2>{job.title}</h2>
              <p className="meta">
                {job.company} · {job.location} · {job.type}
              </p>
              <p className="salary">{job.salary}</p>
              <p>{job.description}</p>
              <p className="posted">Posted {job.postedAt}</p>
            </article>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, JOBS.length))}
        >
          Load More
        </button>
      )}
    </main>
  );
}
