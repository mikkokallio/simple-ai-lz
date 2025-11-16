# AppLy - AI-Powered Job Application Assistant

## Overview

AppLy is an intelligent job application assistant that helps users optimize their job applications by analyzing their professional profile against job requirements. The app uses Azure AI services to extract insights from CVs, LinkedIn profiles, and job postings, then provides tailored recommendations to improve application success rates.

## Core Features

### 1. Profile Management
- **CV Upload**: Support PDF, DOCX, and image formats
- **LinkedIn Profile Import**: Scrape and parse LinkedIn profile data from URL
- **Additional Resources**: 
  - Portfolio URLs
  - GitHub profile
  - Personal website
  - Other professional profiles
- **Profile Storage**: Persist user profile data in Cosmos DB for reuse
- **Profile Extraction**: Use Azure Document Intelligence and AI to extract:
  - Skills and competencies
  - Work experience and achievements
  - Education and certifications
  - Projects and publications
  - Key strengths and unique value propositions

### 2. Job Analysis
- **Job Posting URL Input**: Accept job posting or application page URL
- **Web Crawling**: 
  - Extract job description, requirements, and qualifications
  - Identify company culture and values
  - Detect application method (email, form, portal, etc.)
  - Capture key phrases and terminology used
- **Requirement Extraction**:
  - Required skills vs. preferred skills
  - Experience level expectations
  - Education requirements
  - Cultural fit indicators
  - Specific tools/technologies mentioned

### 3. Gap Analysis & Recommendations
- **Profile-Job Matching**:
  - Compare user profile against job requirements
  - Identify strengths that align with requirements
  - Highlight gaps or missing qualifications
  - Calculate match score (0-100%)
- **CV Optimization Suggestions**:
  - Recommend keyword additions (realistic and truthful)
  - Suggest rephrasing experience descriptions
  - Highlight relevant projects or achievements
  - Propose skills to emphasize
  - Recommend sections to add/expand
- **LinkedIn Profile Suggestions**:
  - Headline optimization
  - About section improvements
  - Skills to add/prioritize
  - Experience description enhancements
  - Recommendations for connections to seek
- **Realistic Boundaries**:
  - Only suggest changes based on existing experience
  - Flag skills that require learning/certification
  - Distinguish between "can emphasize" vs "need to acquire"
  - Provide honesty score for suggested changes

### 4. Application Guidance
- **Application Method Detection**:
  - Email application with suggested subject line
  - Online form with field-by-field guidance
  - Portal application with profile completion tips
  - LinkedIn Easy Apply optimization
- **Cover Letter Assistance**:
  - Generate personalized cover letter draft
  - Highlight relevant experience for this specific job
  - Match company culture and tone
  - Include key requirements addressed
- **Application Checklist**:
  - Required documents
  - Key points to emphasize
  - Questions to prepare for
  - Follow-up timeline

### 5. Application Tracking (Future Enhancement)
- Track applied positions
- Store job-specific optimized materials
- Record application dates and status
- Set follow-up reminders

## Technical Architecture

### Frontend
- **Framework**: React + TypeScript + Vite
- **Styling**: TailwindCSS or similar modern CSS framework
- **Features**:
  - File upload interface for CV
  - URL input forms for LinkedIn and job postings
  - Multi-step wizard for profile creation
  - Visual gap analysis dashboard
  - Side-by-side comparison view
  - Downloadable reports (PDF)

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Key Services**:
  - Document processing API (CV parsing)
  - Web scraping API (LinkedIn, job postings)
  - AI analysis API (matching, recommendations)
  - Profile management API (CRUD operations)
- **Azure AI Services**:
  - **Document Intelligence**: Extract text and structure from CV
  - **Azure OpenAI**: 
    - Analyze job requirements
    - Generate recommendations
    - Create cover letter drafts
    - Perform semantic matching
  - **Azure AI Search** (optional): Index and search past job analyses
  - **Content Understanding** (if available): Extract entities from documents

### Data Storage
- **Cosmos DB**: 
  - User profiles collection
  - Job analyses collection
  - Application history collection
  - Recommendations cache
- **Blob Storage**:
  - Uploaded CV files (workspace/{userId}/cv/)
  - Scraped job posting HTML (workspace/{userId}/jobs/)
  - Generated reports (workspace/{userId}/reports/)

### Infrastructure (Bicep)
- **Container Apps**:
  - Frontend container app (internal ingress)
  - Backend container app (internal ingress)
