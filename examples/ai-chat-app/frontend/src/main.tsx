import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider, useMsal } from '@azure/msal-react';
import { PublicClientApplication, EventType, EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { msalConfig, loginRequest, apiRequest } from './authConfig';

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Handle redirect promise for returning from login
msalInstance.initialize().then(() => {
  // Account selection logic is app dependent. Adjust as needed for different use cases.
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event: EventMessage) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as AuthenticationResult;
      const account = payload.account;
      msalInstance.setActiveAccount(account);
    }
  });
});

// Types
interface Thread {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  agentId?: string;          // Which agent this thread uses
  isDefaultAgent?: boolean;  // True if thread uses default agent
}

interface Message {
  messageId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// MCPServer interface removed - deprecated functionality

interface Agent {
  id: string;
  name: string;
  instructions: string;
  model: string;
  importedAt: string;
  foundryProjectEndpoint: string;
  isDefault?: boolean;  // True for user's default agent
}

// API configuration - direct backend URL (no nginx proxy)
declare global {
  interface Window {
    ENV?: {
      BACKEND_URL?: string;
    };
  }
}

const API_BASE_URL = window.ENV?.BACKEND_URL || 
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:5000' 
    : 'https://aca-ai-chat-backend-ezle7syi.mangosmoke-47a72d95.swedencentral.azurecontainerapps.io');

// Helper to create authenticated headers
function getAuthHeaders(token: string): HeadersInit {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// API functions
async function fetchThreads(token: string): Promise<Thread[]> {
  const response = await fetch(`${API_BASE_URL}/api/threads`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) throw new Error('Failed to fetch threads');
  return response.json();
}

// Removed - threads now managed via Agent Service unified API


async function fetchMessages(threadId: string, token: string): Promise<Message[]> {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) throw new Error('Failed to fetch messages');
  return response.json();
}

// Removed - using unified message sending in handleSendMessage
// Preferences and MCP functions removed - deprecated functionality

// Agent API functions
async function fetchAgents(token: string): Promise<Agent[]> {
  const response = await fetch(`${API_BASE_URL}/api/agents`, {
    headers: getAuthHeaders(token),
  });
  if (!response.ok) throw new Error('Failed to fetch agents');
  return response.json();
}

async function discoverAgents(token: string): Promise<Agent[]> {
  const response = await fetch(`${API_BASE_URL}/api/agents/discover`, {
    method: 'POST',
    headers: getAuthHeaders(token),
  });
  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('Agent service not configured');
    }
    throw new Error('Failed to discover agents');
  }
  return response.json();
}

async function importAgent(agentId: string, token: string): Promise<Agent> {
  const response = await fetch(`${API_BASE_URL}/api/agents/import`, {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ agentId })
  });
  if (!response.ok) throw new Error('Failed to import agent');
  const data = await response.json();
  return data.agent;
}

async function deleteAgent(agentId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/agents/${agentId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token)
  });
  if (!response.ok) throw new Error('Failed to delete agent');
}

async function deleteThread(threadId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token)
  });
  if (!response.ok) throw new Error('Failed to delete thread');
}

// Removed - using unified thread/message API via Agent Service


// Removed - thread titles are auto-generated


