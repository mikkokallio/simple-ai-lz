import { Router, Request, Response } from 'express';
import { openaiService } from '../services/openai.js';

const router = Router();

/**
 * POST /api/ai/chat
 * Chat completion using GPT-4
 * Replaces window.spark.llmPrompt() from frontend
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }
    
    const response = await openaiService.chatCompletion(messages);
    res.json({ content: response });
  } catch (error) {
    console.error('Chat completion error:', error);
    res.status(500).json({ error: 'Failed to generate chat completion' });
  }
});

/**
 * POST /api/ai/portrait
 * Generate NPC portrait using DALL-E 3
 * Same as frontend implementation but server-side
 */
router.post('/portrait', async (req: Request, res: Response) => {
  try {
    const { appearance, characterName } = req.body;
    
    if (!appearance) {
      res.status(400).json({ error: 'Appearance description is required' });
      return;
    }
    
    const imageUrl = await openaiService.generatePortrait(appearance, characterName);
    res.json({ url: imageUrl });
  } catch (error) {
    console.error('Portrait generation error:', error);
    const message = (error as Error).message;
    res.status(500).json({ error: message || 'Failed to generate portrait' });
  }
});

export default router;