- **Application-specific resources**:
  - Cosmos DB database: `apply-db`
  - Cosmos DB containers:
    - `profiles` (partition key: `/userId`)
    - `jobs` (partition key: `/userId`)
    - `analyses` (partition key: `/userId`)
  - Blob storage containers:
    - `apply-cv`
    - `apply-jobs`
    - `apply-reports`
- **Use existing shared resources**:
  - Azure Container Apps Environment
  - Azure AI Foundry/OpenAI
  - Document Intelligence
  - Storage Account
  - VNet and private endpoints

## User Workflows

### First-Time Setup
1. Upload CV (required)
2. Provide LinkedIn URL (optional but recommended)
3. Add portfolio/GitHub/website URLs (optional)
4. System processes and extracts profile information
5. User reviews and confirms extracted data

### Apply for a Job
1. Enter job posting URL
2. System scrapes and analyzes job requirements
3. View gap analysis dashboard:
   - Match score visualization
   - Strengths highlighted
   - Gaps identified
   - Recommendations categorized
4. Review CV optimization suggestions:
   - Accept/reject individual suggestions
   - Preview changes
   - Export optimized CV
5. Review LinkedIn suggestions:
   - View before/after comparisons
   - Copy-paste ready text
6. Get cover letter draft:
   - Edit and personalize
   - Export as PDF or Word
7. View application guidance:
   - Application method details
   - Submission checklist

### Update Profile
1. Upload new CV version
2. Update LinkedIn URL
3. Add new skills/certifications
4. Re-analyze past job applications with updated profile

## AI Prompting Strategy

### Profile Analysis Prompt
```
Analyze this professional profile and extract:
- Core competencies and skills (technical and soft skills)
- Notable achievements with quantifiable results
- Career trajectory and progression
- Unique value propositions
- Areas of expertise
- Professional interests and goals

Format as structured JSON for easy matching.
```

### Job Analysis Prompt
```
Analyze this job posting and extract:
- Must-have requirements (deal-breakers)
- Preferred qualifications (nice-to-have)
- Required experience level and years
- Technical skills and tools
- Soft skills and cultural fit indicators
- Company values and mission alignment
- Application process details

Format as structured JSON with categorization.
```

### Matching Prompt
```
Compare this candidate profile against job requirements:
- Calculate match percentage for each requirement category
- Identify strong alignment points (highlight these)
- Identify gaps (be realistic about severity)
- Suggest honest ways to bridge small gaps
- Flag skills that require significant development
- Overall match score with justification
```

### Recommendation Prompt
```
Generate CV/LinkedIn optimization suggestions based on job match:
- Only suggest changes that are truthful and based on existing experience
- Recommend keyword additions that naturally fit
- Suggest experience rephrasing to emphasize relevant aspects
- Propose skills to highlight (must already be in profile)
- Identify content gaps where legitimate additions can be made
- Provide "honesty score" (1-10) for each suggestion
- Categorize as: "Can emphasize now" vs "Need to develop first"
```

## Security & Privacy

- **Data Privacy**: User CVs and profiles are sensitive personal data
- **Access Control**: Each user can only access their own data (userId isolation)
- **Secure Storage**: All documents encrypted at rest in Blob Storage
- **No Public Endpoints**: App accessible only via VPN (internal ingress)
- **Managed Identity**: Backend uses managed identity for Azure service access
- **Data Retention**: Implement user data deletion upon request

## Success Metrics

- Profile extraction accuracy (user validation rate)
- Job analysis completeness (requirements captured)
- Match score correlation with application success
- User satisfaction with recommendations
- Time saved per application
- Application success rate improvement

## Future Enhancements

### Phase 2
- Application tracking dashboard
- Interview preparation based on job analysis
- Salary negotiation insights
- Multiple CV versions for different job types
- Skills gap learning path recommendations

### Phase 3
- Company research integration (Glassdoor, etc.)
- Network connection suggestions
- Automated application status tracking
- Interview question prediction based on job analysis
- Career path planning

## Automation Ideas (Future Implementation)

### 1. Advanced Web Scraping for JavaScript-Rendered Sites

**Current Limitation**: The current implementation uses Cheerio + Axios, which works for static HTML but fails on JavaScript-rendered job sites (e.g., Workday, Greenhouse, Lever).

**Solution Options**:

#### A. Puppeteer (Recommended for Phase 2)
- **Pros**: 
  - Handles all JavaScript-rendered sites
  - Headless Chrome - most compatible
  - ~200-300MB container size increase
  - 3-5 seconds per scrape
- **Cons**: 
  - Larger container image
  - Higher memory usage
  - Slightly slower than static scraping
