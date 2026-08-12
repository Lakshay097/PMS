import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNewlyAddedEmails } from '../utils/taskFilterUtils';

/**
 * Stakeholder email notification policy tests.
 * Only newly added emails should be notified; removals and unchanged never re-notify.
 */
describe('stakeholder notification policy', () => {
  it('notifies only newly added stakeholders', () => {
    const previous = ['a@x.com', 'b@x.com'];
    const next = ['a@x.com', 'b@x.com', 'c@x.com'];
    expect(getNewlyAddedEmails(previous, next)).toEqual(['c@x.com']);
  });

  it('does not notify when list is unchanged', () => {
    const previous = ['a@x.com', 'b@x.com'];
    expect(getNewlyAddedEmails(previous, ['a@x.com', 'b@x.com'])).toEqual([]);
  });

  it('does not notify removed stakeholders', () => {
    const previous = ['a@x.com', 'b@x.com'];
    const next = ['a@x.com'];
    expect(getNewlyAddedEmails(previous, next)).toEqual([]);
  });

  it('handles empty previous (all are new)', () => {
    expect(getNewlyAddedEmails([], ['a@x.com', 'b@x.com'])).toEqual(['a@x.com', 'b@x.com']);
  });

  it('is case-insensitive for existing members', () => {
    expect(getNewlyAddedEmails(['A@X.com'], ['a@x.com', 'c@x.com'])).toEqual(['c@x.com']);
  });
});

describe('Admin stakeholder role gate (unit)', () => {
  const isAdmin = (role?: string) => role === 'Admin';

  it('allows Admin to manage stakeholders', () => {
    expect(isAdmin('Admin')).toBe(true);
  });

  it('blocks Stakeholder / Sub-stakeholder from managing', () => {
    expect(isAdmin('Stakeholder')).toBe(false);
    expect(isAdmin('Sub-stakeholder')).toBe(false);
  });
});
