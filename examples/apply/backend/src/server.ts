// ============================================================================
// AppLy - Job Application Assistant Backend API
// ============================================================================
// Handles CV upload/parsing, job analysis, profile-job matching, and
// AI-powered recommendations for job applications
// ============================================================================

import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import * as appInsights from 'applicationinsights';
import { BlobServiceClient } from '@azure/storage-blob';
import { CosmosClient, Database, Container as CosmosContainer } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Configuration
// ============================================================================

const PORT = process.env.PORT || 3000;
const STATIC_USER_ID = 'default-user'; // Single-user MVP

// Azure service configuration
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || '';
const COSMOS_DB_ENDPOINT = process.env.COSMOS_DB_ENDPOINT || '';
const COSMOS_DB_DATABASE = process.env.COSMOS_DB_DATABASE || 'apply-db';
const AI_FOUNDRY_ENDPOINT = process.env.AI_FOUNDRY_ENDPOINT || '';
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT || '';

// Application Insights
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .start();
  console.log('[APPINSIGHTS] Application Insights started');
}

// ============================================================================
// Azure Clients Initialization
// ============================================================================

const credential = new DefaultAzureCredential();

// Blob Storage
const blobServiceClient = new BlobServiceClient(
  `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
  credential
);

// Cosmos DB
const cosmosClient = new CosmosClient({
  endpoint: COSMOS_DB_ENDPOINT,
  aadCredentials: credential
});

let database: Database;
let profilesContainer: CosmosContainer;
let jobsContainer: CosmosContainer;
let analysesContainer: CosmosContainer;

// Document Intelligence (using managed identity)
const documentIntelligenceClient = new DocumentAnalysisClient(
  DOCUMENT_INTELLIGENCE_ENDPOINT,
  credential
);

// Helper function to get bearer token for AI Foundry API calls
async function getAIFoundryToken(): Promise<string> {
  const tokenResponse = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return tokenResponse.token;
}

// ============================================================================
// Type Definitions
// ============================================================================

interface UserProfile {
  id: string;
  userId: string;
  cvBlobPath: string;
  originalFilename: string;
  mimeType: string;
  uploadedAt: string;
  parsedData: {
    fullText: string;
    name?: string;
    email?: string;
    phone?: string;
    skills: string[];
    experience: Array<{
      title?: string;
      company?: string;
      duration?: string;
      description?: string;
    }>;
    education: Array<{
      degree?: string;
      institution?: string;
      year?: string;
    }>;
  };
  aiAnalysis?: {
    summary: string;
    keyStrengths: string[];
    careerLevel: string;
    domains: string[];
  };
}

interface JobPosting {
  id: string;
  userId: string;
  url: string;
  scrapedAt: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  fullText: string; // Complete scraped text for AI analysis
  requirements: string[];
  aiAnalysis?: {
    summary: string;
    keyRequirements: string[];
    experienceLevel: string;
    domains: string[];
    compensationRange?: string;
  };
}

interface MatchAnalysis {
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
    missingExperience: string[]; // Key experiences not in CV
    salaryExpectation: string; // Realistic salary range estimate
    seniorityAssessment: string; // Junior/Mid/Senior/Lead/Principal
  };
  recommendations: Array<{
    type: 'strength' | 'weakness' | 'action';
    text: string;
    honestyScore: number; // 0-100 (100 = completely honest, no exaggeration)
  }>;
  applicationAdvice: string;
  cvRewriteSuggestions?: {
    sectionsToHighlight: string[];
    keywordsToAdd: string[];
    experiencesToEmphasize: string[];
  };
  followUpQuestions?: Array<{
    question: string;
    reason: string; // Why this matters for the role
  }>;
  coverLetter?: {
    content: string;
    tone: string; // professional, enthusiastic, technical, etc.
    keyPoints: string[]; // Main points covered in letter
  };
}

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// ============================================================================
// Database Initialization
// ============================================================================

async function initializeDatabase() {
  try {
    database = cosmosClient.database(COSMOS_DB_DATABASE);
    profilesContainer = database.container('profiles');
    jobsContainer = database.container('jobs');
    analysesContainer = database.container('analyses');
    console.log('[COSMOS] Database containers initialized');
  } catch (error) {
    console.error('[COSMOS] Failed to initialize database:', error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Upload file to blob storage
 */
async function uploadToBlob(
  containerName: string,
  blobPath: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();
  
  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);
  await blockBlobClient.upload(content, content.length, {
    blobHTTPHeaders: { blobContentType: contentType }
  });
}

/**
 * Parse CV using Azure Document Intelligence
 */
async function parseCV(fileBuffer: Buffer, mimeType: string): Promise<UserProfile['parsedData']> {
  console.log('[DOC_INTEL] Starting CV parsing...');
  
  const poller = await documentIntelligenceClient.beginAnalyzeDocument(
    'prebuilt-document',
    fileBuffer
  );
  const result = await poller.pollUntilDone();
  
  const fullText = result.content || '';
  console.log('[DOC_INTEL] Extracted text length:', fullText.length);
  
  // Extract structured data (basic pattern matching for MVP)
  const emailMatch = fullText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = fullText.match(/[\+\(]?\d{1,3}[-\s\)]?\d{3,4}[-\s]?\d{3,4}/);
  
  // Extract skills (look for common skill sections)
  const skills: string[] = [];
  const skillsMatch = fullText.match(/(?:Skills|Technologies|Tools)[\s:]+([^\n]+(?:\n[^\n]+)*?)(?:\n\n|$)/i);
  if (skillsMatch) {
    const skillsText = skillsMatch[1];
    skills.push(...skillsText.split(/[,;•·\n]/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 50));
  }
  
  return {
    fullText,
    email: emailMatch?.[0],
    phone: phoneMatch?.[0],
    skills: skills.slice(0, 20), // Limit to 20 skills
    experience: [], // Will be enhanced by AI analysis
    education: []
  };
}

/**
 * Analyze CV with Azure OpenAI
 */
async function analyzeProfileWithAI(parsedData: UserProfile['parsedData']): Promise<UserProfile['aiAnalysis']> {
  console.log('[AI] Analyzing profile with AI...');
  
  const prompt = `You are a professional career advisor analyzing a CV. Extract key information and provide an honest, realistic assessment.

CV TEXT:
${parsedData.fullText.substring(0, 8000)}

Provide a JSON response with this structure:
{
  "summary": "Brief 2-3 sentence professional summary",
  "keyStrengths": ["strength1", "strength2", "strength3"],
  "careerLevel": "junior|mid|senior|lead",
  "domains": ["domain1", "domain2"]
}

Be realistic and honest. Only mention strengths that are clearly evident in the CV.`;

  const token = await getAIFoundryToken();
  const response = await axios.post(
    `${AI_FOUNDRY_ENDPOINT}openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview`,
    {
      messages: [
        { role: 'system', content: 'You are a professional career advisor who provides honest, realistic assessments.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const aiResponseText = response.data.choices[0].message.content;
  console.log('[AI] Profile analysis response:', aiResponseText.substring(0, 200));
  
  // Parse JSON from AI response
  const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  // Fallback
  return {
    summary: 'Profile analyzed successfully',
    keyStrengths: parsedData.skills.slice(0, 3),
    careerLevel: 'mid',
    domains: ['general']
  };
}

/**
 * Scrape job posting from URL
 */
async function scrapeJobPosting(url: string): Promise<Partial<JobPosting>> {
  console.log('[SCRAPER] Fetching job posting:', url);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script and style tags
    $('script, style').remove();
    
    // Extract text content
    const bodyText = $('body').text();
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    
    // Try to find title (common patterns)
    const title = $('h1').first().text().trim() || 
                  $('[class*="job-title"], [class*="jobTitle"]').first().text().trim() ||
                  'Job Position';
    
    // Try to find company
    const company = $('[class*="company"], [class*="employer"]').first().text().trim() ||
                    'Company Name';
    
    // Try to find location
    const location = $('[class*="location"], [class*="city"]').first().text().trim();
    
    console.log('[SCRAPER] Scraped job:', { title, company, location, textLength: cleanText.length });
    
    return {
      title,
      company,
      location,
      description: cleanText.substring(0, 10000), // Limit description size
      fullText: cleanText, // Full text for AI analysis
      requirements: []
    };
  } catch (error: any) {
    console.error('[SCRAPER] Failed to scrape job:', error.message);
    throw new Error(`Failed to scrape job posting: ${error.message}`);
  }
}

/**
 * Analyze job posting with AI
 */
async function analyzeJobWithAI(jobData: Partial<JobPosting>): Promise<JobPosting['aiAnalysis']> {
  console.log('[AI] Analyzing job posting with AI...');
  
  const prompt = `You are an expert recruiter and technical hiring manager analyzing a job posting in EXTREME DETAIL.

JOB POSTING:
Title: ${jobData.title}
Company: ${jobData.company}
Location: ${jobData.location || 'Not specified'}
Full Text: ${jobData.fullText?.substring(0, 8000) || jobData.description?.substring(0, 8000)}

Perform a COMPREHENSIVE analysis and extract:

1. **Technical Skills & Tools**: Every technology, framework, language, platform, tool mentioned
2. **Experience Requirements**: Years of experience, specific project types, domain knowledge
3. **Soft Skills**: Communication, leadership, collaboration requirements
4. **Responsibilities**: Day-to-day work, project scope, team structure
5. **Nice-to-Haves vs Must-Haves**: Distinguish required vs preferred qualifications
6. **Company Culture Signals**: Work style, values, growth opportunities

Provide a DETAILED JSON response:
{
  "summary": "3-4 sentence comprehensive summary of role, responsibilities, and ideal candidate",
  "keyRequirements": [
    "Specific requirement 1 with context",
    "Specific requirement 2 with context",
    "..." (list ALL requirements, aim for 10-20 items)
  ],
  "technicalSkills": {
    "required": ["tech1", "tech2", "..."],
    "preferred": ["tech3", "tech4", "..."]
  },
  "experienceLevel": "junior|mid-level|senior|staff|principal|lead",
  "yearsExperience": "X-Y years or specific requirement",
  "domains": ["specific domain 1", "specific domain 2"],
  "responsibilities": [
    "Key responsibility 1",
    "Key responsibility 2",
    "..." (list 5-10 main responsibilities)
  ],
  "compensationRange": "salary range if mentioned, benefits, equity, etc.",
  "companyInfo": {
    "industry": "industry/sector",
    "size": "startup|small|mid|large|enterprise if determinable",
    "culture": "brief culture assessment from posting"
  }
}

CRITICAL INSTRUCTIONS:
- Extract EVERY technical term, framework, tool, language mentioned
- Be specific: Don't say "cloud experience", say "AWS, Azure, or GCP"
- Don't say "programming languages", list the actual languages: "Python, Go, JavaScript"
- Distinguish seniority correctly: titles with "Senior", "Staff", "Principal", "Lead" are senior+ roles
- If it's a top-tier company (FAANG, NVIDIA, etc.), note that in culture
- List responsibilities in detail, not generic statements`;

  const token = await getAIFoundryToken();
  const response = await axios.post(
    `${AI_FOUNDRY_ENDPOINT}openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview`,
    {
      messages: [
        { role: 'system', content: 'You are an expert technical recruiter who performs extremely detailed job posting analysis, extracting every requirement, technology, and qualification mentioned.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 2500
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const aiResponseText = response.data.choices[0].message.content;
  console.log('[AI] Job analysis response:', aiResponseText.substring(0, 200));
  
  // Parse JSON from AI response
  const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const analysis = JSON.parse(jsonMatch[0]);
    
    // Flatten technical skills into keyRequirements for backward compatibility
    if (analysis.technicalSkills) {
      const techSkills = [
        ...(analysis.technicalSkills.required || []).map((s: string) => `Required: ${s}`),
        ...(analysis.technicalSkills.preferred || []).map((s: string) => `Preferred: ${s}`)
      ];
      analysis.keyRequirements = [...analysis.keyRequirements, ...techSkills];
    }
    
    return analysis;
  }
  
  // Fallback
  return {
    summary: 'Job posting analyzed successfully',
    keyRequirements: ['Experience in relevant field'],
    experienceLevel: 'mid',
    domains: ['general'],
    compensationRange: undefined
  };
}

/**
 * Match profile to job and generate recommendations
 */
async function matchProfileToJob(
  profile: UserProfile,
  job: JobPosting
): Promise<Omit<MatchAnalysis, 'id' | 'userId' | 'profileId' | 'jobId' | 'analyzedAt'>> {
  console.log('[AI] Matching profile to job...');
  
  const prompt = `You are an honest career advisor analyzing if a candidate matches a job opportunity.

FULL CANDIDATE CV:
${profile.parsedData.fullText}

CANDIDATE SUMMARY:
- Key Strengths: ${profile.aiAnalysis?.keyStrengths.join(', ')}
- Career Level: ${profile.aiAnalysis?.careerLevel}

FULL JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
Full Description: ${job.fullText.substring(0, 2000)}

DETAILED JOB REQUIREMENTS (from AI analysis):
${JSON.stringify(job.aiAnalysis, null, 2)}

Provide a DETAILED, HONEST analysis in JSON format:
{
  "matchScore": 0-100 (be realistic, not optimistic),
  "gapAnalysis": {
    "missingSkills": ["SPECIFIC technology from JD NOT in CV - be VERY SPECIFIC", "..."],
    "matchingSkills": ["SPECIFIC technology in BOTH JD and CV", "..."],
    "experienceGap": "gap description",
    "missingExperience": ["specific project type/work from JD not in CV", "..."],
    "salaryExpectation": "realistic range considering company prestige",
    "seniorityAssessment": "junior|mid-level|senior|staff|principal based on job title + requirements"
  },
  "recommendations": [
    {"type": "skill_gap|experience_gap|certification", "text": "specific actionable recommendation", "honestyScore": 100}
  ],
  "applicationAdvice": "honest advice about applying",
  "cvRewriteSuggestions": {
    "sectionsToHighlight": ["CV section matching JD", "..."],
    "keywordsToAdd": ["keyword from JD to add", "..."],
    "experiencesToEmphasize": ["which projects to feature", "..."]
  },
  "followUpQuestions": [
    {"question": "targeted question about ambiguous skill", "reason": "why this matters"}
  ]
}

CRITICAL RULES FOR MISSING SKILLS:
1. **Use the DETAILED JOB ANALYSIS above**: Check technicalSkills.required, technicalSkills.preferred, keyRequirements
2. **Be EXTREMELY SPECIFIC with technology names**:
   - BAD: "missing cloud experience", "missing AI/ML skills", "specific technology not mentioned"
   - GOOD: "CUDA (required for GPU programming)", "PyTorch (mentioned 5 times)", "distributed training frameworks like Horovod"
3. **Go technology-by-technology**: Compare EVERY tech in job analysis against CV
4. **Company Tier**: NVIDIA, Google, Meta, Amazon, Microsoft, Apple = significantly higher comp
5. **Seniority by Title**: "Senior", "Staff", "Principal", "Lead" in title = senior+ role
6. **Missing Project Types**: E.g., "no production ML at scale", "no GPU kernel optimization"
7. **Only ask about skills UNCLEAR in CV**: Don't ask about obvious gaps

EXAMPLE OF GOOD VS BAD:
❌ BAD: "Missing Skills: Specific technology or tool not mentioned in the job posting"
✅ GOOD: "Missing Skills: CUDA (critical for GPU optimization at NVIDIA), Distributed ML training with Horovod/DeepSpeed (required for large models), Production MLOps (mentioned in 3 responsibilities)"`;

  const token = await getAIFoundryToken();
  const response = await axios.post(
    `${AI_FOUNDRY_ENDPOINT}openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview`,
    {
      messages: [
        { role: 'system', content: 'You are an expert career advisor who provides realistic assessments while recognizing high-value opportunities. You understand tech industry salary ranges and seniority levels.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 3000
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const aiResponseText = response.data.choices[0].message.content;
  console.log('[AI] Match analysis response:', aiResponseText.substring(0, 300));
  
  // Parse JSON from AI response
  const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  // Fallback
  return {
    matchScore: 50,
    gapAnalysis: {
      missingSkills: ['Unable to analyze'],
      matchingSkills: profile.parsedData.skills.slice(0, 3),
      experienceGap: 'Unable to determine experience gap',
      missingExperience: ['Analysis failed'],
      salaryExpectation: 'Unable to estimate',
      seniorityAssessment: 'Unable to assess'
    },
    recommendations: [
      {
        type: 'action',
        text: 'Review the job requirements carefully and assess your fit',
        honestyScore: 100
      }
    ],
    applicationAdvice: 'Consider whether this role aligns with your background before applying',
    cvRewriteSuggestions: {
      sectionsToHighlight: [],
      keywordsToAdd: [],
      experiencesToEmphasize: []
    },
    followUpQuestions: []
  };
}

/**
 * Generate cover letter with AI based on match analysis
 */
async function generateCoverLetter(
  profile: UserProfile,
  job: JobPosting,
  matchAnalysis: any
): Promise<MatchAnalysis['coverLetter']> {
  console.log('[AI] Generating cover letter...');
  
  const prompt = `You are an expert at writing honest, compelling cover letters for job applications.

CANDIDATE INFORMATION:
Name: ${profile.parsedData.fullText.split('\n')[0] || 'Candidate'}
Summary: ${profile.aiAnalysis?.summary}
Key Strengths: ${profile.aiAnalysis?.keyStrengths.join(', ')}
Career Level: ${profile.aiAnalysis?.careerLevel}
Relevant Skills: ${matchAnalysis.gapAnalysis.matchingSkills.join(', ')}

JOB INFORMATION:
Position: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}

