import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Task } from '../types';
import {
  taskMatchesFilters,
  matchesStatusFilter,
  matchesAssigneeFilter,
  getNewlyAddedEmails,
} from './taskFilterUtils';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    TaskID: 'T-1',
    TemplateID: null,
    ParentTaskID: null,
    Title: 'Sample task',
    Description: 'Desc',
    Priority: ['Medium'],
    TaskType: 'One-time',
    RecurrenceType: 'One-time',
    CycleKey: null,
    StartDate: '2026-08-01',
    DueDate: '2026-08-15',
    AssignedByEmail: 'boss@example.com',
    AssignedToEmail: 'alice@example.com',
    AssignedToRole: 'Stakeholder',
    AssignedToTeamIDs: ['team-1'],
    StakeholderEmails: [],
    Status: 'In Progress',
    PercentComplete: 10,
    LastReportSummary: '',
    RequiresFollowUp: 'No',
    FollowUpCount: 0,
    CompletionDate: null,
    CloseRemark: null,
    ClosedInSubTeamIDs: null,
    AttachmentLink: '',
    CreatedAt: '2026-08-01T00:00:00.000Z',
    UpdatedAt: '2026-08-01T00:00:00.000Z',
    Active: true,
    DeletedAt: null,
    ...overrides,
  };
}

describe('taskMatchesFilters — combination AND logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-12T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Assignee alone filters to that assignee', () => {
    const alice = makeTask({ AssignedToEmail: 'alice@example.com', Status: 'In Progress' });
    const bob = makeTask({ TaskID: 'T-2', AssignedToEmail: 'bob@example.com', Status: 'In Progress' });

    expect(taskMatchesFilters(alice, { assignee: 'alice@example.com' })).toBe(true);
    expect(taskMatchesFilters(bob, { assignee: 'alice@example.com' })).toBe(false);
  });

  it('Status alone filters by status', () => {
    const inProgress = makeTask({ Status: 'In Progress' });
    const closed = makeTask({ TaskID: 'T-2', Status: 'Closed' });

    expect(taskMatchesFilters(inProgress, { status: ['In Progress'] })).toBe(true);
    expect(taskMatchesFilters(closed, { status: ['In Progress'] })).toBe(false);
  });

  it('Assignee + Status together use AND (regression: status must not override assignee)', () => {
    const aliceInProgress = makeTask({
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
    });
    const bobInProgress = makeTask({
      TaskID: 'T-2',
      AssignedToEmail: 'bob@example.com',
      Status: 'In Progress',
    });
    const aliceSubmitted = makeTask({
      TaskID: 'T-3',
      AssignedToEmail: 'alice@example.com',
      Status: 'Submitted',
    });

    const filters = { status: ['In Progress'], assignee: 'alice@example.com' };

    expect(taskMatchesFilters(aliceInProgress, filters)).toBe(true);
    expect(taskMatchesFilters(bobInProgress, filters)).toBe(false);
    expect(taskMatchesFilters(aliceSubmitted, filters)).toBe(false);
  });

  it('Assignee + Status + date range (third filter) all AND together', () => {
    const match = makeTask({
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
      DueDate: '2026-08-15',
    });
    const wrongDate = makeTask({
      TaskID: 'T-2',
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
      DueDate: '2026-09-01',
    });
    const wrongAssignee = makeTask({
      TaskID: 'T-3',
      AssignedToEmail: 'bob@example.com',
      Status: 'In Progress',
      DueDate: '2026-08-15',
    });

    const filters = {
      status: ['In Progress'],
      assignee: 'alice@example.com',
      dateFrom: '2026-08-10',
      dateTo: '2026-08-20',
    };

    expect(taskMatchesFilters(match, filters)).toBe(true);
    expect(taskMatchesFilters(wrongDate, filters)).toBe(false);
    expect(taskMatchesFilters(wrongAssignee, filters)).toBe(false);
  });

  it('switching Status while Assignee stays selected re-filters with AND', () => {
    const aliceInProgress = makeTask({
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
    });
    const aliceOnHold = makeTask({
      TaskID: 'T-2',
      AssignedToEmail: 'alice@example.com',
      Status: 'On Hold',
    });
    const bobOnHold = makeTask({
      TaskID: 'T-3',
      AssignedToEmail: 'bob@example.com',
      Status: 'On Hold',
    });

    const withInProgress = { status: ['In Progress'], assignee: 'alice@example.com' };
    expect(taskMatchesFilters(aliceInProgress, withInProgress)).toBe(true);
    expect(taskMatchesFilters(aliceOnHold, withInProgress)).toBe(false);

    // Same assignee, status switched to On Hold — bob must still be excluded
    const withOnHold = { status: ['On Hold'], assignee: 'alice@example.com' };
    expect(taskMatchesFilters(aliceOnHold, withOnHold)).toBe(true);
    expect(taskMatchesFilters(bobOnHold, withOnHold)).toBe(false);
    expect(taskMatchesFilters(aliceInProgress, withOnHold)).toBe(false);
  });

  it('search + assignee + status combine with AND', () => {
    const match = makeTask({
      Title: 'Fix login bug',
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
    });
    const wrongTitle = makeTask({
      TaskID: 'T-2',
      Title: 'Other work',
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
    });

    const filters = {
      status: ['In Progress'],
      assignee: 'alice@example.com',
      searchQuery: 'login',
    };

    expect(taskMatchesFilters(match, filters)).toBe(true);
    expect(taskMatchesFilters(wrongTitle, filters)).toBe(false);
  });

  it('Overdue status + assignee still respects assignee', () => {
    const aliceOverdue = makeTask({
      AssignedToEmail: 'alice@example.com',
      Status: 'In Progress',
      DueDate: '2026-08-01',
    });
    const bobOverdue = makeTask({
      TaskID: 'T-2',
      AssignedToEmail: 'bob@example.com',
      Status: 'In Progress',
      DueDate: '2026-08-01',
    });

    const filters = { status: ['Overdue'], assignee: 'alice@example.com' };
    expect(taskMatchesFilters(aliceOverdue, filters)).toBe(true);
    expect(taskMatchesFilters(bobOverdue, filters)).toBe(false);
  });
});

describe('matchesStatusFilter / matchesAssigneeFilter unit cases', () => {
  it('empty status means no status filter', () => {
    expect(matchesStatusFilter(makeTask(), [])).toBe(true);
    expect(matchesStatusFilter(makeTask(), 'All')).toBe(true);
  });

  it('assignee filter matches StakeholderEmails as well as AssignedToEmail', () => {
    const task = makeTask({
      AssignedToEmail: 'alice@example.com',
      StakeholderEmails: ['viewer@example.com'],
    });
    expect(matchesAssigneeFilter(task, 'viewer@example.com')).toBe(true);
    expect(matchesAssigneeFilter(task, 'nobody@example.com')).toBe(false);
  });
});

describe('getNewlyAddedEmails', () => {
  it('returns only newly added emails (case-insensitive)', () => {
    expect(
      getNewlyAddedEmails(
        ['alice@example.com', 'bob@example.com'],
        ['Alice@example.com', 'carol@example.com', 'bob@example.com']
      )
    ).toEqual(['carol@example.com']);
  });

  it('returns empty when nothing new', () => {
    expect(getNewlyAddedEmails(['a@x.com'], ['a@x.com'])).toEqual([]);
  });
});
