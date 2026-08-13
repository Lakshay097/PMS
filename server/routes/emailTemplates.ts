import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  importTemplatesFromSheets,
  listTemplates,
  saveTemplate,
} from '../services/emailTemplateSync';
import { firestoreAdmin } from '../services/firebaseAdmin';
import { convertTimestampsToISO } from '../lib/firestoreUtils';

/**
 * Mount with: app.use('/email-templates', emailTemplatesRouter)
 * Add your existing auth middleware — these must be admin-only routes,
 * and actingUserEmail should come from the verified session/token,
 * NOT the request body.
 */
const router = Router();

// GET /email-templates — current templates (from Firestore)
router.get('/', authenticateToken, async (_req, res) => {
  try {
    res.json({ templates: await listTemplates() });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to list templates' });
  }
});

// POST /email-templates/import — pull everything from the Sheet
router.post('/import', authenticateToken, async (req, res) => {
  try {
    const actingUserEmail = (req as any).user?.email; // from your auth middleware
    if (!actingUserEmail) return res.status(401).json({ error: 'Not authenticated' });
    const templates = await importTemplatesFromSheets(actingUserEmail);
    res.json({ imported: templates.length, templates });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Import from Sheets failed' });
  }
});

// Mapping routes MUST be registered before /:name so "mappings" is not
// treated as a template name (which expects subject/body and returns 400).
// GET /email-templates/mappings — get email type to template mappings
router.get('/mappings', authenticateToken, async (_req, res) => {
  try {
    const mappingsDoc = await firestoreAdmin.collection('settings').doc('email_template_mappings').get();
    if (!mappingsDoc.exists) {
      // Return default mappings if none exist
      const defaultMappings = {
        task_creation: 'template_task_creation',
        task_assignment: 'template_assigned_email',
        task_delay: 'template_delayed_email',
        task_reporting: 'template_task_reporting',
        task_completion: 'template_task_completion',
        scheduled_reminders: 'template_scheduled_reminder',
        scheduled_report_first: 'template_scheduled_report_first',
        report_submitted: 'template_report_submitted',
      };
      res.json({ mappings: defaultMappings });
      return;
    }
    res.json({ mappings: convertTimestampsToISO(mappingsDoc.data()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to get mappings' });
  }
});

// PUT /email-templates/mappings — update email type to template mapping
router.put('/mappings', authenticateToken, async (req, res) => {
  try {
    const actingUserEmail = (req as any).user?.email;
    if (!actingUserEmail) return res.status(401).json({ error: 'Not authenticated' });

    const { emailType, templateName } = req.body ?? {};
    if (typeof emailType !== 'string' || typeof templateName !== 'string') {
      return res.status(400).json({ error: 'emailType and templateName are required strings' });
    }

    console.log(`[MAPPING UPDATE] Updating ${emailType} -> ${templateName} by ${actingUserEmail}`);

    // Get current mappings
    const mappingsDoc = await firestoreAdmin.collection('settings').doc('email_template_mappings').get();
    let currentMappings: Record<string, string> = mappingsDoc.exists ? (convertTimestampsToISO(mappingsDoc.data()) as Record<string, string> || {}) : {};

    console.log('[MAPPING UPDATE] Current mappings before update:', currentMappings);

    // Update the specific mapping
    currentMappings[emailType] = templateName;

    console.log('[MAPPING UPDATE] Updated mappings:', currentMappings);

    // Save back to Firestore
    await firestoreAdmin.collection('settings').doc('email_template_mappings').set(currentMappings);

    console.log('[MAPPING UPDATE] Successfully saved to Firestore');

    res.json({ mappings: currentMappings });
  } catch (err: any) {
    console.error('[MAPPING UPDATE] Error:', err);
    res.status(500).json({ error: err.message ?? 'Failed to update mapping' });
  }
});

// PUT /email-templates/:name — save an edit; dual-writes Firestore + Sheet
router.put('/:name', authenticateToken, async (req, res) => {
  try {
    const actingUserEmail = (req as any).user?.email;
    if (!actingUserEmail) return res.status(401).json({ error: 'Not authenticated' });

    const { subject, body } = req.body ?? {};
    if (typeof subject !== 'string' || typeof body !== 'string') {
      return res.status(400).json({ error: 'subject and body are required strings' });
    }

    const result = await saveTemplate(
      { templateName: req.params.name, subject, body },
      actingUserEmail
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Save failed' });
  }
});

export default router;