MATCH ANALYSIS:
Match Score: ${matchAnalysis.matchScore}%
Matching Strengths: ${matchAnalysis.gapAnalysis.matchingSkills.slice(0, 5).join(', ')}
Experience Assessment: ${matchAnalysis.gapAnalysis.seniorityAssessment}
Key Recommendations: ${matchAnalysis.recommendations.map((r: any) => r.text).slice(0, 3).join('; ')}

CV HIGHLIGHTS TO EMPHASIZE:
${matchAnalysis.cvRewriteSuggestions.experiencesToEmphasize.slice(0, 3).join('; ')}

Generate a professional cover letter (300-400 words) following these guidelines:

1. **Structure:**
   - Opening: Express genuine interest in the role
   - Body (2-3 paragraphs): Highlight REAL matching experiences and skills
   - Closing: Express enthusiasm and availability

2. **HONESTY RULES:**
   - Only mention skills/experience actually in their CV
   - Never exaggerate or fabricate
   - If they're missing key requirements, focus on transferable skills instead
   - Be confident about strengths, honest about learning opportunities

3. **Tone:**
   - Professional but personable
   - Confident without being arrogant
   - Show genuine interest in the company/role
   - Match company culture (formal for enterprise, enthusiastic for startups)

4. **Key Points to Cover:**
   - Why you're interested in THIS company/role specifically
   - 2-3 concrete examples from CV that match requirements
   - What value you bring
   - Enthusiasm for growth opportunities

