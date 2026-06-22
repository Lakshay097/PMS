import { Router } from 'express';
import authRoutes from './auth';
import uploadRoutes from './upload';
import tokenRoutes from './token';
import sheetsRoutes from './sheets';

const router = Router();

// Mount route modules
router.use('/', authRoutes);
router.use('/', uploadRoutes);
router.use('/', tokenRoutes);
router.use('/sheets', sheetsRoutes);

export default router;
