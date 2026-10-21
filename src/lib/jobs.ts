/**
 * Pure, side-effect-free helpers for working with job postings.
 *
 * These operate on plain `Job[]` arrays (already loaded from the content
 * collection by the calling page) so they can be unit tested without the Astro
 * content runtime or a database.
 */
import type { Job } from '../types/job';

/** Exact-match facets combined with AND; omitted or empty values impose no restriction. */
export interface JobFilters {
  department?: string;
  location?: string;
}

/**
 * Select roles matching every active facet without mutating the source jobs.
 *
 * @param jobs - Complete role list in the desired display order.
 * @param filters - Exact department and location labels; unknown labels match no roles.
 * @returns A new array of matching roles in their original order.
 */
export function filterJobs(jobs: Job[], filters: JobFilters = {}): Job[] {
  return jobs.filter((job) =>
    (!filters.department || job.department === filters.department) &&
    (!filters.location || job.location === filters.location),
  );
}

/**
 * Derive department options independently of the current filter selections.
 *
 * @param jobs - Complete, unfiltered role list.
 * @returns Unique department labels sorted alphabetically using the English locale.
 */
export function getDepartments(jobs: Job[]): string[] {
  return [...new Set(jobs.map((job) => job.department))].sort((a, b) => a.localeCompare(b, 'en'));
}

/**
 * Derive location options without splitting or normalizing posting labels.
 *
 * @param jobs - Complete, unfiltered role list.
 * @returns Unique full location labels sorted alphabetically using the English locale.
 */
export function getLocations(jobs: Job[]): string[] {
  return [...new Set(jobs.map((job) => job.location))].sort((a, b) => a.localeCompare(b, 'en'));
}

/** Return jobs sorted by posted date, newest first (does not mutate input). */
export function sortByNewest(jobs: Job[]): Job[] {
    return [...jobs].sort(
        (a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime(),
    );
}

/**
 * Format an ISO-8601 date as a human-readable posted date,
 * e.g. "January 5, 2027". Falls back to the raw value if unparseable.
 */
export function formatPostedDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return iso;
    }
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}
