import { Router } from 'express';
import { db } from '../firebase';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/authz';
import { sanitizeForFirestore } from '../lib/firestoreUtils';
import { logger } from '../utils/logger';
import { importTemplatesFromSheets } from '../services/emailTemplateSync';
import { getUserRoles, getTeamTasksScope, splitEmails, shouldShowTeamTasksTab } from '../utils/roleUtils';
import { ttlCache } from '../utils/ttlCache';
import type { Query } from 'firebase-admin/firestore';

const router = Router();

const SETTINGS_CACHE_KEY = 'settings:all';
const SETTINGS_CACHE_TTL = 30 * 60 * 1000; // 30 min — settings change rarely; all write paths invalidate on save
const USERS_CACHE_KEY = 'users:all';
const USERS_CACHE_TTL = 10 * 60 * 1000; // 10 min — users change rarely; all write paths invalidate on save
const TEAMS_CACHE_KEY = 'teams:all';
const TEAMS_CACHE_TTL = 30 * 60 * 1000; // 30 min — teams change rarely; all write paths invalidate on save
const SUBTEAMS_CACHE_KEY = 'subTeams:all';
const SUBTEAMS_CACHE_TTL = 30 * 60 * 1000; // 30 min — sub-teams change rarely; all write paths invalidate on save
const TASKS_CACHE_KEY = 'tasks:all';
const TASKS_CACHE_TTL = 60 * 1000; // 60 s — tasks change often; short TTL limits stale-data window
const TEMPLATES_CACHE_KEY = 'templates:all';
const TEMPLATES_CACHE_TTL = 60 * 60 * 1000; // 60 min — templates are edited infrequently; invalidated on every write
const SUBTASKS_CACHE_KEY = 'subtasks:all';
const SUBTASKS_CACHE_TTL = 5 * 60 * 1000; // 5 min — subtasks change more often than templates
const COMMENTS_CACHE_KEY = 'comments:all';
const COMMENTS_CACHE_TTL = 2 * 60 * 1000; // 2 min — comments are the most frequently written of the six
const REPORTS_CACHE_KEY = 'reports:all';
const REPORTS_CACHE_TTL = 10 * 60 * 1000; // 10 min — reports are append-only (POST only)
const FOLLOWUPS_CACHE_KEY = 'followups:all';
const FOLLOWUPS_CACHE_TTL = 10 * 60 * 1000; // 10 min — followups are append-only (POST only)
const TEAM_SUBMISSIONS_CACHE_KEY = 'team_submissions:all';
const TEAM_SUBMISSIONS_CACHE_TTL = 10 * 60 * 1000; // 10 min — submissions are append-only (POST only)

// In development, module hot-reload can leave stale QuerySnapshot objects in
// the cache. Wipe on startup only in that environment; in production the cache
// is always fresh (new process = empty Map) so this call is a no-op that still
// adds latency on every cold start.
if (process.env.NODE_ENV !== 'production') {
  ttlCache.invalidateAll();
}

