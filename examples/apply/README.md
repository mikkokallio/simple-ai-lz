# AppLy - AI-Powered Job Application Assistant

**AppLy** helps you make honest, informed decisions about job applications by analyzing your CV and matching it to job postings using AI. No exaggeration, no fabrication—just realistic advice based on your actual qualifications.

## 🎯 Features

### MVP (Current Version)

- **CV Upload & Analysis**: Upload your CV (PDF, DOCX, PNG, or JPEG) and get AI-powered analysis of your skills, strengths, and career level
- **Job Posting Scraping**: Paste any job posting URL and AppLy will extract requirements and analyze the role
- **Profile-Job Matching**: Get a match score (0-100%) showing how well you fit the job
- **Gap Analysis**: See which skills you have vs. which are missing, and get an honest assessment of experience gaps
- **Honest Recommendations**: Receive actionable advice based only on your existing qualifications—no suggestions to exaggerate or fabricate
- **Analysis History**: Review past job analyses and match scores

### Core Principles

1. **Honesty First**: All recommendations are based on your actual qualifications
2. **No Fabrication**: We never suggest exaggerating experience or skills
3. **Realistic Assessment**: Match scores and advice reflect genuine fit
4. **Actionable Insights**: Get specific, practical recommendations

## 🏗️ Architecture

### Technology Stack

**Frontend**:
- React 18 + TypeScript
- Vite (build tool)
- CSS-in-JS styling

**Backend**:
- Node.js + Express
- TypeScript
- Azure SDK integrations

**Infrastructure** (Azure):
- Container Apps (frontend & backend)
- Cosmos DB (profiles, jobs, analyses)
- Blob Storage (CV files, job data, reports)
- Azure OpenAI (AI analysis & matching)
- Azure Document Intelligence (CV parsing)
- Application Insights (monitoring)

### Data Flow

```
1. User uploads CV → Stored in Blob → Parsed with Document Intelligence → Analyzed with Azure OpenAI → Saved to Cosmos DB
2. User enters job URL → Web scraping → AI analysis → Saved to Cosmos DB
3. User requests match → Profile + Job → Azure OpenAI matching → Gap analysis → Recommendations → Saved to Cosmos DB
```

## 📦 Deployment

### Prerequisites

1. Azure Landing Zone deployed (see root README)
2. The following Azure resources must exist:
   - Container Apps Environment
   - Container Registry
   - Storage Account
   - Cosmos DB Account
   - Azure OpenAI / AI Foundry
   - Document Intelligence
   - Application Insights

### Step 1: Update Infrastructure Parameters

Edit `infrastructure/app.bicepparam` with values from your landing zone:

```bash
# Get values from your existing deployment
az containerapp env list -o table
az storage account list -o table
az cosmosdb list -o table
```

See the `app.bicepparam` file for detailed instructions on how to get each value.

### Step 2: Deploy Infrastructure

Deploy the Bicep template to create Cosmos DB containers, blob containers, and Container Apps:

```bash
# From the apply directory
az deployment group create \
  --resource-group <your-rg-name> \
  --template-file infrastructure/app.bicep \
  --parameters infrastructure/app.bicepparam
```

This creates:
- Cosmos DB database: `apply-db`
- Cosmos DB containers: `profiles`, `jobs`, `analyses`
- Blob containers: `apply-cv`, `apply-jobs`, `apply-reports`
- Container Apps: `aca-apply-frontend-*`, `aca-apply-backend-*`

### Step 3: Build and Push Docker Images

Build the frontend:
```bash
# From the apply directory
az acr build \
  --registry <your-acr-name> \
  --image apply-frontend:latest \
  --file frontend/Dockerfile \
  .
```

Build the backend:
```bash
# From the apply directory
az acr build \
  --registry <your-acr-name> \
  --image apply-backend:latest \
  --file backend/Dockerfile \
  .
```

### Step 4: Update Container Apps

The Container Apps will automatically pull the new images. You can also manually trigger updates:

```bash
# Update frontend
az containerapp update \
  --name aca-apply-frontend-<uniquesuffix> \
  --resource-group <your-rg-name> \
  --image <your-acr-name>.azurecr.io/apply-frontend:latest

# Update backend
az containerapp update \
  --name aca-apply-backend-<uniquesuffix> \
  --resource-group <your-rg-name> \
  --image <your-acr-name>.azurecr.io/apply-backend:latest
```

### Step 5: Access the Application

Get the frontend URL:
```bash
az containerapp show \
  --name aca-apply-frontend-<uniquesuffix> \
  --resource-group <your-rg-name> \
  --query properties.configuration.ingress.fqdn \
  -o tsv
```

⚠️ **Important**: The Container Apps are deployed with internal ingress only (VPN access). You must be connected to the VPN to access the application.

## 💻 Local Development

### Backend