Provide response as JSON:
{
  "content": "Full cover letter text with proper paragraphs",
  "tone": "professional|enthusiastic|technical",
  "keyPoints": ["main point 1", "main point 2", "main point 3"]
}`;

  try {
    const token = await getAIFoundryToken();
    const response = await axios.post(
      `${AI_FOUNDRY_ENDPOINT}openai/deployments/gpt-4o/chat/completions?api-version=2024-02-15-preview`,
      {
        messages: [
          { role: 'system', content: 'You are an expert career advisor who writes honest, compelling cover letters based solely on real qualifications.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7, // Slightly higher for more natural writing
        max_tokens: 1500
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    const aiResponseText = response.data.choices[0].message.content;
    console.log('[AI] Cover letter generated:', aiResponseText.substring(0, 150));
    
    // Parse JSON from AI response
    const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // Fallback
    return {
      content: aiResponseText,
      tone: 'professional',
      keyPoints: ['Unable to extract key points']
    };
  } catch (error: any) {
    console.error('[AI] Cover letter generation failed:', error.message);
    return undefined;
  }
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a retryable error
      const isRetryable = 
        error.response?.status === 429 || // Rate limit
        error.response?.status === 503 || // Service unavailable
        error.code === 'ECONNRESET' ||    // Connection reset
        error.code === 'ETIMEDOUT';       // Timeout
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      // Exponential backoff
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`[RETRY] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Error response helper
 */
