import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  importTemplatesFromSheets,
  listTemplates,
  saveTemplate,
} from '../services/emailTemplateSync';

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