// Main App Component
function App() {
  // Authentication hooks
  const { instance, accounts, inProgress } = useMsal();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Main app state - MUST be at top before any conditional returns
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  // Settings functionality removed - deprecated
  
  // Agent state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showAgentImport, setShowAgentImport] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  
  // UI state
  const [showAgentsList, setShowAgentsList] = useState(true);
  const [showThreadsList, setShowThreadsList] = useState(true);
  const [showUserModal, setShowUserModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      if (accounts.length > 0) {
        setIsAuthenticated(true);
        // Acquire token silently for backend API (not Microsoft Graph)
        try {
          const response = await instance.acquireTokenSilent({
            ...apiRequest,  // Use API scopes, not Graph scopes
            account: accounts[0],
          });
          setAccessToken(response.accessToken);
          console.log('✅ API Token acquired successfully');
          console.log('   Scopes requested:', apiRequest.scopes);
          console.log('   Scopes granted:', response.scopes);
          console.log('   Token preview:', response.accessToken.substring(0, 100) + '...');
          
          // Decode token to check audience (for debugging)
          try {
            const tokenParts = response.accessToken.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            console.log('   Token audience (aud):', payload.aud);
            console.log('   Token version (ver):', payload.ver);
            console.log('   Token scopes (scp):', payload.scp);
          } catch (e) {
            console.warn('   Could not decode token for debugging');
          }
        } catch (error) {
          console.error('Failed to acquire token silently:', error);
          // If silent acquisition fails, try interactive
          try {
            const response = await instance.acquireTokenPopup(apiRequest);  // Use API scopes
            setAccessToken(response.accessToken);
          } catch (popupError) {
            console.error('Failed to acquire token with popup:', popupError);
          }
        }
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
      }
    };

    if (inProgress === 'none') {
      checkAuth();
    }
  }, [accounts, instance, inProgress]);

  // Load threads on mount - MUST be before conditional return
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      loadThreads();
      // loadPreferences();  // DEPRECATED - removed
      // loadMcpServers();   // DEPRECATED - removed
      loadAgents();
    }
  }, [isAuthenticated, accessToken]);

  // Load messages when thread changes - MUST be before conditional return
  useEffect(() => {
    if (currentThreadId) {
      loadMessages(currentThreadId);
    } else {
      setMessages([]);
    }
  }, [currentThreadId]);

  // Auto-scroll to bottom when messages change - MUST be before conditional return
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Login handler
  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch((error) => {
      console.error('Login error:', error);
    });
  };

  // Show login screen if not authenticated
  if (!isAuthenticated || !accessToken) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <h1 style={{ marginBottom: '2rem' }}>AI Chat Application</h1>
        <p style={{ marginBottom: '2rem', color: '#999' }}>Please sign in to continue</p>
        <button
          onClick={handleLogin}
          disabled={inProgress !== 'none'}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: '#0078d4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: inProgress !== 'none' ? 'not-allowed' : 'pointer',
            opacity: inProgress !== 'none' ? 0.6 : 1
          }}
        >
          {inProgress !== 'none' ? 'Signing in...' : 'Sign in with Microsoft'}
        </button>
      </div>
    );
  }

  async function loadThreads() {
    if (!accessToken) return;
    try {
      const data = await fetchThreads(accessToken);
      setThreads(data);
    } catch (error) {
      console.error('Error loading threads:', error);
    }
  }

  async function loadMessages(threadId: string) {
    if (!accessToken) return;
    try {
      const data = await fetchMessages(threadId, accessToken);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  // Load functions for preferences and MCP removed - deprecated functionality
  
  async function loadAgents() {
    if (!accessToken) return;
    try {
      const agentList = await fetchAgents(accessToken);
      setAgents(agentList);
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  }

  // Handler: Select "Chat" (default agent, no specific thread)
  function handleSelectChat() {
    setCurrentThreadId(null);
    setCurrentAgentId(null);
    setMessages([]);
    setStreamingContent('');
  }

  // Handler: Select an imported agent
  function handleSelectAgent(agentId: string) {
    const agent = agents.find(a => a.id === agentId);
    if (agent?.isDefault) {
      // If default agent, treat as Chat
      handleSelectChat();
    } else {
      setCurrentAgentId(agentId);
      setCurrentThreadId(null);
      setMessages([]);
      setStreamingContent('');
    }
  }

  // Handler: Delete thread
  async function handleDeleteThread(threadId: string) {
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    if (!accessToken) return;

    try {
      await deleteThread(threadId, accessToken);
      setThreads(threads.filter((t: Thread) => t.threadId !== threadId));
      if (currentThreadId === threadId) {
        handleSelectChat();
      }
    } catch (error) {
      console.error('Error deleting thread:', error);
      alert('Failed to delete thread');
    }
  }

  async function handleSendMessage() {
    if (!inputValue.trim() || isLoading) return;
    if (!accessToken) return;

    const userContent = inputValue;
    setInputValue('');
    setIsLoading(true);
    setStreamingContent('');

    // Determine threadId: use existing or 'new' for first message
    const threadId = currentThreadId || 'new';

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      messageId: 'temp-' + Date.now(),
      threadId: threadId,
      role: 'user',
      content: userContent,
      timestamp: new Date().toISOString()
    };
    setMessages([...messages, tempUserMessage]);

    try {
      // Send message with agentId (null = use default agent)
      const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(accessToken),
        body: JSON.stringify({ 
          content: userContent,
          agentId: currentAgentId // null for default agent
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to send message');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let actualThreadId = threadId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'start' && data.threadId) {
                // New thread was created
                actualThreadId = data.threadId;
                if (!currentThreadId) {
                  setCurrentThreadId(actualThreadId);
                }
              } else if (data.type === 'content') {
                setStreamingContent((prev: string) => prev + data.content);
              } else if (data.type === 'tool_call') {
                setStreamingContent((prev: string) => prev + `\n\n🔧 *Using tool: ${data.toolName}*\n\n`);
              } else if (data.type === 'done') {
                // Reload messages and threads
                if (actualThreadId && actualThreadId !== 'new') {
                  await loadMessages(actualThreadId);
                  await loadThreads();
                }
                setStreamingContent('');
                setIsLoading(false);
              } else if (data.type === 'error') {
                alert('Error: ' + data.error);
                setStreamingContent('');
                setIsLoading(false);
              }
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setStreamingContent('');
      setIsLoading(false);
      alert('Failed to send message');
    }
  }

  // handleSavePreferences removed - deprecated functionality

  // Agent handlers
  async function handleOpenAgentImport() {
    if (!accessToken) return;
    setShowAgentImport(true);
    setIsLoadingAgents(true);
    try {
      const discovered = await discoverAgents(accessToken);
      setAvailableAgents(discovered);
    } catch (error) {
      console.error('Error discovering agents:', error);
      alert('Failed to discover agents. Make sure Foundry is configured.');
    } finally {
      setIsLoadingAgents(false);
    }
  }
  
  async function handleImportAgent(agentId: string) {
    if (!accessToken) return;
    setIsImporting(true);
    try {
      await importAgent(agentId, accessToken);
      await loadAgents();
      setShowAgentImport(false);
      alert('Agent imported successfully!');
    } catch (error) {
      console.error('Error importing agent:', error);
      alert('Failed to import agent');
    } finally {
      setIsImporting(false);
    }
  }

  // Handler: Delete an imported agent
  async function handleDeleteAgent(agentId: string) {
    if (!confirm('Are you sure you want to remove this agent?')) return;
    if (!accessToken) return;
    
    try {
      await deleteAgent(agentId, accessToken);
      await loadAgents();
      if (currentAgentId === agentId) {
        handleSelectChat();
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
      alert('Failed to delete agent');
    }
  }

  // Handler: Create a new thread
  function handleNewThread() {
    setCurrentThreadId(null);
    setMessages([]);
    setStreamingContent('');
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Styles - Azure Foundry-inspired dark theme
  const styles = {
    scrollbar: `
      .threadList::-webkit-scrollbar,
      .collapsibleContent::-webkit-scrollbar {
        width: 8px;
      }
      .threadList::-webkit-scrollbar-track,
      .collapsibleContent::-webkit-scrollbar-track {
        background: #1e1e1e;
      }
      .threadList::-webkit-scrollbar-thumb,
      .collapsibleContent::-webkit-scrollbar-thumb {
        background: #3e3e42;
        border-radius: 4px;
      }
      .threadList::-webkit-scrollbar-thumb:hover,
      .collapsibleContent::-webkit-scrollbar-thumb:hover {
        background: #4e4e52;
      }
      .collapsibleContent {
        max-height: 300px;
        overflow-y: auto;
      }
    `,
    container: {
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: '#252526',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    } as React.CSSProperties,
    sidebar: {
      width: '280px',
      background: '#1e1e1e',
      display: 'flex',
      flexDirection: 'column',
      color: '#cccccc'
    } as React.CSSProperties,
    sidebarHeader: {
      padding: '12px',
      borderBottom: '1px solid #3e3e42'
    } as React.CSSProperties,
    sidebarTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#cccccc',
      marginBottom: '12px'
    } as React.CSSProperties,
    newThreadButton: {
      width: '100%',
      padding: '12px',
      background: 'transparent',
      color: '#cccccc',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'all 0.2s',
      hover: {
        background: '#2d2d30'
      }
    } as React.CSSProperties,
    newThreadButtonHover: {
      background: '#2d2d30'
    } as React.CSSProperties,
    threadList: {
      flex: 1,
      overflowY: 'auto',
      padding: '8px'
    } as React.CSSProperties,
    threadItem: {
      padding: '12px',
      margin: '4px 0',
      background: 'transparent',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      transition: 'background 0.2s',
      color: '#cccccc'
    } as React.CSSProperties,
    threadItemHover: {
      background: '#2d2d30'
    } as React.CSSProperties,
    threadItemActive: {
      background: '#37373d',
      borderLeft: '3px solid #0078d4'
    } as React.CSSProperties,
    threadTitle: {
      fontSize: '14px',
      color: '#cccccc',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      textAlign: 'left'
    } as React.CSSProperties,
    threadTitleInput: {
      fontSize: '14px',
      color: '#cccccc',
      background: '#2d2d30',
      border: '1px solid #3e3e42',
      borderRadius: '4px',
      padding: '4px 8px',
      flex: 1,
      outline: 'none'
    } as React.CSSProperties,
    deleteButton: {
      padding: '6px 12px',
      background: 'transparent',
      color: '#ef4444',
      border: '1px solid #ef4444',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '12px',
      marginLeft: '8px',
      transition: 'all 0.2s'
    } as React.CSSProperties,
    deleteButtonHover: {
      background: '#ef4444',
      color: '#ffffff'
    } as React.CSSProperties,
    settingsButton: {
      padding: '12px',
      margin: '8px',
      background: 'transparent',
      color: '#cccccc',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'all 0.2s'
    } as React.CSSProperties,
    mainArea: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#252526'
    } as React.CSSProperties,
    chatHeader: {
      padding: '16px 24px',
      borderBottom: '1px solid #3e3e42',
      background: '#2d2d30'
    } as React.CSSProperties,
    chatTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#cccccc'
    } as React.CSSProperties,
    messagesContainer: {
      flex: 1,
      overflowY: 'auto',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    } as React.CSSProperties,
    messageWrapper: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    } as React.CSSProperties,
    messageUser: {
      alignSelf: 'flex-end',
      maxWidth: '70%',
      padding: '12px 16px',
      background: '#0078d4',
      color: 'white',
      borderRadius: '12px',
      fontSize: '14px',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap'
    } as React.CSSProperties,
    messageAssistant: {
      alignSelf: 'flex-start',
      maxWidth: '70%',
      padding: '12px 16px',
      background: '#2d2d30',
      color: '#cccccc',
      borderRadius: '12px',
      fontSize: '14px',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap'
    } as React.CSSProperties,
    inputArea: {
      padding: '16px 24px',
      borderTop: '1px solid #3e3e42',
      background: '#252526',
      display: 'flex',
      gap: '12px'
    } as React.CSSProperties,
    textarea: {
      flex: 1,
      padding: '12px',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      fontSize: '14px',
      resize: 'none',
      minHeight: '50px',
      maxHeight: '150px',
      fontFamily: 'inherit',
      background: '#1e1e1e',
      color: '#cccccc'
    } as React.CSSProperties,
    sendButton: {
      padding: '12px 24px',
      background: '#0078d4',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '600',
      height: 'fit-content',
      alignSelf: 'flex-end'
    } as React.CSSProperties,
    sendButtonDisabled: {
      background: '#9ca3af',
      cursor: 'not-allowed'
    } as React.CSSProperties,
    emptyState: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6e6e6e',
      fontSize: '16px'
    } as React.CSSProperties,
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    } as React.CSSProperties,
    modalContent: {
      background: '#2d2d30',
      padding: '32px',
      borderRadius: '16px',
      width: '500px',
      maxHeight: '80vh',
      overflowY: 'auto',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      animation: 'slideUp 0.3s ease-out',
      border: '1px solid #3e3e42'
    } as React.CSSProperties,
    modalHeader: {
      fontSize: '24px',
      fontWeight: '600',
      marginBottom: '24px',
      color: '#cccccc'
    } as React.CSSProperties,
    formGroup: {
      marginBottom: '16px'
    } as React.CSSProperties,
    label: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#cccccc'
    } as React.CSSProperties,
    input: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      fontSize: '14px',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none',
      background: '#1e1e1e',
      color: '#cccccc'
    } as React.CSSProperties,
    textareaLarge: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      fontSize: '14px',
      minHeight: '120px',
      fontFamily: 'inherit',
      resize: 'vertical',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none',
      background: '#1e1e1e',
      color: '#cccccc'
    } as React.CSSProperties,
    modalButtons: {
      display: 'flex',
      gap: '12px',
      marginTop: '24px'
    } as React.CSSProperties,
    saveButton: {
      flex: 1,
      padding: '12px',
      background: '#0078d4',
      color: 'white',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '15px',
      fontWeight: '600',
      transition: 'all 0.2s'
    } as React.CSSProperties,
    saveButtonHover: {
      background: '#0063b1',
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 12px rgba(0, 120, 212, 0.3)'
    } as React.CSSProperties,
    cancelButton: {
      flex: 1,
      padding: '12px',
      background: 'transparent',
      color: '#999999',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '15px',
      fontWeight: '600',
      transition: 'all 0.2s'
    } as React.CSSProperties,
    cancelButtonHover: {
      background: '#37373d',
      borderColor: '#4e4e52'
    } as React.CSSProperties,
    toolsList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginTop: '8px'
    } as React.CSSProperties,
    toolItem: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      padding: '12px',
      background: '#252526',
      border: '1px solid #3e3e42',
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.2s'
    } as React.CSSProperties,
    checkbox: {
      width: '18px',
      height: '18px',
      cursor: 'pointer',
      marginTop: '2px',
      accentColor: '#0078d4'
    } as React.CSSProperties,
    toolName: {
      fontWeight: '600',
      color: '#cccccc',
      fontSize: '15px',
      marginBottom: '4px',
      display: 'block'
    } as React.CSSProperties,
    toolDescription: {
      fontSize: '13px',
      color: '#999999',
      lineHeight: '1.5',
      display: 'block'
    } as React.CSSProperties
  };

  const currentThread = threads.find((t: Thread) => t.threadId === currentThreadId);
  const importedAgents = agents; // All agents from /api/agents are imported (excluding Default)
  const defaultAgentThreads = threads.filter((t: Thread) => t.isDefaultAgent);
  const importedAgentThreads = threads.filter((t: Thread) => !t.isDefaultAgent);

  return (
    <div style={styles.container}>
      <style>{styles.scrollbar}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        
        {/* Chat Section - Default Agent */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              ...styles.threadItem,
              ...(currentAgentId === null ? styles.threadItemActive : {}),
              fontWeight: '500'
            }}
            onClick={handleSelectChat}
          >
            💬 Chat
          </div>
        </div>

        {/* Agents Section - Imported Agents */}
        <div style={{ borderTop: '1px solid #2a2b32', paddingTop: '16px', marginTop: '16px' }}>
          <div style={{ 
            ...styles.sidebarHeader, 
            marginBottom: '12px', 
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingRight: '8px'
          }} onClick={() => setShowAgentsList(!showAgentsList)}>
            <div style={styles.sidebarTitle}>{showAgentsList ? '▼' : '▶'} Agents</div>
            <button
              style={{
                background: 'transparent',
                border: '1px solid #3e3e42',
                color: '#0078d4',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '4px',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s',
                marginRight: '-12px',
                lineHeight: '1',
                fontWeight: '500'
              }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleOpenAgentImport();
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.color = '#1890ff';
                e.currentTarget.style.borderColor = '#0078d4';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.color = '#0078d4';
                e.currentTarget.style.borderColor = '#3e3e42';
              }}
              title="Import Agent"
            >
              +
            </button>
          </div>
          {showAgentsList && (
            <div style={styles.threadList} className="threadList collapsibleContent">
              {importedAgents.map((agent: Agent) => (
                <div
                  key={agent.id}
                  style={{
                    ...styles.threadItem,
                    ...(currentAgentId === agent.id ? styles.threadItemActive : {})
                  }}
                  onClick={() => handleSelectAgent(agent.id)}
                >
                  <div style={styles.threadTitle}>
                    {agent.name}
                  </div>
                  <button
                    style={{
                      background: 'transparent',
                      border: '1px solid #3e3e42',
                      padding: '4px',
                      fontSize: '12px',
                      color: '#6e6e6e',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginLeft: '8px',
                      lineHeight: '1'
                    }}
                    className="delete-btn-hover"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleDeleteAgent(agent.id);
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.borderColor = '#ef4444';
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.currentTarget.style.color = '#6e6e6e';
                      e.currentTarget.style.borderColor = '#3e3e42';
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {importedAgents.length === 0 && (
                <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px', textAlign: 'center' }}>
                  No agents imported yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Threads Section - Show threads for selected agent or default */}
        <div style={{ borderTop: '1px solid #2a2b32', paddingTop: '16px', marginTop: '16px' }}>
          <div style={{ 
            ...styles.sidebarHeader, 
            marginBottom: '12px', 
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingRight: '8px'
          }} onClick={() => setShowThreadsList(!showThreadsList)}>
            <div style={styles.sidebarTitle}>{showThreadsList ? '▼' : '▶'} Threads</div>
            <button
              style={{
                background: 'transparent',
                border: '1px solid #3e3e42',
                color: '#0078d4',
                fontSize: '16px',
                cursor: 'pointer',
                padding: '4px',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'all 0.2s',
                marginRight: '-12px',
                lineHeight: '1',
                fontWeight: '500'
              }}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleNewThread();
              }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.color = '#1890ff';
                e.currentTarget.style.borderColor = '#0078d4';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                e.currentTarget.style.color = '#0078d4';
                e.currentTarget.style.borderColor = '#3e3e42';
              }}
              title="New Thread"
            >
              +
            </button>
          </div>
          {showThreadsList && (
            <div style={styles.threadList} className="threadList collapsibleContent">
              {(currentAgentId ? importedAgentThreads.filter((t: Thread) => t.agentId === currentAgentId) : defaultAgentThreads).map((thread: Thread) => (
                <div
                  key={thread.threadId}
                  style={{
                    ...styles.threadItem,
                    ...(currentThreadId === thread.threadId ? styles.threadItemActive : {})
                  }}
                  onClick={() => {
                    setCurrentThreadId(thread.threadId);
                    // Only set agentId for imported agent threads, keep null for default agent
                    if (thread.isDefaultAgent) {
                      setCurrentAgentId(null);
                    } else if (thread.agentId) {
                      setCurrentAgentId(thread.agentId);
                    }
                  }}
                >
                  <div style={styles.threadTitle}>
                    {thread.title}
                  </div>
                  <button
                    style={{
                      background: 'transparent',
                      border: '1px solid #3e3e42',
                      padding: '4px',
                      fontSize: '12px',
                      color: '#6e6e6e',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      marginLeft: '8px',
                      lineHeight: '1'
                    }}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      handleDeleteThread(thread.threadId);
                    }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.borderColor = '#ef4444';
                    }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.currentTarget.style.color = '#6e6e6e';
                      e.currentTarget.style.borderColor = '#3e3e42';
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {(currentAgentId ? importedAgentThreads.filter((t: Thread) => t.agentId === currentAgentId).length === 0 : defaultAgentThreads.length === 0) && (
                <div style={{ padding: '12px', color: '#9ca3af', fontSize: '13px', textAlign: 'center' }}>
                  No threads yet - send a message to start
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* User Profile Section */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '16px',
          borderTop: '1px solid #2a2b32'
        }}>
          <div
            style={{
              padding: '12px',
              background: '#252526',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'background 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
            onClick={() => setShowUserModal(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2d2d2d';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#252526';
            }}
          >
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#0078d4',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: '600',
              fontSize: '16px'
            }}>
              {accounts[0]?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{
                color: '#e5e7eb',
                fontSize: '14px',
                fontWeight: '500',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {accounts[0]?.name || 'User'}
              </div>
              <div style={{
                color: '#9ca3af',
                fontSize: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {accounts[0]?.username || ''}
              </div>
            </div>
          </div>
        </div>
        
        {/* Settings button removed - deprecated functionality */}
      </div>

      {/* Main Chat Area - Unified for all agents */}
      <div style={styles.mainArea}>
        {/* Chat Header */}
        <div style={styles.chatHeader}>
          <div style={styles.chatTitle}>
            {currentThread ? (
              currentThread.title
            ) : currentAgentId ? (
              `🤖 ${agents.find((a: Agent) => a.id === currentAgentId)?.name || 'Agent'}`
            ) : (
              '💬 Chat'
            )}
          </div>
        </div>

        {/* Messages Container */}
        <div style={styles.messagesContainer}>
          {messages.map((message: Message) => (
            <div key={message.messageId} style={styles.messageWrapper}>
              <div
                style={
                  message.role === 'user'
                    ? styles.messageUser
                    : styles.messageAssistant
                }
              >
                {message.content}
              </div>
            </div>
          ))}
          {streamingContent && (
            <div style={styles.messageWrapper}>
              <div style={styles.messageAssistant}>{streamingContent}</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={styles.inputArea}>
          <textarea
            style={styles.textarea}
            value={inputValue}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={isLoading}
          />
          <button
            style={{
              ...styles.sendButton,
              ...(isLoading || !inputValue.trim() ? styles.sendButtonDisabled : {})
            }}
            onClick={handleSendMessage}
            disabled={isLoading || !inputValue.trim()}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Settings Modal - Removed (deprecated functionality) */}
      
      {/* User Modal */}
      {showUserModal && (
        <div style={styles.modal} onClick={() => setShowUserModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>User Profile</div>
            
            <div style={{ padding: '24px 0' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#0078d4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '28px'
                }}>
                  {accounts[0]?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <div style={{
                    color: '#e5e7eb',
                    fontSize: '18px',
                    fontWeight: '600',
                    marginBottom: '4px'
                  }}>
                    {accounts[0]?.name || 'User'}
                  </div>
                  <div style={{
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    {accounts[0]?.username || ''}
                  </div>
                </div>
              </div>

              <div style={{
                background: '#1e1e1e',
                border: '1px solid #2d2d2d',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  color: '#9ca3af',
                  fontSize: '12px',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  fontWeight: '600'
                }}>
                  Account Details
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '13px' }}>Email</div>
                    <div style={{ color: '#e5e7eb', fontSize: '14px' }}>
                      {accounts[0]?.username || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '13px' }}>Tenant ID</div>
                    <div style={{
                      color: '#e5e7eb',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all'
                    }}>
                      {accounts[0]?.tenantId || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                style={styles.cancelButton}
                onClick={() => setShowUserModal(false)}
              >
                Close
              </button>
              <button
                style={{
                  ...styles.saveButton,
                  background: '#d32f2f'
                }}
                onClick={() => {
                  instance.logoutRedirect({
                    postLogoutRedirectUri: window.location.origin
                  });
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#c62828';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#d32f2f';
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Agent Import Modal */}
      {showAgentImport && (
        <div style={styles.modal} onClick={() => setShowAgentImport(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>Import Agent from Foundry</div>
            
            {isLoadingAgents ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
                Loading agents from Foundry...
              </div>
            ) : availableAgents.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
                No agents found in Foundry project. Create agents in Azure AI Foundry portal first.
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {availableAgents.map(agent => (
                  <div
                    key={agent.id}
                    style={{
                      padding: '16px',
                      margin: '12px 0',
                      background: '#1e1e1e',
                      border: '1px solid #2d2d2d',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => handleImportAgent(agent.id)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', color: '#e5e7eb', fontSize: '15px', marginBottom: '8px' }}>
                          🤖 {agent.name}
                        </div>
                        <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '8px' }}>
                          Model: {agent.model}
                        </div>
                        {agent.instructions && (
                          <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>
                            {agent.instructions.substring(0, 150)}
                            {agent.instructions.length > 150 ? '...' : ''}
                          </div>
                        )}
                      </div>
                      <button
                        style={{
                          padding: '8px 16px',
                          background: '#0078d4',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '600',
                          marginLeft: '16px'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImportAgent(agent.id);
                        }}
                        disabled={isImporting}
                      >
                        {isImporting ? 'Importing...' : 'Import'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div style={styles.modalButtons}>
              <button style={styles.cancelButton} onClick={() => setShowAgentImport(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </React.StrictMode>
);
