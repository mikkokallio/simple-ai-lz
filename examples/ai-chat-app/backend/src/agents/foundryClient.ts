// Azure AI Foundry Agent Service client
import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';

// Agent metadata structure
export interface FoundryAgent {
  id: string;
  name: string;
  instructions: string;
  model: string;
  tools?: any[];
  createdAt: Date | number;
}

// Thread message structure
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date | number;
}

// Streaming chunk structure
export interface AgentStreamChunk {
  type: 'text' | 'tool_call' | 'error' | 'done';
  content?: string;
  toolName?: string;
  toolArgs?: any;
}

export class FoundryAgentClient {
  private client: AIProjectClient | null = null;
  private endpoint: string;
  private credential: DefaultAzureCredential;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
    this.credential = new DefaultAzureCredential();
  }

  /**
   * Initialize the AI Project client
   */
  async initialize(): Promise<void> {
    if (!this.endpoint) {
      throw new Error('AI_FOUNDRY_PROJECT_ENDPOINT environment variable is not set');
    }

    this.client = new AIProjectClient(this.endpoint, this.credential);
  }

  /**
   * List all agents in the Foundry project
   */
  async listAgents(): Promise<FoundryAgent[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const agents: FoundryAgent[] = [];
      
      // Use the agents sub-client
      const agentsList = this.client.agents.listAgents();
      
      for await (const agent of agentsList) {
        agents.push({
          id: agent.id,
          name: agent.name || 'Unnamed Agent',
          instructions: agent.instructions || '',
          model: agent.model,
          tools: agent.tools,
          createdAt: agent.createdAt
        });
      }
      
      return agents;
    } catch (error) {
      console.error('Error listing agents:', error);
      throw error;
    }
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<FoundryAgent | null> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const agent = await this.client.agents.getAgent(agentId);
      
      return {
        id: agent.id,
        name: agent.name || 'Unnamed Agent',
        instructions: agent.instructions || '',
        model: agent.model,
        tools: agent.tools,
        createdAt: agent.createdAt
      };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new agent
   */
  async createAgent(config: {
    id?: string;
    name: string;
    instructions: string;
    model: string;
    tools?: any[];
  }): Promise<FoundryAgent> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const agent = await this.client.agents.createAgent(
        config.model,
        {
          name: config.name,
          instructions: config.instructions,
          tools: config.tools || []
        }
      );
      
      return {
        id: agent.id,
        name: agent.name || config.name,
        instructions: agent.instructions || config.instructions,
        model: agent.model,
        tools: agent.tools,
        createdAt: agent.createdAt
      };
    } catch (error) {
      console.error('Error creating agent:', error);
      throw error;
    }
  }

  /**
   * Create a new thread for an agent
   */
  async createThread(agentId: string): Promise<string> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const thread = await this.client.agents.threads.create();
      return thread.id;
    } catch (error) {
      console.error('Error creating thread:', error);
      throw error;
    }
  }

  /**
   * Send a message to an agent and stream the response
   */
  async *sendMessage(
    agentId: string,
    threadId: string,
    message: string
  ): AsyncGenerator<AgentStreamChunk> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      // Create message in thread
      await this.client.agents.messages.create(
        threadId,
        'user',
        message
      );

      // Create run and stream the response
      const stream = await this.client.agents.runs.create(threadId, agentId).stream();

      for await (const event of stream) {
        // Handle different event types based on the streaming SDK structure
        // Note: The actual event structure may vary - this is based on common patterns
        if (typeof event === 'object' && event !== null && 'event' in event) {
          const eventType = (event as any).event;
          const eventData = (event as any).data;
          
          if (eventType === 'thread.message.delta' && eventData && 'delta' in eventData) {
            const delta = eventData.delta;
            if (delta && delta.content) {
              for (const contentPart of delta.content) {
                if (contentPart.type === 'text' && 'text' in contentPart) {
                  const textValue = contentPart.text?.value || '';
                  if (textValue) {
                    yield {
                      type: 'text',
                      content: textValue
                    };
                  }
                }
              }
            }
          } else if (eventType === 'thread.run.step.delta' && eventData && 'delta' in eventData) {
            const stepDelta = eventData.delta;
            if (stepDelta && stepDelta.stepDetails && stepDelta.stepDetails.type === 'tool_calls') {
              for (const toolCall of stepDelta.stepDetails.toolCalls || []) {
                if (toolCall.type === 'function' && 'function' in toolCall) {
                  yield {
                    type: 'tool_call',
                    toolName: toolCall.function?.name,
                    toolArgs: toolCall.function?.arguments
                  };
                }
              }
            }
          } else if (eventType === 'thread.run.completed') {
            yield {
              type: 'done'
            };
          } else if (eventType === 'error') {
            yield {
              type: 'error',
              content: String(eventData)
            };
          }
        }
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      yield {
        type: 'error',
        content: error.message || 'Failed to send message'
      };
    }
  }

  /**
   * Get messages from a thread
   */
  async getMessages(threadId: string): Promise<AgentMessage[]> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      const messages: AgentMessage[] = [];
      const messagesList = this.client.agents.messages.list(threadId, { order: 'asc' });
      
      for await (const msg of messagesList) {
        let content = '';
        if (msg.content && Array.isArray(msg.content)) {
          for (const contentItem of msg.content) {
            if (contentItem.type === 'text' && 'text' in contentItem) {
              content += contentItem.text.value;
            }
          }
        }
        
        messages.push({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content,
          createdAt: msg.createdAt
        });
      }
      
      return messages;
    } catch (error) {
      console.error('Error getting messages:', error);
      throw error;
    }
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    try {
      await this.client.agents.threads.delete(threadId);
    } catch (error) {
      console.error('Error deleting thread:', error);
      throw error;
    }
  }
}