- **Implementation**:
  ```typescript
  // Hybrid approach: Try Cheerio first, fall back to Puppeteer
  async function scrapeJobPosting(url: string) {
    try {
      // Fast path: Try static scraping first
      const staticResult = await scrapeWithCheerio(url);
      if (staticResult.textLength > 100) return staticResult;
    } catch (error) {
      console.log('[SCRAPE] Static scraping failed, trying browser...');
    }
    
    // Slow path: Use Puppeteer for JS-rendered sites
    return await scrapeWithBrowser(url);
  }
  ```

#### B. Playwright (Alternative)
- **Pros**: 
  - Cross-browser support (Chrome, Firefox, WebKit)
  - More features than Puppeteer
  - Better for complex interactions
- **Cons**: 
  - ~400-500MB container size increase
  - Overkill for simple scraping
  - Higher resource usage

#### C. Third-Party APIs (Production Scale)
- **Services**: ScraperAPI, Bright Data, Apify
- **Cost**: $49-200/month depending on volume
- **Pros**: 
  - No container bloat
  - Handles anti-scraping measures
  - Proxy rotation included
  - Fast and reliable
- **Cons**: 
  - Recurring cost
  - External dependency
  - API rate limits

**Recommendation**: 
1. **Current (MVP)**: Manual paste mode (implemented) - works 100% of the time
2. **Phase 2**: Add Puppeteer hybrid mode - try Cheerio → fall back to browser
3. **Production Scale**: Integrate third-party API if scraping volume justifies cost

### 2. Job Application Auto-Fill Automation

**Goal**: Help users fill out job application forms automatically using their CV and job analysis data.

#### Option A: Bookmarklet (Recommended for MVP)

**What it is**: JavaScript code stored as a browser bookmark that runs on the current page when clicked.

**Advantages**:
- Zero installation friction (just drag to bookmarks bar)
- Works everywhere (not browser-specific)
- No review process or approval needed
- Can be deployed in ~4-6 hours
- Users can update it instantly (just refresh bookmarklet)

**How it works**:
1. User navigates to job application form
2. Clicks bookmarklet in browser toolbar
3. JavaScript code:
   - Detects form fields on current page
   - Sends field labels to AppLy backend
   - Backend generates answers based on CV + job analysis
   - Fills in form fields automatically
4. User reviews, adjusts, and submits

**Implementation**:
```javascript
// Bookmarklet code (minified and URL-encoded)
javascript:(function(){
  const fields = document.querySelectorAll('input, textarea, select');
  const formData = Array.from(fields).map(f => ({
    name: f.name || f.id,
    label: f.labels?.[0]?.innerText || f.placeholder,
    type: f.type
  }));
  
  fetch('https://aca-apply-backend-ezle7syi.../api/autofill', {
    method: 'POST',
    body: JSON.stringify({ fields: formData, jobId: prompt('Job ID?') })
  })
  .then(r => r.json())
  .then(answers => {
    // Fill in the form fields
    answers.forEach(a => {
      const field = document.querySelector(`[name="${a.name}"]`);
      if (field) field.value = a.value;
    });
  });
})();
```

**Backend Endpoint**:
```typescript
app.post('/api/autofill', async (req, res) => {
  const { fields, jobId, userId } = req.body;
  
  // Get user profile and job analysis
  const profile = await getProfile(userId);
  const job = await getJob(jobId);
  
  // Generate answers for each field
  const prompt = `Based on this CV and job analysis, provide answers for these form fields:
  
  PROFILE: ${profile.parsedData.fullText}
  JOB: ${job.aiAnalysis.summary}
  
  FORM FIELDS: ${JSON.stringify(fields)}
  
  Return JSON array with {name, value} for each field.`;
  
  const answers = await callAI(prompt);
  res.json(answers);
});
```

#### Option B: Browser Extension (Better UX, Longer Timeline)

**Advantages**:
- Better UI integration
- Can inject sidebar into page
- More sophisticated form detection
- Can store credentials locally

**Disadvantages**:
- Requires Chrome/Firefox/Edge-specific development
- 1-2 weeks to build and test
- 2-4 weeks review process for store publication
- Browser-specific (need separate versions)
- Users must install from store

**When to build**: If bookmarklet proves popular and users request better UX

#### Option C: Playwright Full Automation (Backend)

**How it works**: Backend opens headless browser, navigates to job site, fills form, submits

**Advantages**:
- Fully automated (no user interaction)
- Can handle complex multi-page applications
- Consistent behavior

**Disadvantages**:
- Requires user credentials for job sites (security concern)
- Breaks if job site changes form structure
- May violate ToS of some job sites
- High maintenance overhead
- Ethics/legal concerns

**When to use**: Only if user explicitly wants "apply to 100 jobs" automation