function sendErrorResponse(res: Response, statusCode: number, message: string, details?: any) {
  const errorResponse: any = {
    status: 'error',
    message,
    timestamp: new Date().toISOString()
  };
  
  if (details && process.env.NODE_ENV !== 'production') {
    errorResponse.details = details;
  }
  
  res.status(statusCode).json(errorResponse);
}

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'apply-backend', timestamp: new Date().toISOString() });
});

/**
 * Upload and parse CV
 */
app.post('/api/profile/upload', upload.single('cv'), async (req: Request, res: Response) => {
  try {
    console.log('[UPLOAD] Received CV upload request');
    
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }
    
    const userId = STATIC_USER_ID;
    const profileId = uuidv4();
    const timestamp = new Date().toISOString();
    const originalFilename = req.file.originalname;
    const mimeType = req.file.mimetype;
    
    // Upload to blob storage
    const blobPath = `${userId}/${profileId}/${originalFilename}`;
    console.log('[UPLOAD] Uploading to blob:', blobPath);
    await uploadToBlob('apply-cv', blobPath, req.file.buffer, mimeType);
    
    // Parse CV with Document Intelligence
    const parsedData = await parseCV(req.file.buffer, mimeType);
    
    // Analyze with AI
    const aiAnalysis = await analyzeProfileWithAI(parsedData);
    
    // Save to Cosmos DB
    const profile: UserProfile = {
      id: profileId,
      userId,
      cvBlobPath: blobPath,
      originalFilename,
      mimeType,
      uploadedAt: timestamp,
      parsedData,
      aiAnalysis
    };
    
    console.log('[COSMOS] Saving profile to database');
    await profilesContainer.items.create(profile);
    
    console.log('[UPLOAD] Profile created successfully:', profileId);
    res.json({
      status: 'success',
      profile: {
        id: profile.id,
        uploadedAt: profile.uploadedAt,
        originalFilename: profile.originalFilename,
        summary: profile.aiAnalysis?.summary,
        keyStrengths: profile.aiAnalysis?.keyStrengths,
        careerLevel: profile.aiAnalysis?.careerLevel,
        skills: profile.parsedData.skills
      }
    });
    
  } catch (error: any) {
    console.error('[UPLOAD] Error:', error);
    
    if (error.response?.status === 429) {
      return sendErrorResponse(res, 429, 'Rate limit exceeded. Please try again in a moment.');
    }
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return sendErrorResponse(res, 504, 'Request timeout. The file may be too large or the service is slow to respond.');
    }
    
    if (error.message?.includes('firewall') || error.message?.includes('blocked')) {
      return sendErrorResponse(res, 403, 'Network access blocked. Please contact support.');
    }
    
    sendErrorResponse(res, 500, 'Failed to process CV upload. Please try again.', error.message);
  }
});

