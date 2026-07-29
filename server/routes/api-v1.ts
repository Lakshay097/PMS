import { Router } from 'express';
import { sanitizeForFirestore } from '../utils/firestoreSanitize';
import { db } from '../firebase';
import { authenticateToken } from '../middleware/auth';
import { requireRole } from '../middleware/authz';

const router = Router();

router.get('/api/users', authenticateToken, requireRole('admin', 'lead'), async (_req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) {
    console.error('getUsers failed:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.get('/api/auditlogs', authenticateToken, requireRole('admin'), async (_req, res) => {
  try {
    const snapshot = await db.collection('auditlogs')
      .orderBy('ActionDateTime', 'desc')
      .limit(200)
      .get();
    res.json(snapshot.docs.map(d => d.data()));
  } catch (err) {
    console.error('getAudits failed:', err);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

router.put('/api/users/:email', authenticateToken, async (req: any, res) => {
  try {
    const targetEmail = req.params.email;
    const incoming = req.body;
    const now = new Date().toISOString();

    // AUTHZ: only self-edit or admin
    const isSelf = req.user.Email === targetEmail;
    const isAdmin = req.user.role === 'admin';
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

    // If you have Sheets sync, call it here:
    // await enqueueSheetsWrite('users', 'save', merged);

    res.json(merged); // return what was saved
  } catch (err) {
    console.error('saveUser failed:', err);
    res.status(500).json({ error: 'Failed to save user' });
  }
});

export default router;