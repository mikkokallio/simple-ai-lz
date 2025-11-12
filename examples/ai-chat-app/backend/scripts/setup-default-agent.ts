#!/usr/bin/env ts-node
/**
 * Setup script to create the Default agent in Azure AI Foundry
 * 
 * This script creates an agent named "Default" which will be used
 * for the Basic Chat functionality in the AI Chat application.
 * 
 * Usage:
 *   npm run setup-default-agent
 * 
 * Or with ts-node directly:
 *   ts-node scripts/setup-default-agent.ts
 * 
 * Prerequisites:
 *   - AI_FOUNDRY_PROJECT_ENDPOINT environment variable must be set
 *   - Azure authentication configured (DefaultAzureCredential)
 */

import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential } from '@azure/identity';

const AI_FOUNDRY_PROJECT_ENDPOINT = process.env.AI_FOUNDRY_PROJECT_ENDPOINT;

async function setupDefaultAgent() {
  console.log('🚀 Setting up Default agent in Azure AI Foundry...\n');
  
  if (!AI_FOUNDRY_PROJECT_ENDPOINT) {
    console.error('❌ Error: AI_FOUNDRY_PROJECT_ENDPOINT environment variable is not set');
    console.error('   Please set it to your Azure AI Foundry project endpoint');
    console.error('   Example: https://your-foundry.services.ai.azure.com/api/projects/your-project\n');
    process.exit(1);
  }
  
  try {
    // Initialize AI Foundry client
    console.log('📡 Connecting to Azure AI Foundry...');
    const credential = new DefaultAzureCredential();
    const client = new AIProjectClient(AI_FOUNDRY_PROJECT_ENDPOINT, credential);
    console.log('✅ Connected successfully\n');
    
    // Check if Default agent already exists
    console.log('🔍 Checking for existing agents...');
    const existingAgents: any[] = [];
    const agentsList = client.agents.listAgents();
    
    for await (const agent of agentsList) {
      existingAgents.push(agent);
      if (agent.name === 'Default') {
        console.log(`\n⚠️  Agent named "Default" already exists!`);
        console.log(`   Agent ID: ${agent.id}`);
        console.log(`   Model: ${agent.model}`);
        console.log(`   Instructions: ${agent.instructions?.substring(0, 60)}...`);
        console.log(`\n✅ No action needed - Default agent is already configured.\n`);
        return;
      }
    }
    
    console.log(`   Found ${existingAgents.length} existing agent(s)\n`);
    
    // Create Default agent
    console.log('📝 Creating Default agent...');
    const defaultAgent = await client.agents.createAgent(
      'gpt-4o',  // Model
      {
        name: 'Default',
        instructions: 'You are a helpful AI assistant.',
        tools: []
      }
    );
    
    console.log('✅ Default agent created successfully!');
    console.log(`   Agent ID: ${defaultAgent.id}`);
    console.log(`   Name: ${defaultAgent.name}`);
    console.log(`   Model: ${defaultAgent.model}`);
    console.log(`   Instructions: ${defaultAgent.instructions}\n`);
    
    console.log('🎉 Setup complete! The Default agent is ready to use.');
    console.log('   Users can now use the Basic Chat feature in the application.\n');
    
  } catch (error: any) {
    console.error('\n❌ Error setting up Default agent:');
    console.error(`   ${error.message}`);
    if (error.statusCode) {
      console.error(`   Status code: ${error.statusCode}`);
    }
    console.error('\n');
    process.exit(1);
  }
}

// Run the setup
setupDefaultAgent();
