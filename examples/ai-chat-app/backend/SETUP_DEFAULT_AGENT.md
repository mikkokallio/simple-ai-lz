# Setup Default Agent

The AI Chat application requires an agent named "Default" in your Azure AI Foundry project for the Basic Chat feature to work.

## Prerequisites

- Azure AI Foundry project created and configured
- `AI_FOUNDRY_PROJECT_ENDPOINT` environment variable set
- Azure authentication configured (DefaultAzureCredential)

## Setup Methods

### Method 1: Using the Setup Script (Recommended)

Run the automated setup script:

```bash
cd examples/ai-chat-app/backend
npm run setup-default-agent
```

This script will:
1. Check if a "Default" agent already exists
2. If not, create one with:
   - Name: `Default`
   - Model: `gpt-4o`
   - Instructions: "You are a helpful AI assistant."

### Method 2: Manual Setup via Azure Portal

1. Go to [Azure AI Foundry](https://ai.azure.com/)
2. Navigate to your project
3. Go to **Agents** section
4. Click **Create Agent**
5. Configure:
   - **Name**: `Default` (case-sensitive!)
   - **Model**: `gpt-4o` (or your preferred model)
   - **Instructions**: "You are a helpful AI assistant." (or custom instructions)
6. Click **Create**

### Method 3: Manual Setup via Azure CLI

```bash
# Set your project endpoint
export AI_FOUNDRY_PROJECT_ENDPOINT="https://your-foundry.services.ai.azure.com/api/projects/your-project"

# Create the agent (requires Azure AI CLI extension)
az ml agent create \
  --name "Default" \
  --model "gpt-4o" \
  --instructions "You are a helpful AI assistant." \
  --endpoint $AI_FOUNDRY_PROJECT_ENDPOINT
```

## Verification

After setup, verify the Default agent exists:

1. Check backend logs when the application starts - you should see:
   ```
   💬 Using default agent for chat (Foundry ID: asst_xxxxx)
   ```

2. Test Basic Chat in the application:
   - Click "Chat" in the sidebar
   - Send a message
   - You should receive a response without any 400/500 errors

## Troubleshooting

### "Default agent not found" Error

If you see this error:
```
Error: Default agent not found. Please create an agent named "Default" in Azure AI Foundry.
```

**Solution**: The agent name must be exactly `Default` (capital D). Check:
1. Agent name is case-sensitive
2. No extra spaces or characters
3. Run the setup script to create it correctly

### Multiple "Default" Agents

If you have multiple agents named "Default" (from previous deployments):

**Solution**: 
1. Delete the extra ones via Azure Portal
2. Keep only ONE agent named "Default"
3. The application will use the first one it finds

### Permission Issues

If the setup script fails with authentication errors:

**Solution**:
1. Ensure you're logged in with `az login`
2. Check you have permissions on the AI Foundry project
3. Verify the `AI_FOUNDRY_PROJECT_ENDPOINT` is correct

## Important Notes

- ⚠️ **The agent MUST be named exactly "Default"** (case-sensitive)
- ⚠️ **Only ONE agent should be named "Default"**
- The application will NOT automatically create Default agents anymore
- If the Default agent is deleted, Basic Chat will stop working until you recreate it
