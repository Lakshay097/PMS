// src/utils/taskStatus.ts
// Single source of truth for collapsing the stored TaskStatus enum onto the
// four statuses the product now uses. Nothing writes new legacy values, but
// existing Firestore docs may still hold them, so we normalize on read instead
// of deleting enum members (which would break taskEngine, filters, and badges
// and orphan stored data).

import { TaskStatus } from '../types';

// The four statuses surfaced everywhere in the UI. "Completed" is stored as
// the 'Closed' enum value; this type reflects the stored value.
export type ActiveStatus = 'In Progress' | 'On Hold' | 'Dropped' | 'Closed';

// Human-facing label for an ActiveStatus. 'Closed' reads as "Completed".
export const STATUS_LABEL: Record<ActiveStatus, string> = {
  'In Progress': 'In Progress',
  'On Hold': 'On Hold',
  'Dropped': 'Dropped',
  'Closed': 'Completed',
};

/**
 * Map any stored status onto one of the four active statuses.
 * - Closed / Reviewed        -> Closed   (done)
 * - On Hold                  -> On Hold
 * - Dropped                  -> Dropped
 * - everything else          -> In Progress
 *   (Not Started, Submitted, Reopened, Overdue — Overdue is computed from the
 *    due date elsewhere, so it collapses back into the active bucket here.)
 */
export function normalizeStatus(raw: TaskStatus | string | undefined | null): ActiveStatus {
  switch (raw) {
    case 'On Hold':
      return 'On Hold';
    case 'Dropped':
      return 'Dropped';
    case 'Closed':
    case 'Reviewed':
      return 'Closed';
    default:
      return 'In Progress';
  }
}

/** Convenience: the human label for any stored status. */
export function statusLabel(raw: TaskStatus | string | undefined | null): string {
  return STATUS_LABEL[normalizeStatus(raw)];
}

/** A task counts as done when it normalizes to Closed. */
export function isDoneStatus(raw: TaskStatus | string | undefined | null): boolean {
  return normalizeStatus(raw) === 'Closed';
}