import { describe, it, expect } from 'vitest';
import { sortByNewest, formatPostedDate, filterJobs, getDepartments, getLocations } from './jobs';
import type { Job } from '../types/job';

function makeJob(slug: string, postedDate: string): Job {
    return {
        slug,
        title: `Role ${slug}`,
        department: 'Technology',
        location: 'Remote',
        type: 'Full-time',
        remote: true,
        postedDate,
        summary: 'A role.',
    };
}

describe('sortByNewest', () => {
    it('orders jobs by posted date, newest first', () => {
        const jobs = [
            makeJob('a', '2027-01-01'),
            makeJob('b', '2027-03-15'),
            makeJob('c', '2027-02-10'),
        ];
        expect(sortByNewest(jobs).map((j) => j.slug)).toEqual(['b', 'c', 'a']);
    });

    it('does not mutate the input array', () => {
        const jobs = [makeJob('a', '2027-01-01'), makeJob('b', '2027-03-15')];
        const original = jobs.map((j) => j.slug);
        sortByNewest(jobs);
        expect(jobs.map((j) => j.slug)).toEqual(original);
    });
});

describe('formatPostedDate', () => {
    it('formats an ISO date as a readable string', () => {
        expect(formatPostedDate('2027-01-05')).toBe('January 5, 2027');
    });

    /** Overlapping facets distinguish AND matching from either-facet matching. */
    const filterFixtures: Job[] = [
      { ...makeJob('a', '2027-03-01'), department: 'Technology', location: 'Remote (US & Canada)' },
      { ...makeJob('b', '2027-02-01'), department: 'Finance', location: 'Woodinville, WA, USA' },
      { ...makeJob('c', '2027-01-01'), department: 'Technology', location: 'Woodinville, WA, USA' },
      { ...makeJob('d', '2026-12-01'), department: 'Finance', location: 'Helsinki, Finland' },
    ];

    describe('filterJobs', () => {
      it('filters by department while preserving order', () => {
        expect(filterJobs(filterFixtures, { department: 'Technology' }).map((job) => job.slug))
          .toEqual(['a', 'c']);
      });

      it('filters by exact location, including remote labels', () => {
        expect(filterJobs(filterFixtures, { location: 'Woodinville, WA, USA' }).map((job) => job.slug))
          .toEqual(['b', 'c']);
        expect(filterJobs(filterFixtures, { location: 'Remote (US & Canada)' }).map((job) => job.slug))
          .toEqual(['a']);
        expect(filterJobs(filterFixtures, { location: 'Remote' })).toEqual([]);
      });

      it('requires both selected facets to match', () => {
        expect(filterJobs(filterFixtures, {
          department: 'Technology', location: 'Woodinville, WA, USA',
        }).map((job) => job.slug)).toEqual(['c']);
        expect(filterJobs(filterFixtures, {
          department: 'Technology', location: 'Helsinki, Finland',
        })).toEqual([]);
      });

      it('treats omitted and empty selections as unrestricted', () => {
        expect(filterJobs(filterFixtures)).toEqual(filterFixtures);
        expect(filterJobs(filterFixtures, {})).toEqual(filterFixtures);
        expect(filterJobs(filterFixtures, { department: '', location: '' })).toEqual(filterFixtures);
      });

      it('clears either facet independently and resets both against the original jobs', () => {
        const filters = { department: 'Technology', location: 'Woodinville, WA, USA' };
        expect(filterJobs(filterFixtures, { ...filters, department: '' }).map((job) => job.slug))
          .toEqual(['b', 'c']);
        expect(filterJobs(filterFixtures, { ...filters, location: '' }).map((job) => job.slug))
          .toEqual(['a', 'c']);
        expect(filterJobs(filterFixtures, { department: '', location: '' })).toEqual(filterFixtures);
      });

      it('returns no results for unknown or differently cased values and empty inputs', () => {
        expect(filterJobs(filterFixtures, { department: 'Unknown' })).toEqual([]);
        expect(filterJobs(filterFixtures, { department: 'technology' })).toEqual([]);
        expect(filterJobs(filterFixtures, { location: 'Unknown' })).toEqual([]);
        expect(filterJobs([], { department: 'Technology' })).toEqual([]);
      });

      it('does not mutate the source array or its jobs', () => {
        const original = structuredClone(filterFixtures);
        const result = filterJobs(filterFixtures, { department: 'Technology' });
        expect(filterFixtures).toEqual(original);
        expect(result).not.toBe(filterFixtures);
      });
    });

    describe('filter options', () => {
      it('deduplicates and alphabetizes departments without changing the input', () => {
        const original = structuredClone(filterFixtures);
        expect(getDepartments(filterFixtures)).toEqual(['Finance', 'Technology']);
        expect(filterFixtures).toEqual(original);
      });

      it('deduplicates and alphabetizes exact location labels', () => {
        expect(getLocations(filterFixtures)).toEqual([
          'Helsinki, Finland', 'Remote (US & Canada)', 'Woodinville, WA, USA',
        ]);
      });

      it('returns empty options for empty inputs', () => {
        expect(getDepartments([])).toEqual([]);
        expect(getLocations([])).toEqual([]);
      });
    });

    it('returns the raw value when the date is unparseable', () => {
        expect(formatPostedDate('not-a-date')).toBe('not-a-date');
    });
});
