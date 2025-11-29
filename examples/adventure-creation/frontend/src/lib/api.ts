// API client for backend communication
// Replaces Spark's built-in storage and LLM APIs

import { User } from '@/types/auth'

// Runtime configuration from nginx-injected env-config.js
declare global {
  interface Window {
    ENV?: {
      BACKEND_URL?: string;
    };
  }
}

// In development: use localhost
// In production: use nginx-injected BACKEND_URL or derive from current origin
const API_BASE_URL = window.ENV?.BACKEND_URL 
  || (import.meta.env.DEV ? 'http://localhost:8080' : '');

// Get session ID from localStorage (create if doesn't exist)
function getSessionId(): string {
  let sessionId = localStorage.getItem('adventure-session-id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('adventure-session-id', sessionId);
  }
  return sessionId;
}

// Generic fetch wrapper with error handling
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const sessionId = getSessionId();
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies for session auth
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Adventure API
export const adventureAPI = {
  list: () => apiFetch<any[]>('/api/adventures'),
  
  get: (id: string) => apiFetch<any>(`/api/adventures/${id}`),
  
  create: (adventure: any) => apiFetch<any>('/api/adventures', {
    method: 'POST',
    body: JSON.stringify(adventure),
  }),
  
  update: (id: string, updates: any) => apiFetch<any>(`/api/adventures/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  }),
  
  delete: (id: string) => apiFetch<void>(`/api/adventures/${id}`, {
    method: 'DELETE',
  }),
};

// AI API
export const aiAPI = {
  /**
   * Chat completion (replaces window.spark.llmPrompt)
   */
  chat: async (messages: Array<{ role: string; content: string }>): Promise<string> => {
    const response = await apiFetch<{ content: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    });
    return response.content;
  },
  
  /**
   * Generate NPC portrait (replaces frontend DALL-E call)
   */
  generatePortrait: async (appearance: string, characterName?: string): Promise<string> => {
    const response = await apiFetch<{ url: string }>('/api/ai/portrait', {
      method: 'POST',
      body: JSON.stringify({ appearance, characterName }),
    });
    return response.url;
  },
};

/**
 * LLM prompt function (replaces window.spark.llmPrompt)
 * Maintains same API as Spark for minimal frontend changes
 */
export async function llmPrompt(strings: TemplateStringsArray | string[], ...values: any[]): Promise<string> {
  // Reconstruct the prompt from template strings
  let prompt = '';
  for (let i = 0; i < strings.length; i++) {
    prompt += strings[i];
    if (i < values.length) {
      prompt += String(values[i]);
    }
  }
  
  // Call backend API
  return aiAPI.chat([
    { role: 'user', content: prompt }
  ]);
}

// Auth API
export const authAPI = {
  /**
   * Get login URL (redirects to Google OAuth)
   */
  getLoginUrl: (): string => `${API_BASE_URL}/api/auth/login`,
  
  /**
   * Get current authenticated user
   */
  getCurrentUser: () => apiFetch<User>('/api/auth/user'),
  
  /**
   * Logout current user
   */
  logout: () => apiFetch<void>('/api/auth/logout', {
    method: 'POST',
  }),
};

// Admin API
export const adminAPI = {
  /**
   * Get all users (admin only)
   */
  listUsers: () => apiFetch<User[]>('/api/admin/users'),
  
  /**
   * Update user role (admin only)
   */
  updateUserRole: (userId: string, role: string) => apiFetch<User>('/api/admin/users/' + userId + '/role', {
    method: 'PUT',
    body: JSON.stringify({ role }),
  }),
  
  /**
   * Save structure as template (admin only)
   */
  saveTemplate: (template: any) => apiFetch<any>('/api/admin/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  }),
  
  /**
   * Get custom templates (admin only)
   */
  listTemplates: () => apiFetch<any[]>('/api/admin/templates'),
  
  /**
   * Delete template (admin only)
   */
  deleteTemplate: (id: string) => apiFetch<void>('/api/admin/templates/' + id, {
    method: 'DELETE',
  }),
};
