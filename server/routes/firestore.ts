import { Router } from 'express';
import { db } from '../firebase';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/authz';
import { sanitizeForFirestore } from '../lib/firestoreUtils';
import { logger } from '../utils/logger';
import { importTemplatesFromSheets } from '../services/emailTemplateSync';
import { getUserRoles, getTeamTasksScope, splitEmails, shouldShowTeamTasksTab } from '../utils/roleUtils';
import { ttlCache } from '../utils/ttlCache';

const router = Router();

const SETTINGS_CACHE_KEY = 'settings:all';
const SETTINGS_CACHE_TTL = 2 * 60 * 1000; // 2 min
const USERS_CACHE_KEY = 'users:all';
const USERS_CACHE_TTL = 5 * 60 * 1000; // 5 min
const TEAMS_CACHE_KEY = 'teams:all';
const TEAMS_CACHE_TTL = 5 * 60 * 1000; // 5 min
const SUBTEAMS_CACHE_KEY = 'subTeams:all';
const SUBTEAMS_CACHE_TTL = 5 * 60 * 1000; // 5 min

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
  return ttlCache.getOrFetch(TEAMS_CACHE_KEY, TEAMS_CACHE_TTL, async () => {
    const snapshot = await db.collection('teams').get();
    return snapshot.docs.map(doc => doc.data());
  });
}

export async function getAllSubTeamsCached() {
  return ttlCache.getOrFetch(SUBTEAMS_CACHE_KEY, SUBTEAMS_CACHE_TTL, async () => {
    const snapshot = await db.collection('sub_teams').get();
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
    logger.info('[api] querying firestore for teams...');
    const snapshot = await db.collection('teams').get();
    const teams = snapshot.docs.map(d => d.data());
    logger.info('[api] got', snapshot.size, 'teams from firestore');

    // Attach team leader emails and stakeholder emails from settings (cached)
    const settings = await getAllSettingsCached();

    const teamsWithLeaders = teams.map((team: any) => {
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
    const snapshot = await db.collection('templates').get();
    res.json(snapshot.docs.map(d => d.data()));
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
    logger.info('[api] querying firestore for tasks...');
    const snapshot = await db.collection('tasks').get();
    const allTasks = snapshot.docs.map(d => d.data());
    logger.info('[api] got', snapshot.size, 'tasks from firestore');

    // Apply role-based filtering server-side
    const view = (req.query.view as string) || 'all';
    const userEmail = req.user?.email?.toLowerCase() || '';

    // Fetch related data for role computation (cached)
    logger.info('[api] fetching cached data for role computation...');
    const users = await getAllUsersCached();
    logger.info('[api] got users from cache');
    const teams = await getAllTeamsCached();
    logger.info('[api] got teams from cache');
    const subTeams = await getAllSubTeamsCached();
    logger.info('[api] got subTeams from cache');
    const settings = await getAllSettingsCached();
    logger.info('[api] got settings from cache');

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

    res.json(filteredTasks);
  } catch (err) {
    logger.error('getTasks failed:', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task (authenticated users - authorization checked per task)
 */
router.put('/tasks/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    const incoming = req.body;
    const now = new Date().toISOString();

    // Basic authorization: users can edit tasks they're assigned to or admin
    // For now, allow all authenticated users (refine as needed)
    const ref = db.collection('tasks').doc(taskId);
    const existing = await ref.get();
    const merged = existing.exists
      ? { ...existing.data(), ...incoming, UpdatedAt: now }
      : { ...incoming, CreatedAt: now, UpdatedAt: now };

    await ref.set(sanitizeForFirestore(merged), { merge: true });
    // await enqueueSheetsWrite('tasks', 'save', merged);

    res.json(merged);
  } catch (err) {
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
    // await enqueueSheetsWrite('tasks', 'delete', taskId);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteTask failed:', err);
    res.status(500).json({ error: 'Failed to delete task' });
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
    const snapshot = await db.collection('reports').get();
    res.json(snapshot.docs.map(d => d.data()));
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
    const snapshot = await db.collection('followups').get();
    res.json(snapshot.docs.map(d => d.data()));
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

/**
 * PUT /api/settings
 * Update settings (admin only)
 */
router.put('/settings', authenticateToken, requireRole('Admin'), async (req: AuthRequest, res) => {
  try {
    const settingsList = req.body;
    const now = new Date().toISOString();

    for (const setting of settingsList) {
      const ref = db.collection('settings').doc(setting.Key);
      const existing = await ref.get();
      const merged = existing.exists
        ? { ...existing.data(), ...setting, UpdatedAt: now }
        : { ...setting, CreatedAt: now, UpdatedAt: now };
      await ref.set(sanitizeForFirestore(merged), { merge: true });
    }

    // Invalidate settings cache
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
    const snapshot = await db.collection('subtasks').get();
    res.json(snapshot.docs.map(d => d.data()));
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
    const snapshot = await db.collection('comments').get();
    res.json(snapshot.docs.map(d => d.data()));
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
    const snapshot = await db.collection('team_submissions').get();
    res.json(snapshot.docs.map(d => d.data()));
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
    const snapshot = await db.collection('sub_teams').get();
    const subTeams = snapshot.docs.map(d => ({
      ...d.data(),
      id: d.id
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
    // await enqueueSheetsWrite('sub_teams', 'delete', id);
    res.json({ success: true });
  } catch (err) {
    logger.error('deleteSubTeam failed:', err);
    res.status(500).json({ error: 'Failed to delete sub-team' });
  }
});

export default router;
