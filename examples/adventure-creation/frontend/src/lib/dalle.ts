import { aiAPI } from "./api";

/**
 * Generate a portrait for an NPC using Azure OpenAI DALL-E 3 via backend API
 * @param appearance - The appearance description from the NPC entry
 * @param characterName - Optional character name to sanitize from the appearance description
 * @returns URL of the generated portrait image
 */
export async function generatePortrait(appearance: string, characterName?: string): Promise<string> {
  if (!appearance || appearance.trim().length === 0) {
    throw new Error('Appearance description is required to generate a portrait.');
  }

  try {
    // Call backend API (handles authentication with managed identity)
    const imageUrl = await aiAPI.generatePortrait(appearance, characterName);
    console.log(`Portrait generated successfully: ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error('Portrait generation failed:', error);
    throw error;
  }
}