```bash
cd backend

# Install dependencies
npm install

# Set environment variables
export STORAGE_ACCOUNT_NAME="your-storage-account"
export COSMOS_DB_ENDPOINT="https://your-cosmosdb.documents.azure.com:443/"
export COSMOS_DB_DATABASE="apply-db"
export AI_FOUNDRY_ENDPOINT="https://your-ai-foundry.cognitiveservices.azure.com/"
export AI_FOUNDRY_KEY="your-key"
export DOCUMENT_INTELLIGENCE_ENDPOINT="https://your-doc-intel.cognitiveservices.azure.com/"
export DOCUMENT_INTELLIGENCE_KEY="your-key"

# Run development server
npm run dev
```

Backend runs on http://localhost:3000

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server (proxy to backend)
npm run dev
```

Frontend runs on http://localhost:5173

## 🔧 API Endpoints

### Profile Management

- `POST /api/profile/upload` - Upload and analyze CV (multipart/form-data)
- `GET /api/profile` - Get user profile

### Job Analysis

- `POST /api/job/analyze` - Scrape and analyze job posting (JSON: `{ url: string }`)

### Matching

- `POST /api/match` - Match profile to job (JSON: `{ jobId: string }`)
- `GET /api/analyses` - List all analyses
- `GET /api/analyses/:id` - Get specific analysis details

### Health

- `GET /health` - Health check

## 📊 Data Models

### Profile
```typescript
{
  id: string;
  userId: string;
  cvBlobPath: string;
  originalFilename: string;
  uploadedAt: string;
  parsedData: {
    fullText: string;
    name?: string;
    email?: string;
    skills: string[];
    experience: Array<{ title, company, duration, description }>;
    education: Array<{ degree, institution, year }>;
  };
  aiAnalysis: {
    summary: string;
    keyStrengths: string[];
    careerLevel: 'junior' | 'mid' | 'senior' | 'lead';
    domains: string[];
  };
}
```

### Job Posting
```typescript
{
  id: string;
  userId: string;
  url: string;
  scrapedAt: string;
  title: string;
  company: string;
  description: string;
  aiAnalysis: {
    summary: string;
    keyRequirements: string[];
    experienceLevel: string;
    domains: string[];
  };
}
```

### Match Analysis
```typescript
{
  id: string;
  userId: string;
  profileId: string;
  jobId: string;
  analyzedAt: string;
  matchScore: number; // 0-100
  gapAnalysis: {
    missingSkills: string[];
    matchingSkills: string[];
    experienceGap: string;
  };
  recommendations: Array<{
    type: 'strength' | 'weakness' | 'action';
    text: string;
    honestyScore: 100; // Always 100 - no exaggeration
  }>;
  applicationAdvice: string;
}
```

## 🔐 Security & Privacy

- **VPN-Only Access**: All Container Apps use internal ingress (no public internet access)
- **Managed Identity**: Azure resources accessed via managed identity (no keys in environment)
- **Data Isolation**: Single-user MVP with hardcoded userId (easily extended to multi-user)
- **Encryption**: Cosmos DB and Blob Storage use encryption at rest
- **HTTPS Only**: All traffic encrypted in transit

## 🚀 Future Enhancements (Post-MVP)

### Phase 2: Enhanced Features
- LinkedIn profile import
- Cover letter generation (based on actual experience only)
- Application tracking
- Interview preparation tips
- Resume tailoring suggestions

### Phase 3: Tracking & Intelligence
- Track application status and outcomes
- Learn from successful applications
- Recommend similar jobs based on profile
- Salary insights and negotiation advice

## 🤝 Contributing

This is a private application for personal use. Contributions are not currently accepted.

## 📄 License

MIT License - See LICENSE file for details

## 💡 Usage Tips

1. **Upload a comprehensive CV**: The more detail you provide, the better the analysis
2. **Use real job URLs**: AppLy works best with publicly accessible job postings
3. **Review match scores critically**: A low score doesn't mean you shouldn't apply—it means be realistic about your fit
4. **Focus on honest recommendations**: Pay attention to recommendations with honestyScore = 100
5. **Track your history**: Use the History view to compare different opportunities

## ❓ FAQ

**Q: Why is my match score low?**  
A: AppLy provides realistic assessments. A low score means there are significant skill gaps or experience mismatches. This doesn't mean you shouldn't apply, but be honest about your fit.

**Q: Can AppLy help me write my resume?**  
A: Not yet. The MVP focuses on analysis and matching. Resume tailoring is planned for Phase 2.

**Q: Does AppLy support multiple users?**  
A: The MVP uses a single hardcoded user. Multi-user support can be added by replacing `STATIC_USER_ID` with authentication.

**Q: What job sites are supported?**  
A: AppLy can scrape most public job postings. Some sites with heavy JavaScript or bot protection may not work perfectly.

**Q: Is my data private?**  
A: Yes. Your CV and job analyses are stored in your private Azure resources behind a VPN. No data is shared externally.

## 📞 Support

For issues or questions, check the Azure logs:

```bash
# Backend logs
az containerapp logs show \
  --name aca-apply-backend-<uniquesuffix> \
  --resource-group <your-rg-name> \
  --follow

# Frontend logs
az containerapp logs show \
  --name aca-apply-frontend-<uniquesuffix> \
  --resource-group <your-rg-name> \
  --follow
```
