import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';

class OpenAIService {
  private client: AzureOpenAI | null = null;
  private gpt4Deployment: string = '';
  private dalleDeployment: string = '';

  async initialize(): Promise<void> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-07-01';
    this.gpt4Deployment = process.env.AZURE_OPENAI_DEPLOYMENT_GPT4 || 'gpt-4o';
    this.dalleDeployment = process.env.AZURE_OPENAI_DEPLOYMENT_DALLE || 'dall-e-3';

    if (!endpoint) {
      throw new Error('AZURE_OPENAI_ENDPOINT environment variable is required');
    }

    console.log('Initializing Azure OpenAI client...');
    console.log(`Endpoint: ${endpoint}`);
    console.log(`GPT-4 Deployment: ${this.gpt4Deployment}`);
    console.log(`DALL-E Deployment: ${this.dalleDeployment}`);

    try {
      // Use Managed Identity for authentication
      const credential = new DefaultAzureCredential();
      const azureADTokenProvider = getBearerTokenProvider(
        credential,
        'https://cognitiveservices.azure.com/.default'
      );

      this.client = new AzureOpenAI({
        endpoint,
        apiVersion,
        azureADTokenProvider,
      });

      console.log('✓ Azure OpenAI client initialized with Managed Identity');
    } catch (error) {
      console.error('Failed to initialize Azure OpenAI client:', error);
      throw error;
    }
  }

  private ensureInitialized(): void {
    if (!this.client) {
      throw new Error('Azure OpenAI client not initialized. Call initialize() first.');
    }
  }

  /**
   * Chat completion using GPT-4
   * Replaces window.spark.llmPrompt() from frontend
   */
  async chatCompletion(messages: Array<{ role: string; content: string }>): Promise<string> {
    this.ensureInitialized();

    console.log(`Calling GPT-4 chat completion (${this.gpt4Deployment})...`);

    const response = await this.client!.chat.completions.create({
      model: this.gpt4Deployment,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log(`GPT-4 response: ${content.substring(0, 100)}...`);
    return content;
  }

  /**
   * Generate portrait using DALL-E 3
   * Same as frontend implementation but server-side
   */
  async generatePortrait(appearance: string, characterName?: string): Promise<string> {
    this.ensureInitialized();

    if (!appearance || appearance.trim().length === 0) {
      throw new Error('Appearance description is required');
    }

    // Sanitize appearance to remove character name (DALL-E doesn't allow proper names)
    const sanitizedAppearance = this.sanitizeAppearance(appearance, characterName);

    // Construct prompt for fantasy RPG portrait
    const fullPrompt = `Fantasy RPG character portrait: ${sanitizedAppearance}. Close-up portrait with dramatic lighting, rich colors, detailed facial features, dark background, painterly digital art style, cinematic composition, professional quality.`;

    console.log(`Generating DALL-E portrait (${this.dalleDeployment})...`);
    console.log(`Prompt: ${fullPrompt}`);

    const results = await this.client!.images.generate({
      model: this.dalleDeployment,
      prompt: fullPrompt,
      size: '1024x1024',
      n: 1,
      quality: 'standard',
      style: 'vivid',
    });

    if (!results.data || results.data.length === 0 || !results.data[0].url) {
      throw new Error('No image URL returned from Azure OpenAI');
    }

    const imageUrl = results.data[0].url;
    console.log(`✓ Portrait generated: ${imageUrl}`);
    return imageUrl;
  }

  /**
   * Sanitize appearance description by removing character name
   * DALL-E does not allow proper names in prompts
   */
  private sanitizeAppearance(appearance: string, characterName?: string): string {
    if (!characterName) return appearance;

    const nameParts = characterName.split(/\s+/).filter((part) => part.length > 0);
    let sanitized = appearance;

    for (const part of nameParts) {
      const regex = new RegExp(`\\b${part}\\b`, 'gi');
      sanitized = sanitized.replace(regex, 'this character');
    }

    return sanitized;
  }
}

export const openaiService = new OpenAIService();
