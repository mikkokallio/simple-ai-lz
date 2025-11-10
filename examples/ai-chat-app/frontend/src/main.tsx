import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Types
interface Thread {
  threadId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface Message {
  messageId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface UserPreferences {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
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

// API functions
async function fetchThreads(): Promise<Thread[]> {
  const response = await fetch(`${API_BASE_URL}/api/threads`);
  if (!response.ok) throw new Error('Failed to fetch threads');
  return response.json();
}

async function createThread(title?: string): Promise<Thread> {
  const response = await fetch(`${API_BASE_URL}/api/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
  if (!response.ok) throw new Error('Failed to create thread');
  return response.json();
}

async function deleteThread(threadId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete thread');
}

async function fetchMessages(threadId: string): Promise<Message[]> {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages`);
  if (!response.ok) throw new Error('Failed to fetch messages');
  return response.json();
}

async function sendMessage(
  threadId: string,
  content: string,
  onChunk: (chunk: string) => void,
  onComplete: (thread: Thread) => void,
  onError: (error: string) => void
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/threads/${threadId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('No response body');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));

          if (data.type === 'delta' && data.content) {
            onChunk(data.content);
          } else if (data.type === 'done' && data.thread) {
            onComplete(data.thread);
          } else if (data.type === 'error') {
            onError(data.error || 'Unknown error');
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function fetchPreferences(): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE_URL}/api/preferences`);
  if (!response.ok) throw new Error('Failed to fetch preferences');
  return response.json();
}

async function updatePreferences(preferences: UserPreferences): Promise<UserPreferences> {
  const response = await fetch(`${API_BASE_URL}/api/preferences`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preferences)
  });
  if (!response.ok) throw new Error('Failed to update preferences');
  return response.json();
}

// Main App Component
function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 2000,
    systemPrompt: 'You are a helpful AI assistant.'
  });
  const [editedPreferences, setEditedPreferences] = useState<UserPreferences>(preferences);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load threads on mount
  useEffect(() => {
    loadThreads();
    loadPreferences();
  }, []);

  // Load messages when thread changes
  useEffect(() => {
    if (currentThreadId) {
      loadMessages(currentThreadId);
    } else {
      setMessages([]);
    }
  }, [currentThreadId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  async function loadThreads() {
    try {
      const data = await fetchThreads();
      setThreads(data);
    } catch (error) {
      console.error('Error loading threads:', error);
    }
  }

  async function loadMessages(threadId: string) {
    try {
      const data = await fetchMessages(threadId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function loadPreferences() {
    try {
      const data = await fetchPreferences();
      setPreferences(data);
      setEditedPreferences(data);
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  }

  async function handleNewThread() {
    try {
      const newThread = await createThread();
      setThreads([newThread, ...threads]);
      setCurrentThreadId(newThread.threadId);
    } catch (error) {
      console.error('Error creating thread:', error);
    }
  }

  async function handleDeleteThread(threadId: string) {
    if (!confirm('Are you sure you want to delete this thread?')) return;

    try {
      await deleteThread(threadId);
      setThreads(threads.filter(t => t.threadId !== threadId));
      if (currentThreadId === threadId) {
        setCurrentThreadId(null);
      }
    } catch (error) {
      console.error('Error deleting thread:', error);
    }
  }

  async function handleSendMessage() {
    if (!inputValue.trim() || !currentThreadId || isLoading) return;

    const userContent = inputValue;
    setInputValue('');
    setIsLoading(true);
    setStreamingContent('');

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      messageId: 'temp-' + Date.now(),
      threadId: currentThreadId,
      role: 'user',
      content: userContent,
      timestamp: new Date().toISOString()
    };
    setMessages([...messages, tempUserMessage]);

    try {
      await sendMessage(
        currentThreadId,
        userContent,
        (chunk) => {
          setStreamingContent((prev) => prev + chunk);
        },
        (updatedThread) => {
          // Reload messages to get the saved assistant message
          loadMessages(currentThreadId);
          setStreamingContent('');
          setIsLoading(false);

          // Update thread in list
          setThreads(threads.map(t => t.threadId === updatedThread.threadId ? updatedThread : t));
        },
        (error) => {
          console.error('Streaming error:', error);
          setStreamingContent('');
          setIsLoading(false);
          alert('Failed to get response: ' + error);
        }
      );
    } catch (error) {
      console.error('Error sending message:', error);
      setStreamingContent('');
      setIsLoading(false);
      alert('Failed to send message');
    }
  }

  async function handleSavePreferences() {
    try {
      const updated = await updatePreferences(editedPreferences);
      setPreferences(updated);
      setShowSettings(false);
      alert('Preferences saved successfully!');
    } catch (error) {
      console.error('Error saving preferences:', error);
      alert('Failed to save preferences');
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Styles - ChatGPT-like with OCR app colors
  const styles = {
    container: {
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: '#fafafa',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    } as React.CSSProperties,
    sidebar: {
      width: '280px',
      background: '#202123',
      display: 'flex',
      flexDirection: 'column',
      color: '#ffffff'
    } as React.CSSProperties,
    sidebarHeader: {
      padding: '12px',
      borderBottom: '1px solid #4a4a4f'
    } as React.CSSProperties,
    sidebarTitle: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#ececf1',
      marginBottom: '12px'
    } as React.CSSProperties,
    newThreadButton: {
      width: '100%',
      padding: '12px',
      background: 'transparent',
      color: '#ffffff',
      border: '1px solid #565869',
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
        background: '#2a2b32'
      }
    } as React.CSSProperties,
    newThreadButtonHover: {
      background: '#2a2b32'
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
      color: '#ececf1'
    } as React.CSSProperties,
    threadItemHover: {
      background: '#2a2b32'
    } as React.CSSProperties,
    threadItemActive: {
      background: '#343541',
      borderLeft: '3px solid #0078d4'
    } as React.CSSProperties,
    threadTitle: {
      fontSize: '14px',
      color: '#ececf1',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flex: 1,
      textAlign: 'left'
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
      color: '#ececf1',
      border: '1px solid #565869',
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
      background: '#ffffff'
    } as React.CSSProperties,
    chatHeader: {
      padding: '16px 24px',
      borderBottom: '1px solid #e5e7eb',
      background: '#ffffff'
    } as React.CSSProperties,
    chatTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#202123'
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
      background: '#f3f4f6',
      color: '#1f2937',
      borderRadius: '12px',
      fontSize: '14px',
      lineHeight: '1.5',
      whiteSpace: 'pre-wrap'
    } as React.CSSProperties,
    inputArea: {
      padding: '16px 24px',
      borderTop: '1px solid #d1d5db',
      background: '#ffffff',
      display: 'flex',
      gap: '12px'
    } as React.CSSProperties,
    textarea: {
      flex: 1,
      padding: '12px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '14px',
      resize: 'none',
      minHeight: '50px',
      maxHeight: '150px',
      fontFamily: 'inherit'
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
      color: '#6b7280',
      fontSize: '16px'
    } as React.CSSProperties,
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    } as React.CSSProperties,
    modalContent: {
      background: 'white',
      padding: '32px',
      borderRadius: '16px',
      width: '500px',
      maxHeight: '80vh',
      overflowY: 'auto',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
      animation: 'slideUp 0.3s ease-out'
    } as React.CSSProperties,
    modalHeader: {
      fontSize: '24px',
      fontWeight: '600',
      marginBottom: '24px',
      color: '#202123'
    } as React.CSSProperties,
    formGroup: {
      marginBottom: '16px'
    } as React.CSSProperties,
    label: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#202123'
    } as React.CSSProperties,
    input: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '14px',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none'
    } as React.CSSProperties,
    textareaLarge: {
      width: '100%',
      padding: '10px 14px',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      fontSize: '14px',
      minHeight: '120px',
      fontFamily: 'inherit',
      resize: 'vertical',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      outline: 'none'
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
      color: '#6b7280',
      border: '1px solid #d1d5db',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '15px',
      fontWeight: '600',
      transition: 'all 0.2s'
    } as React.CSSProperties,
    cancelButtonHover: {
      background: '#f3f4f6',
      borderColor: '#9ca3af'
    } as React.CSSProperties
  };

  const currentThread = threads.find(t => t.threadId === currentThreadId);

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarTitle}>Threads</div>
          <button style={styles.newThreadButton} onClick={handleNewThread}>
            New +
          </button>
        </div>
        <div style={styles.threadList}>
          {threads.map(thread => (
            <div
              key={thread.threadId}
              style={{
                ...styles.threadItem,
                ...(currentThreadId === thread.threadId ? styles.threadItemActive : {})
              }}
              onClick={() => setCurrentThreadId(thread.threadId)}
            >
              <div style={styles.threadTitle}>{thread.title}</div>
              <button
                style={styles.deleteButton}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteThread(thread.threadId);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
        <button style={styles.settingsButton} onClick={() => setShowSettings(true)}>
          ⚙️ Settings
        </button>
      </div>

      {/* Main Chat Area */}
      <div style={styles.mainArea}>
        {currentThread ? (
          <>
            <div style={styles.chatHeader}>
              <div style={styles.chatTitle}>{currentThread.title}</div>
            </div>
            <div style={styles.messagesContainer}>
              {messages.map(message => (
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
            <div style={styles.inputArea}>
              <textarea
                style={styles.textarea}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
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
          </>
        ) : (
          <div style={styles.emptyState}>
            <div>Select a thread or create a new one to start chatting</div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div style={styles.modal} onClick={() => setShowSettings(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>Settings</div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Model</label>
              <input
                style={styles.input}
                type="text"
                value={editedPreferences.model}
                onChange={(e) => setEditedPreferences({ ...editedPreferences, model: e.target.value })}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Temperature (0-2): {editedPreferences.temperature}</label>
              <input
                style={styles.input}
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={editedPreferences.temperature}
                onChange={(e) => setEditedPreferences({ ...editedPreferences, temperature: parseFloat(e.target.value) })}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Max Tokens</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                max="16000"
                value={editedPreferences.maxTokens}
                onChange={(e) => setEditedPreferences({ ...editedPreferences, maxTokens: parseInt(e.target.value) })}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>System Prompt</label>
              <textarea
                style={styles.textareaLarge}
                value={editedPreferences.systemPrompt}
                onChange={(e) => setEditedPreferences({ ...editedPreferences, systemPrompt: e.target.value })}
              />
            </div>

            <div style={styles.modalButtons}>
              <button style={styles.saveButton} onClick={handleSavePreferences}>
                Save
              </button>
              <button style={styles.cancelButton} onClick={() => {
                setEditedPreferences(preferences);
                setShowSettings(false);
              }}>
                Cancel
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
    <App />
  </React.StrictMode>
);
