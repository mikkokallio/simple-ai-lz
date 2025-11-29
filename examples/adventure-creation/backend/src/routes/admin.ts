import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from './auth.js';
import { userService } from '../services/users.js';
import { templateService } from '../services/templates.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireRole('admin'));

/**
 * GET /api/admin/users
 * List all users
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await userService.listUsers();
    res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Update user role
 */
router.put('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['pending', 'user', 'premium', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const user = await userService.updateUserRole(id, role);
    res.json(user);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * GET /api/admin/templates
 * List all custom templates
 */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const templates = await templateService.listTemplates();
    res.json(templates);
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * POST /api/admin/templates
 * Save structure as template
 */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const templateData = req.body;
    const template = await templateService.createTemplate(templateData);
    res.status(201).json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * DELETE /api/admin/templates/:id
 * Delete a template
 */
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await templateService.deleteTemplate(id);
    res.status(204).send();
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