### 3. Questionnaire Pre-Generation

**Goal**: Many job applications include custom questionnaires ("Why do you want to work here?", "Describe a time when...", etc.)

**Current**: Manual questionnaire mode (implemented) - AI generates questions, user answers one by one

**Enhancement**: Pre-generate common answers based on CV and job analysis

**Implementation**:
```typescript
// When job is analyzed, also generate pre-filled questionnaire
const commonQuestions = [
  "Why do you want to work here?",
  "Why are you a good fit for this role?",
  "What interests you about this position?",
  "Describe your relevant experience",
  "What are your salary expectations?",
  "When can you start?",
  "Are you authorized to work in [country]?"
];

const prefilledAnswers = await generateAnswers(profile, job, commonQuestions);

// Store in database for quick access
// User can edit before copying to application form
```

### 4. LinkedIn Profile Import Enhancement

**Current Status**: Planned but not implemented

**Challenge**: LinkedIn actively blocks scraping with CAPTCHA and login requirements

**Solutions**:
- **Option A**: User copies LinkedIn profile HTML source (manual but reliable)
- **Option B**: LinkedIn API (requires partnership agreement)
- **Option C**: Browser extension to extract data while user is logged in
- **Option D**: Third-party services like Proxycurl ($2 per profile)

**Recommendation**: Start with Option A (manual copy), evaluate need for automated solution later

### Implementation Priority

1. **Now (Implemented)**: Manual job paste mode ✅
2. **Phase 2a**: Bookmarklet for auto-fill (4-6 hours, high value)
3. **Phase 2b**: Puppeteer hybrid scraping (1-2 days, medium value)
4. **Phase 2c**: Questionnaire pre-generation (4-8 hours, high value)
5. **Phase 3**: Browser extension if bookmarklet proves insufficient
6. **Future**: Third-party scraping API if volume justifies cost

### Technical Notes

- **Container Size Impact**:
  - Current: ~200MB
  - With Puppeteer: ~400-500MB
  - With Playwright: ~600-700MB
  
- **Memory Requirements**:
  - Current: 512MB sufficient
  - With browser automation: 1-2GB recommended

- **Performance**:
  - Cheerio scraping: <500ms
  - Puppeteer scraping: 3-5 seconds
  - API scraping: 1-3 seconds

- **Cost Considerations**:
  - Self-hosted scraping: Free (compute cost only)
  - Third-party API: $49-200/month + per-request fees
  - Browser extension: Free (development time only)

## Deployment Strategy

1. **Bicep Template Creation**:
   - Create `infrastructure/app.bicep` for application resources
   - Reference existing landing zone resources
   - Create Cosmos DB database and containers
   - Create blob storage containers
   - Deploy container apps

2. **Container Images**:
   - Build frontend and backend Docker images
   - Push to existing Azure Container Registry
   - Configure container apps with images

3. **Deployment Command**:
   ```bash
   # Build and push images
   az acr build --registry <acr-name> --image apply-frontend:latest --file frontend/Dockerfile .
   az acr build --registry <acr-name> --image apply-backend:latest --file backend/Dockerfile .
   
   # Deploy infrastructure
   az deployment group create \
     --resource-group rg-ailz-lab \
     --template-file infrastructure/app.bicep \
     --parameters environmentId=<aca-env-id> storageAccountName=<storage-name>
   ```

4. **Access**:
   - Connect to VPN
   - Access frontend URL (internal ingress FQDN)

## Development Phases

### Phase 1: MVP (Current Focus)
- Profile upload and extraction (CV only)
- Job URL analysis
- Basic gap analysis and recommendations
- Simple CV optimization suggestions
- Basic frontend with upload and analysis views

### Phase 2: Enhanced Features
- LinkedIn profile import
- Cover letter generation
- Application guidance
- Enhanced UI with visualizations

### Phase 3: Tracking & Intelligence
- Application tracking
- Historical analysis
- Learning from outcomes
- Advanced recommendations

## Open Questions

1. **LinkedIn Scraping**: Need to handle LinkedIn's anti-scraping measures - may need alternative approaches
2. **Job Portal Variety**: Different job sites have different structures - start with common patterns
3. **CV Format Variations**: Need robust parsing for various CV layouts and styles
4. **Recommendation Honesty**: How to balance optimization with truthfulness - implement transparency scoring
5. **Multi-language**: Support for non-English CVs and job postings?

## Notes

- Start simple with CV upload and job URL analysis
- Focus on honest, realistic recommendations
- Emphasize privacy and data security
- Design for incremental enhancement
- Prioritize user control and transparency