export async function getAllSettingsCached() {
  return ttlCache.getOrFetch(SETTINGS_CACHE_KEY, SETTINGS_CACHE_TTL, async () => {
    const snapshot = await db.collection('settings').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllUsersCached() {
  return ttlCache.getOrFetch(USERS_CACHE_KEY, USERS_CACHE_TTL, async () => {
    const snapshot = await db.collection('users').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllTeamsCached() {
  // Try to get from cache, if invalid, invalidate and retry
  const cached = ttlCache.getOrFetch(TEAMS_CACHE_KEY, TEAMS_CACHE_TTL, async () => {
    const snapshot = await db.collection('teams').get();
    const teams = snapshot.docs.map(doc => doc.data());
    logger.info(`[cache] Loaded ${teams.length} teams from Firestore`);
    return teams;
  });

  const data = await cached;
  if (!Array.isArray(data)) {
    logger.error('[cache] teams data is not an array, invalidating and retrying');
    ttlCache.invalidate(TEAMS_CACHE_KEY);
    // Retry by calling the function again
    return getAllTeamsCached();
  }
  return data;
}

export async function getAllSubTeamsCached() {
  // Try to get from cache, if invalid, invalidate and retry
  const cached = ttlCache.getOrFetch(SUBTEAMS_CACHE_KEY, SUBTEAMS_CACHE_TTL, async () => {
    const snapshot = await db.collection('sub_teams').get();
    return snapshot.docs.map(doc => doc.data());
  });

  const data = await cached;
  if (!Array.isArray(data)) {
    logger.error('[cache] subTeams data is not an array, invalidating and retrying');
    ttlCache.invalidate(SUBTEAMS_CACHE_KEY);
    // Retry by calling the function again
    return getAllSubTeamsCached();
  }
  return data;
}

/**
 * Return all tasks, served from a 60-second TTL cache.
 * Invalidated synchronously by every write path (PUT/DELETE /tasks/:id).
 */
export async function getAllTasksCached() {
  return ttlCache.getOrFetch(TASKS_CACHE_KEY, TASKS_CACHE_TTL, async () => {
    const snapshot = await db.collection('tasks').get();
    // Soft-exclude inactive/deleted in memory (same read count; shrinks payload + cache).
    return snapshot.docs
      .map(doc => doc.data())
      .filter((t: any) => t?.Active !== false && !t?.DeletedAt);
  });
}

export async function getAllTemplatesCached() {
  return ttlCache.getOrFetch(TEMPLATES_CACHE_KEY, TEMPLATES_CACHE_TTL, async () => {
    const snapshot = await db.collection('templates').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllSubtasksCached() {
  return ttlCache.getOrFetch(SUBTASKS_CACHE_KEY, SUBTASKS_CACHE_TTL, async () => {
    const snapshot = await db.collection('subtasks').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllCommentsCached() {
  return ttlCache.getOrFetch(COMMENTS_CACHE_KEY, COMMENTS_CACHE_TTL, async () => {
    const snapshot = await db.collection('comments').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllReportsCached() {
  return ttlCache.getOrFetch(REPORTS_CACHE_KEY, REPORTS_CACHE_TTL, async () => {
    const snapshot = await db.collection('reports').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllFollowupsCached() {
  return ttlCache.getOrFetch(FOLLOWUPS_CACHE_KEY, FOLLOWUPS_CACHE_TTL, async () => {
    const snapshot = await db.collection('followups').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllTeamSubmissionsCached() {
  return ttlCache.getOrFetch(TEAM_SUBMISSIONS_CACHE_KEY, TEAM_SUBMISSIONS_CACHE_TTL, async () => {
    const snapshot = await db.collection('team_submissions').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

// ============================================================================
// USERS
// ============================================================================

/**
 * GET /api/users
 * List all users (authenticated users)
 */
router.get('/users', authenticateToken, async (_req, res) => {
  try {
    logger.info('[api/users] route handler called');
    const users = await getAllUsersCached();
    res.json(users);
  } catch (err) {
    logger.error('getUsers failed:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

/**
 * PUT /api/users/:email
 * Update a user (self-edit or admin only)
 */
router.put('/users/:email', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const targetEmail = req.params.email;
    const incoming = req.body;
    const now = new Date().toISOString();

    // AUTHZ: only self-edit or admin
    const isSelf = req.user?.email === targetEmail;
    const isAdmin = req.user?.role === 'Admin';
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Compute merge server-side (authoritative)
    const ref = db.collection('users').doc(targetEmail);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, UpdatedAt: now }
      : { ...incoming, CreatedAt: now, UpdatedAt: now };

    // Write to Firestore
    await ref.set(sanitizeForFirestore(merged), { merge: true });

    // Invalidate users cache
    ttlCache.invalidate(USERS_CACHE_KEY);

    // Queue Sheets sync
    // await enqueueSheetsWrite('users', 'save', merged);

    res.json(merged); // return what was saved
  } catch (err) {
    logger.error('saveUser failed:', err);
    res.status(500).json({ error: 'Failed to save user' });
  }
});

// ============================================================================
// TEAMS
// ============================================================================

/**
 * GET /api/teams
 * List all teams (authenticated users)
 */
router.get('/teams', authenticateToken, async (_req, res) => {
  try {
    logger.info('[api] fetching teams (cache or Firestore)...');
    // Use the cache — avoids a live Firestore collection read on every request.
    const teams = await getAllTeamsCached();
    logger.info('[api] got', teams.length, 'teams');

    // Attach team leader emails and stakeholder emails from settings (cached)
    const settings = await getAllSettingsCached();

    const teamsWithLeaders = (teams as any[]).map((team: any) => {
      const leaderSetting = settings.find((s: any) => s.Key === `team_${team.TeamID}_leaders`);
      const leaderEmails = leaderSetting?.Value
        ? leaderSetting.Value.split(',').map((e: string) => e.trim()).filter(Boolean)
        : [];
      const stakeholderSetting = settings.find((s: any) => s.Key === `team_${team.TeamID}_stakeholders`);
      const stakeholderEmails = stakeholderSetting?.Value
        ? stakeholderSetting.Value.split(',').map((e: string) => e.trim()).filter(Boolean)
        : [];
      return { ...team, TeamLeaderEmails: leaderEmails, StakeholderEmails: stakeholderEmails };
    });

    res.json(teamsWithLeaders);
  } catch (err) {
    logger.error('getTeams failed:', err);
    res.status(500).json({ error: 'Failed to load teams' });
  }
});

/**
 * PUT /teams/:id
 * Update a team (admin only)
 */
router.put('/teams/:id', authenticateToken, requireRole('Admin'), async (req: AuthRequest, res) => {
  try {
    const teamId = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    const ref = db.collection('teams').doc(teamId);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, UpdatedAt: now }
      : { ...incoming, CreatedAt: now, UpdatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });
    ttlCache.invalidate(TEAMS_CACHE_KEY);
    // await enqueueSheetsWrite('teams', 'save', merged);

    res.json(merged);
  } catch (err) {
    logger.error('saveTeam failed:', err);
    res.status(500).json({ error: 'Failed to save team' });
  }
});

/**
 * DELETE /teams/:id
 * Delete a team (admin only)
 */
router.delete('/teams/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const teamId = req.params.id;
    await db.collection('teams').doc(teamId).delete();
    ttlCache.invalidate(TEAMS_CACHE_KEY);
    // await enqueueSheetsWrite('teams', 'delete', teamId);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteTeam failed:', err);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * GET /api/templates
 * List all templates (authenticated users)
 */
router.get('/templates', authenticateToken, async (_req, res) => {
  try {
    const templates = await getAllTemplatesCached();
    res.json(templates);
  } catch (err) {
    logger.error('getTemplates failed:', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

/**
 * PUT /api/templates/:id
 * Update a template (admin/lead only)
 */
router.put('/templates/:id', authenticateToken, requireRole('Admin', 'lead'), async (req: AuthRequest, res) => {
  try {
    const templateId = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    const ref = db.collection('templates').doc(templateId);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, UpdatedAt: now }
      : { ...incoming, CreatedAt: now, UpdatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });
    ttlCache.invalidate(TEMPLATES_CACHE_KEY);
    // await enqueueSheetsWrite('templates', 'save', merged);

    res.json(merged);
  } catch (err) {
    logger.error('saveTemplate failed:', err);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

/**
 * DELETE /api/templates/:id
 * Delete a template (admin/lead only)
 */
router.delete('/templates/:id', authenticateToken, requireRole('Admin', 'lead'), async (req, res) => {
  try {
    const templateId = req.params.id;
    await db.collection('templates').doc(templateId).delete();
    ttlCache.invalidate(TEMPLATES_CACHE_KEY);
    // await enqueueSheetsWrite('templates', 'delete', templateId);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteTemplate failed:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ============================================================================
// TASKS
// ============================================================================

/**
 * GET /api/tasks
 * List all tasks (authenticated users) with role-based filtering
 * Supports query params: view (my-tasks|team-tasks|assigned-by-me)
 */
router.get('/tasks', authenticateToken, async (req: AuthRequest, res) => {
  try {
    logger.info('[api] fetching tasks (cache or Firestore)...');
    const allTasks = await getAllTasksCached();
    logger.info('[api] got', allTasks.length, 'tasks');

    // Apply role-based filtering server-side
    const view = (req.query.view as string) || 'all';
    const userEmail = req.user?.email?.toLowerCase() || '';

    // Fetch related data for role computation (cached)
    logger.info('[api] fetching cached data for role computation...');
    const users = await getAllUsersCached();
    logger.info('[api] got users from cache');
    const teams = await getAllTeamsCached();
    logger.info('[api] got teams from cache, type:', Array.isArray(teams) ? 'array' : typeof teams);
    const subTeams = await getAllSubTeamsCached();
    logger.info('[api] got subTeams from cache');
    const settings = await getAllSettingsCached();
    logger.info('[api] got settings from cache');

    // Ensure teams is an array
    if (!Array.isArray(teams)) {
      logger.error('teams is not an array:', teams);
      throw new Error('teams data is not an array');
    }

    // Attach derived fields to teams and sub-teams
    const teamsWithLeaders = teams.map((team: any) => {
      const leaderSetting = settings.find((s: any) => s.Key === `team_${team.TeamID}_leaders`);
      const leaderEmails = leaderSetting?.Value
        ? leaderSetting.Value.split(',').map((e: string) => e.trim()).filter(Boolean)
        : [];
      return { ...team, TeamLeaderEmails: leaderEmails };
    });

    const subTeamsWithLeaders = subTeams.map((st: any) => {
      const key = `team_${st.TeamID}_subteam_${st.SubTeamID}_leaders`;
      const leaderSetting = settings.find((s: any) => s.Key === key);
      const leaderEmails = leaderSetting?.Value
        ? leaderSetting.Value.split(',').map((e: string) => e.trim()).filter(Boolean)
        : [];
      return { ...st, SubTeamLeaderEmails: leaderEmails };
    });

    // Compute user roles
    const currentUser = {
      Email: req.user?.email,
      Role: req.user?.role,
      TeamIDs: users.find((u: any) => u.Email === req.user?.email)?.TeamIDs,
      SubTeamIDs: users.find((u: any) => u.Email === req.user?.email)?.SubTeamIDs
    };

    const userRoles = getUserRoles(currentUser, teamsWithLeaders, subTeamsWithLeaders, settings as any[]);
    const teamTasksFilter = getTeamTasksScope(currentUser, userRoles, users);
    logger.info('[api] userRoles:', userRoles);
    logger.info('[api] currentUser:', currentUser);
    logger.info('[api] view:', view);

    // Apply view-based filtering
    const filteredTasks = allTasks.filter((task: any) => {
      if (view === 'my-tasks') {
        return splitEmails(task.AssignedToEmail).some(email => 
          email.toLowerCase() === userEmail
        );
      }

      if (view === 'assigned-by-me') {
        return task.AssignedByEmail?.toLowerCase() === userEmail;
      }

      if (view === 'team-tasks') {
        return teamTasksFilter(task);
      }

      // Default: return union of all visible tasks
      const assignedToMe = splitEmails(task.AssignedToEmail).some(email => 
        email.toLowerCase() === userEmail
      );
      const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
      const inTeamScope = teamTasksFilter(task);

      return assignedToMe || assignedByMe || inTeamScope;
    });

    logger.info('[api] filteredTasks count:', filteredTasks.length, 'out of', allTasks.length);
    res.json(filteredTasks);
  } catch (err) {
    logger.error('getTasks failed:', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task (authenticated users - authorization checked per task).
 *
 * The client sends the full task object (including CreatedAt from its local cache)
 * for both creates and updates. To prevent CreatedAt being reset on every edit,
 * we strip it from the payload before writing and rely on Firestore merge semantics:
 * - First write (doc doesn't exist): CreatedAt is absent from payload so Firestore
 *   creates the doc without it. We set it explicitly only on the create path.
 * - Subsequent writes: CreatedAt is absent from payload, so merge preserves the
 *   existing value in Firestore untouched.
 *
 * This keeps the read-free path safe without trusting the client not to send CreatedAt.
 */
router.put('/tasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    // Strip CreatedAt from the client payload — it must not overwrite an existing value.
    const { CreatedAt: _stripped, ...rest } = incoming;

    const ref = db.collection('tasks').doc(taskId);

    // Cost: 1 Firestore read + 1 write per call (transaction.get() always bills as a read;
    // the TTL cache is not consulted inside runTransaction). Item G's read-free optimization
    // does not apply here — we need existence to set CreatedAt exactly once and to close
    // the double-create race that a plain read-then-set would not prevent.
    // Future: split POST (create) / PUT (update) routes to recover the read on the update path.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      // Admin-only: changing StakeholderEmails on an existing task
      if (snap.exists && Object.prototype.hasOwnProperty.call(rest, 'StakeholderEmails')) {
        const prev = Array.isArray(snap.data()?.StakeholderEmails)
          ? [...snap.data()!.StakeholderEmails].map((e: string) => e.toLowerCase()).sort()
          : [];
        const next = Array.isArray(rest.StakeholderEmails)
          ? [...rest.StakeholderEmails].map((e: string) => String(e).toLowerCase()).sort()
          : [];
        const changed = JSON.stringify(prev) !== JSON.stringify(next);
        if (changed && req.user?.role !== 'Admin') {
          throw Object.assign(new Error('Only Admins can add or remove task stakeholders'), { status: 403 });
        }
      }

      const toWrite = snap.exists
        ? sanitizeForFirestore({ ...rest, UpdatedAt: now })
        : sanitizeForFirestore({ ...rest, CreatedAt: now, UpdatedAt: now });
      tx.set(ref, toWrite, { merge: true });
    });

    // Invalidate tasks cache synchronously so a write-then-read sees the new value
    ttlCache.invalidate(TASKS_CACHE_KEY);

    // Return the written shape (without CreatedAt for updates — client already has it)
    res.json(sanitizeForFirestore({ ...rest, UpdatedAt: now }));
  } catch (err: any) {
    if (err?.status === 403 || err?.message?.includes('Only Admins')) {
      return res.status(403).json({ error: 'Only Admins can add or remove task stakeholders' });
    }
    logger.error('saveTask failed:', err);
    res.status(500).json({ error: 'Failed to save task' });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task (admin only)
 */
router.delete('/tasks/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const taskId = req.params.id;
    await db.collection('tasks').doc(taskId).delete();

    // Invalidate tasks cache synchronously
    ttlCache.invalidate(TASKS_CACHE_KEY);

    // await enqueueSheetsWrite('tasks', 'delete', taskId);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteTask failed:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * PATCH /api/tasks/:id/stakeholders
 * Admin-only: replace StakeholderEmails on a task.
 * Returns { task, added, removed } so callers can email only newly added stakeholders.
 */
router.patch('/tasks/:id/stakeholders', authenticateToken, requireRole('Admin'), async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    const incoming = req.body?.stakeholderEmails;

    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'stakeholderEmails must be an array of email strings' });
    }

    const nextEmails = [...new Set(
      incoming
        .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
        .filter(Boolean)
    )];

    const ref = db.collection('tasks').doc(taskId);
    const now = new Date().toISOString();

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw Object.assign(new Error('Task not found'), { status: 404 });
      }
      const existing = snap.data() || {};
      const previous: string[] = Array.isArray(existing.StakeholderEmails)
        ? existing.StakeholderEmails
        : [];

      const prevLower = new Set(previous.map((e: string) => e.toLowerCase()));
      const nextLower = new Set(nextEmails.map((e: string) => e.toLowerCase()));
      const added = nextEmails.filter((e: string) => !prevLower.has(e.toLowerCase()));
      const removed = previous.filter((e: string) => !nextLower.has(e.toLowerCase()));

      const updated = sanitizeForFirestore({
        ...existing,
        StakeholderEmails: nextEmails,
        UpdatedAt: now,
      });
      tx.set(ref, updated, { merge: true });
      return { task: updated, added, removed, previous };
    });

    ttlCache.invalidate(TASKS_CACHE_KEY);
    res.json(result);
  } catch (err: any) {
    if (err?.status === 404 || err?.message === 'Task not found') {
      return res.status(404).json({ error: 'Task not found' });
    }
    logger.error('updateTaskStakeholders failed:', err);
    res.status(500).json({ error: 'Failed to update stakeholders' });
  }
});

/**
 * GET /api/tasks/counts
 * Aggregation counts without fetching documents (1 read per count query).
 * Query params: status (optional exact Status value)
 */
router.get('/tasks/counts', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    let query: Query = db.collection('tasks');
    if (status && status !== 'All') {
      query = query.where('Status', '==', status);
    }
    // Prefer Active tasks when the field is present on documents
    try {
      const activeQuery = query.where('Active', '==', true);
      const snap = await activeQuery.count().get();
      return res.json({ count: snap.data().count, scoped: 'active' });
    } catch {
      const snap = await query.count().get();
      return res.json({ count: snap.data().count, scoped: 'all' });
    }
  } catch (err) {
    logger.error('getTaskCounts failed:', err);
    res.status(500).json({ error: 'Failed to count tasks' });
  }
});

/**
 * GET /api/tasks/page
 * Cursor-based pagination for the Tasks list (avoids full-collection transfer).
 * Query: limit (default 50, max 100), startAfterId, status, assigneeEmail
 */
router.get('/tasks/page', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || '50'), 10);
    const pageSize = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 100);
    const startAfterId = typeof req.query.startAfterId === 'string' ? req.query.startAfterId : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const assigneeEmail = typeof req.query.assigneeEmail === 'string'
      ? req.query.assigneeEmail.trim().toLowerCase()
      : '';

    // Base query: order by TaskID for stable cursors.
    // Status can be applied server-side; assignee is comma-joined so filtered in memory after a bounded page.
    let query: Query = db.collection('tasks').orderBy('TaskID');
    if (status && status !== 'All' && !['Active', 'Overdue', 'Due Today'].includes(status)) {
      query = db.collection('tasks').where('Status', '==', status).orderBy('TaskID');
    }

    if (startAfterId) {
      query = query.startAfter(startAfterId);
    }

    // Over-fetch when assignee filter is present so a page still fills after client-side match
    const fetchSize = assigneeEmail ? Math.min(pageSize * 3, 150) : pageSize;
    const snapshot = await query.limit(fetchSize).get();
    let tasks = snapshot.docs.map(doc => doc.data());

    if (assigneeEmail) {
      tasks = tasks.filter((t: any) => {
        const assignees = String(t.AssignedToEmail || '')
          .split(',')
          .map((e: string) => e.trim().toLowerCase())
          .filter(Boolean);
        const stakeholders = Array.isArray(t.StakeholderEmails)
          ? t.StakeholderEmails.map((e: string) => e.toLowerCase())
          : [];
        return assignees.includes(assigneeEmail) || stakeholders.includes(assigneeEmail);
      }).slice(0, pageSize);
    }

    const lastId = tasks.length > 0 ? tasks[tasks.length - 1].TaskID : null;
    res.json({
      tasks,
      pageSize,
      nextCursor: lastId,
      hasMore: snapshot.size >= fetchSize,
    });
  } catch (err) {
    logger.error('getTasksPage failed:', err);
    res.status(500).json({ error: 'Failed to load paginated tasks' });
  }
});

// ============================================================================
// REPORTS
// ============================================================================

/**
 * GET /api/reports
 * List all reports (authenticated users)
 */
router.get('/reports', authenticateToken, async (_req, res) => {
  try {
    const reports = await getAllReportsCached();
    res.json(reports);
  } catch (err) {
    logger.error('getReports failed:', err);
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

/**
 * POST /api/reports
 * Create a new report (authenticated users)
 */
router.post('/reports', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const report = req.body;
    const now = new Date().toISOString();

    const reportToSave = {
      ...report,
      CreatedAt: now,
      UpdatedAt: now
    };

    await db.collection('reports').doc(report.ReportID).set(sanitizeForFirestore(reportToSave));
    ttlCache.invalidate(REPORTS_CACHE_KEY);
    // await enqueueSheetsWrite('reports', 'save', reportToSave);

    res.json(reportToSave);
  } catch (err) {
    logger.error('saveReport failed:', err);
    res.status(500).json({ error: 'Failed to save report' });
  }
});

// ============================================================================
// FOLLOWUPS
// ============================================================================

/**
 * GET /api/followups
 * List all followups (authenticated users)
 */
router.get('/followups', authenticateToken, async (_req, res) => {
  try {
    const followups = await getAllFollowupsCached();
    res.json(followups);
  } catch (err) {
    logger.error('getFollowups failed:', err);
    res.status(500).json({ error: 'Failed to load followups' });
  }
});

/**
 * POST /api/followups
 * Create a new followup (authenticated users)
 */
router.post('/followups', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const followup = req.body;
    const now = new Date().toISOString();

    const followupToSave = {
      ...followup,
      CreatedAt: now,
      UpdatedAt: now
    };

    await db.collection('followups').doc(followup.FollowUpID).set(sanitizeForFirestore(followupToSave));
    ttlCache.invalidate(FOLLOWUPS_CACHE_KEY);
    // await enqueueSheetsWrite('followups', 'save', followupToSave);

    res.json(followupToSave);
  } catch (err) {
    logger.error('saveFollowup failed:', err);
    res.status(500).json({ error: 'Failed to save followup' });
  }
});

// ============================================================================
// SETTINGS
// ============================================================================

/**
 * GET /api/settings
 * List all settings (authenticated users)
 */
router.get('/settings', authenticateToken, async (_req, res) => {
  try {
    const settings = await getAllSettingsCached();
    res.json(settings);
  } catch (err) {
    logger.error('getSettings failed:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Firestore WriteBatch hard limit
const BATCH_CHUNK_SIZE = 500;

/**
 * PUT /api/settings
 * Update settings (admin only).
 * Uses WriteBatch for atomic all-or-nothing writes instead of N serial round-trips.
 * Semantics change vs. old code: either ALL settings commit or NONE do (atomic).
 * The old code had partial-success risk (settings 1-2 saved even if 3 failed);
 * all-or-nothing is strictly safer for a "save settings" action.
 */
router.put('/settings', authenticateToken, requireRole('Admin'), async (req: AuthRequest, res) => {
  try {
    const settingsList: any[] = req.body;
    if (!Array.isArray(settingsList) || settingsList.length === 0) {
      return res.status(400).json({ error: 'settingsList must be a non-empty array' });
    }
    const now = new Date().toISOString();

    // Chunk into batches of ≤500 to respect Firestore's WriteBatch hard limit
    for (let i = 0; i < settingsList.length; i += BATCH_CHUNK_SIZE) {
      const chunk = settingsList.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();
      for (const setting of chunk) {
        const ref = db.collection('settings').doc(setting.Key);
        // set({merge:true}) only touches provided fields — safe for partial payloads.
        // UpdatedAt is injected server-side; CallerAt is set on first create by Firestore
        // (merge means existing fields like CreatedAt are preserved automatically).
        batch.set(ref, sanitizeForFirestore({ ...setting, UpdatedAt: now }), { merge: true });
      }
      await batch.commit();
    }

    // Invalidate settings cache after all chunks committed
    ttlCache.invalidate(SETTINGS_CACHE_KEY);

    // await enqueueSheetsWrite('settings', 'save', settingsList);

    res.json(settingsList);
  } catch (err) {
    logger.error('saveSettings failed:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ============================================================================
// SUBTASKS
// ============================================================================

/**
 * GET /api/subtasks
 * List all subtasks (authenticated users)
 */
router.get('/subtasks', authenticateToken, async (_req, res) => {
  try {
    const subtasks = await getAllSubtasksCached();
    res.json(subtasks);
  } catch (err) {
    logger.error('getSubtasks failed:', err);
    res.status(500).json({ error: 'Failed to load subtasks' });
  }
});

/**
 * PUT /api/subtasks/:id
 * Update a subtask (authenticated users)
 */
router.put('/subtasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const subtaskId = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    const ref = db.collection('subtasks').doc(subtaskId);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, UpdatedAt: now }
      : { ...incoming, CreatedAt: now, UpdatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });
    ttlCache.invalidate(SUBTASKS_CACHE_KEY);
    // await enqueueSheetsWrite('subtasks', 'save', merged);

    res.json(merged);
  } catch (err) {
    logger.error('saveSubtask failed:', err);
    res.status(500).json({ error: 'Failed to save subtask' });
  }
});

/**
 * DELETE /api/subtasks/:id
 * Delete a subtask (admin only)
 */
router.delete('/subtasks/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const subtaskId = req.params.id;
    await db.collection('subtasks').doc(subtaskId).delete();
    ttlCache.invalidate(SUBTASKS_CACHE_KEY);
    // await enqueueSheetsWrite('subtasks', 'delete', subtaskId);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteSubtask failed:', err);
    res.status(500).json({ error: 'Failed to delete subtask' });
  }
});

// ============================================================================
// COMMENTS
// ============================================================================

/**
 * GET /api/comments
 * List all comments (authenticated users)
 */
router.get('/comments', authenticateToken, async (_req, res) => {
  try {
    const comments = await getAllCommentsCached();
    res.json(comments);
  } catch (err) {
    logger.error('getComments failed:', err);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

/**
 * PUT /api/comments/:id
 * Update a comment (authenticated users)
 */
router.put('/comments/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const commentId = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    const ref = db.collection('comments').doc(commentId);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, UpdatedAt: now }
      : { ...incoming, CreatedAt: now, UpdatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });
    ttlCache.invalidate(COMMENTS_CACHE_KEY);
    // await enqueueSheetsWrite('comments', 'save', merged);

    res.json(merged);
  } catch (err) {
    logger.error('saveComment failed:', err);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

/**
 * DELETE /api/comments/:id
 * Delete a comment (admin or comment author)
 */
router.delete('/comments/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const commentId = req.params.id;
    const isAdmin = req.user?.role === 'Admin';
    
    // TODO: Check if user is the comment author
    // For now, allow admin only
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await db.collection('comments').doc(commentId).delete();
    ttlCache.invalidate(COMMENTS_CACHE_KEY);
    // await enqueueSheetsWrite('comments', 'delete', commentId);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteComment failed:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ============================================================================
// TEAM SUBMISSIONS
// ============================================================================

/**
 * GET /api/team-submissions
 * List all team submissions (authenticated users)
 */
router.get('/team-submissions', authenticateToken, async (_req, res) => {
  try {
    const submissions = await getAllTeamSubmissionsCached();
    res.json(submissions);
  } catch (err) {
    logger.error('getTeamSubmissions failed:', err);
    res.status(500).json({ error: 'Failed to load team submissions' });
  }
});

/**
 * POST /api/team-submissions
 * Create a new team submission (authenticated users)
 */
router.post('/team-submissions', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const submission = req.body;
    const now = new Date().toISOString();

    const submissionToSave = {
      ...submission,
      CreatedAt: now,
      UpdatedAt: now
    };

    await db.collection('team_submissions').doc(submission.SubmissionID).set(sanitizeForFirestore(submissionToSave));
    ttlCache.invalidate(TEAM_SUBMISSIONS_CACHE_KEY);
    // await enqueueSheetsWrite('team_submissions', 'save', submissionToSave);

    res.json(submissionToSave);
  } catch (err) {
    logger.error('saveTeamSubmission failed:', err);
    res.status(500).json({ error: 'Failed to save team submission' });
  }
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

/**
 * GET /api/auditlogs
 * List recent audit logs (authenticated users)
 */
router.get('/auditlogs', authenticateToken, async (_req, res) => {
  try {
    const snapshot = await db.collection('auditlogs')
      .orderBy('ActionDateTime', 'desc')
      .limit(200)
      .get();
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) {
    logger.error('getAudits failed:', err);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

/**
 * POST /api/auditlogs
 * Create an audit log entry (authenticated users)
 */
router.post('/auditlogs', authenticateToken, async (req, res) => {
  try {
    const logRecord = req.body;
    const now = new Date().toISOString();

    const logToSave = {
      ...logRecord,
      ActionDateTime: logRecord.ActionDateTime || now
    };

    await db.collection('auditlogs').add(sanitizeForFirestore(logToSave));
    res.json(logToSave);
  } catch (err) {
    logger.error('createAuditLog failed:', err);
    res.status(500).json({ error: 'Failed to create audit log' });
  }
});

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

/**
 * GET /api/email-templates
 * List all email templates (admin only)
 */
router.get('/email-templates', authenticateToken, requireRole('Admin'), async (_req, res) => {
  try {
    const snapshot = await db.collection('email_templates').get();
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) {
    logger.error('getEmailTemplates failed:', err);
    res.status(500).json({ error: 'Failed to load email templates' });
  }
});

/**
 * POST /api/email-templates/import
 * Pull all templates from the Sheet and sync into Firestore
 */
router.post('/email-templates/import', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const actingUserEmail = (req as any).user?.email;
    if (!actingUserEmail) return res.status(401).json({ error: 'Not authenticated' });

    const templates = await importTemplatesFromSheets(actingUserEmail);
    res.json({ imported: templates.length, templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Import from Sheets failed' });
  }
});

/**
 * PUT /api/email-templates/:name
 * Update an email template (admin only)
 */
router.put('/email-templates/:name', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const name = req.params.name;
    const incoming = req.body;
    const now = new Date().toISOString();

    const ref = db.collection('email_templates').doc(name);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, updatedAt: now }
      : { ...incoming, createdAt: now, updatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });

    // Sync to email template API (commented out for now)
    // await api.post('/email/templates', {
    //   templateName: merged.templateName,
    //   subject: merged.subject,
    //   body: merged.body,
    // });

    res.json(merged);
  } catch (err) {
    logger.error('saveEmailTemplate failed:', err);
    res.status(500).json({ error: 'Failed to save email template' });
  }
});

/**
 * DELETE /api/email-templates/:name
 * Delete an email template (admin only)
 */
router.delete('/email-templates/:name', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const name = req.params.name;
    await db.collection('email_templates').doc(name).delete();
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteEmailTemplate failed:', err);
    res.status(500).json({ error: 'Failed to delete email template' });
  }
});

// ============================================================================
// SUB TEAMS
// ============================================================================

/**
 * GET /api/sub-teams
 * List all sub-teams (authenticated users)
 */
router.get('/sub-teams', authenticateToken, async (_req, res) => {
  try {
    // Use the cache — avoids a live Firestore collection read on every request.
    const rawSubTeams = await getAllSubTeamsCached();

    // getAllSubTeamsCached returns plain data objects; re-attach the doc id field
    // that the old live query used to add (used by the client as a React key).
    // The SubTeamID field already carries the same value, so we only add `id` for
    // backward-compat with any client code that reads `st.id` directly.
    const subTeams = (rawSubTeams as any[]).map((st: any) => ({
      ...st,
      id: st.SubTeamID ?? st.id,
    }));

    // Attach sub-team leader emails from settings (cached)
    const settings = await getAllSettingsCached();

    const subTeamsWithLeaders = subTeams.map((st: any) => {
      const key = `team_${st.TeamID}_subteam_${st.SubTeamID}_leaders`;
      const leaderSetting = settings.find((s: any) => s.Key === key);
      const leaderEmails = leaderSetting?.Value
        ? leaderSetting.Value.split(',').map((e: string) => e.trim()).filter(Boolean)
        : [];
      return { ...st, SubTeamLeaderEmails: leaderEmails };
    });

    res.json(subTeamsWithLeaders);
  } catch (err) {
    logger.error('getSubTeams failed:', err);
    res.status(500).json({ error: 'Failed to load sub-teams' });
  }
});

/**
 * PUT /api/sub-teams/:id
 * Update a sub-team (authenticated users)
 */
router.put('/sub-teams/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    // Strip derived field before persisting
    const { SubTeamLeaderEmails: _derived, ...persistable } = incoming;

    const ref = db.collection('sub_teams').doc(id);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...persistable, UpdatedAt: now }
      : { ...persistable, CreatedAt: now, UpdatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });
    ttlCache.invalidate(SUBTEAMS_CACHE_KEY);
    // await enqueueSheetsWrite('sub_teams', 'save', merged);

    // Return with derived field for client
    res.json({ ...merged, SubTeamLeaderEmails: incoming.SubTeamLeaderEmails ?? [] });
  } catch (err) {
    logger.error('saveSubTeam failed:', err);
    res.status(500).json({ error: 'Failed to save sub-team' });
  }
});

/**
 * DELETE /api/sub-teams/:id
 * Delete a sub-team (authenticated users)
 */
router.delete('/sub-teams/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    await db.collection('sub_teams').doc(id).delete();
    ttlCache.invalidate(SUBTEAMS_CACHE_KEY);
    // await enqueueSheetsWrite('sub_teams', 'delete', id);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteSubTeam failed:', err);
    res.status(500).json({ error: 'Failed to delete sub-team' });
  }
});

export default router;
