import { Router, Request, Response } from 'express';
import { cosmosService } from '../services/cosmos.js';

const router = Router();

/**
 * GET /api/adventures
 * List all adventures for current session
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sessionId = (req as any).sessionId;
    const adventures = await cosmosService.listAdventures(sessionId);
    res.json(adventures);
  } catch (error) {
    console.error('List adventures error:', error);
    res.status(500).json({ error: 'Failed to list adventures' });
  }
});

/**
 * GET /api/adventures/:id
 * Get a specific adventure
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sessionId = (req as any).sessionId;
    
    const adventure = await cosmosService.getAdventure(id, sessionId);
    
    if (!adventure) {
      res.status(404).json({ error: 'Adventure not found' });
      return;
    }
    
    res.json(adventure);
  } catch (error) {
    console.error('Get adventure error:', error);
    res.status(500).json({ error: 'Failed to get adventure' });
  }
});

/**
 * POST /api/adventures
 * Create a new adventure
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const sessionId = (req as any).sessionId;
    const adventureData = req.body;
    
    // Add sessionId to adventure
    const adventure = await cosmosService.createAdventure({
      ...adventureData,
      sessionId,
    });
    
    res.status(201).json(adventure);
  } catch (error) {
    console.error('Create adventure error:', error);
    res.status(500).json({ error: 'Failed to create adventure' });
  }
});

/**
 * PUT /api/adventures/:id
 * Update an adventure
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sessionId = (req as any).sessionId;
    const updates = req.body;
    
    const adventure = await cosmosService.updateAdventure(id, sessionId, updates);
    res.json(adventure);
  } catch (error) {
    console.error('Update adventure error:', error);
    const message = (error as Error).message;
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: 'Failed to update adventure' });
    }
  }
});

/**
 * DELETE /api/adventures/:id
 * Delete an adventure
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const sessionId = (req as any).sessionId;
    
    await cosmosService.deleteAdventure(id, sessionId);
    res.status(204).send();
  } catch (error) {
    console.error('Delete adventure error:', error);
    res.status(500).json({ error: 'Failed to delete adventure' });
  }
});

export default router;