/**
 * Get user profile
 */
app.get('/api/profile', async (req: Request, res: Response) => {
  try {
    const userId = STATIC_USER_ID;
    
    // Query for user's profile (most recent)
    const { resources } = await profilesContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.uploadedAt DESC',
        parameters: [{ name: '@userId', value: userId }]
      })
      .fetchAll();
    
    if (resources.length === 0) {
      return res.json({ status: 'success', profile: null });
    }
    
    const profile = resources[0];
    res.json({
      status: 'success',
      profile: {
        id: profile.id,
        uploadedAt: profile.uploadedAt,
        originalFilename: profile.originalFilename,
        summary: profile.aiAnalysis?.summary,
        keyStrengths: profile.aiAnalysis?.keyStrengths,
        careerLevel: profile.aiAnalysis?.careerLevel,
        skills: profile.parsedData.skills,
        email: profile.parsedData.email,
        phone: profile.parsedData.phone
      }
    });
    
  } catch (error: any) {
    console.error('[PROFILE] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * Analyze job posting
 */
app.post('/api/job/analyze', async (req: Request, res: Response) => {
  try {
    console.log('[JOB] Received job analysis request');
    
    const { url, manualText, title, company, location } = req.body;
    
    if (!url && !manualText) {
      return res.status(400).json({ status: 'error', message: 'Job URL or manual text is required' });
    }
    
    const userId = STATIC_USER_ID;
    const jobId = uuidv4();
    const timestamp = new Date().toISOString();
    
    let scrapedData: Partial<JobPosting>;
    
    // If manual text provided, use that instead of scraping
    if (manualText) {
      console.log('[JOB] Using manually provided job description (length:', manualText.length, ')');
      scrapedData = {
        title: title || 'Manual Entry',
        company: company || 'Unknown Company',
        location: location || '',
        description: manualText,
        fullText: manualText,
        requirements: []
      };
    } else {
      // Scrape job posting
      console.log('[JOB] Scraping job from URL:', url);
      scrapedData = await scrapeJobPosting(url);
      
      // If scraping failed (empty text), return error with suggestion
      if (!scrapedData.fullText || scrapedData.fullText.length < 100) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Failed to extract job description from URL. This website may use JavaScript rendering. Please copy and paste the job description manually instead.',
          suggestion: 'manual_paste'
        });
      }
    }
    
    // Analyze with AI
    const aiAnalysis = await analyzeJobWithAI(scrapedData);
    
    // Save to Cosmos DB
    const job: JobPosting = {
      id: jobId,
      userId,
      url,
      scrapedAt: timestamp,
      title: scrapedData.title || 'Unknown Title',
      company: scrapedData.company || 'Unknown Company',
      location: scrapedData.location,
      description: scrapedData.description || '',
      fullText: scrapedData.fullText || scrapedData.description || '',
      requirements: scrapedData.requirements || [],
      aiAnalysis
    };
    
    console.log('[COSMOS] Saving job to database');
    await jobsContainer.items.create(job);
    
    // Save job description to blob for future reference
    const blobPath = `${userId}/${jobId}/job-posting.txt`;
    await uploadToBlob('apply-jobs', blobPath, Buffer.from(job.description), 'text/plain');
    
    console.log('[JOB] Job analyzed successfully:', jobId);
    res.json({
      status: 'success',
      job: {
        id: job.id,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        summary: job.aiAnalysis?.summary,
        keyRequirements: job.aiAnalysis?.keyRequirements,
        experienceLevel: job.aiAnalysis?.experienceLevel,
        scrapedAt: job.scrapedAt
      }
    });
    
  } catch (error: any) {
    console.error('[JOB] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * Match profile to job and get recommendations
 */
app.post('/api/match', async (req: Request, res: Response) => {
  try {
    console.log('[MATCH] Received match request');
    
    const { jobId } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ status: 'error', message: 'Job ID is required' });
    }
    
    const userId = STATIC_USER_ID;
    
    // Get user's profile
    const { resources: profiles } = await profilesContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.uploadedAt DESC',
        parameters: [{ name: '@userId', value: userId }]
      })
      .fetchAll();
    
    if (profiles.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No profile found. Please upload your CV first.' });
    }
    
    const profile = profiles[0] as UserProfile;
    
    // Get job
    const jobResponse = await jobsContainer.item(jobId, userId).read();
    if (!jobResponse.resource) {
      return res.status(404).json({ status: 'error', message: 'Job not found' });
    }
    
    const job = jobResponse.resource as JobPosting;
    
    // Perform matching analysis with retry logic
    const matchResult = await retryWithBackoff(() => matchProfileToJob(profile, job));
    
    // Generate cover letter (optional, don't fail if it doesn't work)
    let coverLetter;
    try {
      coverLetter = await retryWithBackoff(() => generateCoverLetter(profile, job, matchResult));
    } catch (error: any) {
      console.log('[MATCH] Cover letter generation failed, continuing without it:', error.message);
    }
    
    // Save analysis to Cosmos DB
    const analysisId = uuidv4();
    const analysis: MatchAnalysis = {
      id: analysisId,
      userId,
      profileId: profile.id,
      jobId: job.id,
      analyzedAt: new Date().toISOString(),
      ...matchResult,
      coverLetter
    };
    
    console.log('[COSMOS] Saving analysis to database');
    await analysesContainer.items.create(analysis);
    
    // Generate report and save to blob
    const report = `JOB APPLICATION ANALYSIS REPORT
Generated: ${analysis.analyzedAt}

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
URL: ${job.url}

MATCH SCORE: ${analysis.matchScore}/100

GAP ANALYSIS:
Experience Match: ${analysis.gapAnalysis.experienceGap}

Matching Skills:
${analysis.gapAnalysis.matchingSkills.map(s => `- ${s}`).join('\n')}

Missing Skills:
${analysis.gapAnalysis.missingSkills.map(s => `- ${s}`).join('\n')}

RECOMMENDATIONS:
${analysis.recommendations.map((r, i) => `${i + 1}. [${r.type.toUpperCase()}] ${r.text}`).join('\n\n')}

APPLICATION ADVICE:
${analysis.applicationAdvice}

---
This analysis is provided for informational purposes. All recommendations are based on honest assessment of your existing qualifications.`;
    
    const reportPath = `${userId}/${analysisId}/report.txt`;
    await uploadToBlob('apply-reports', reportPath, Buffer.from(report), 'text/plain');
    
    console.log('[MATCH] Analysis completed successfully:', analysisId);
    res.json({
      status: 'success',
      analysis: {
        id: analysis.id,
        matchScore: analysis.matchScore,
        gapAnalysis: analysis.gapAnalysis,
        recommendations: analysis.recommendations,
        applicationAdvice: analysis.applicationAdvice,
        analyzedAt: analysis.analyzedAt,
        job: {
          title: job.title,
          company: job.company,
          url: job.url
        }
      }
    });
    
  } catch (error: any) {
    console.error('[MATCH] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * Get all analyses for user
 */
app.get('/api/analyses', async (req: Request, res: Response) => {
  try {
    const userId = STATIC_USER_ID;
    
    const { resources: analyses } = await analysesContainer.items
      .query({
        query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.analyzedAt DESC',
        parameters: [{ name: '@userId', value: userId }]
      })
      .fetchAll();
    
    // Fetch job details for each analysis
    const analysesWithJobs = await Promise.all(
      analyses.map(async (analysis) => {
        const jobResponse = await jobsContainer.item(analysis.jobId, userId).read();
        const job = jobResponse.resource as JobPosting;
        
        return {
          id: analysis.id,
          matchScore: analysis.matchScore,
          analyzedAt: analysis.analyzedAt,
          job: {
            title: job.title,
            company: job.company,
            url: job.url
          }
        };
      })
    );
    
    res.json({ status: 'success', analyses: analysesWithJobs });
    
  } catch (error: any) {
    console.error('[ANALYSES] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * Get specific analysis details
 */
app.get('/api/analyses/:id', async (req: Request, res: Response) => {
  try {
    const userId = STATIC_USER_ID;
    const analysisId = req.params.id;
    
    const analysisResponse = await analysesContainer.item(analysisId, userId).read();
    if (!analysisResponse.resource) {
      return res.status(404).json({ status: 'error', message: 'Analysis not found' });
    }
    
    const analysis = analysisResponse.resource as MatchAnalysis;
    
    // Get job details
    const jobResponse = await jobsContainer.item(analysis.jobId, userId).read();
    const job = jobResponse.resource as JobPosting;
    
    res.json({
      status: 'success',
      analysis: {
        id: analysis.id,
        matchScore: analysis.matchScore,
        gapAnalysis: analysis.gapAnalysis,
        recommendations: analysis.recommendations,
        applicationAdvice: analysis.applicationAdvice,
        analyzedAt: analysis.analyzedAt,
        job: {
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          summary: job.aiAnalysis?.summary,
          keyRequirements: job.aiAnalysis?.keyRequirements
        }
      }
    });
    
  } catch (error: any) {
    console.error('[ANALYSIS_DETAIL] Error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`[SERVER] AppLy backend running on port ${PORT}`);
      console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[SERVER] Storage Account: ${STORAGE_ACCOUNT_NAME}`);
      console.log(`[SERVER] Cosmos DB: ${COSMOS_DB_DATABASE}`);
    });
  } catch (error) {
    console.error('[SERVER] Failed to start:', error);
    process.exit(1);
  }
}

startServer();
