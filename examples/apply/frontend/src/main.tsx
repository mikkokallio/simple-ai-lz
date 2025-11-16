// ============================================================================
// AppLy - Job Application Assistant Frontend
// ============================================================================
// React single-page application for CV upload, job analysis, and
// AI-powered job application recommendations
// ============================================================================

import { StrictMode, useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = (window as any).BACKEND_URL || 'http://localhost:3000';

// ============================================================================
// Type Definitions
// ============================================================================

interface Profile {
  id: string;
  uploadedAt: string;
  originalFilename: string;
  summary?: string;
  keyStrengths?: string[];
  careerLevel?: string;
  skills?: string[];
  email?: string;
  phone?: string;
}

interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  location?: string;
  summary?: string;
  keyRequirements?: string[];
  experienceLevel?: string;
  scrapedAt: string;
}

interface Analysis {
  id: string;
  matchScore: number;
  analyzedAt: string;
  job: {
    title: string;
    company: string;
    url: string;
  };
}

interface AnalysisDetail extends Analysis {
  gapAnalysis: {
    missingSkills: string[];
    matchingSkills: string[];
    experienceGap: string;
  };
  recommendations: Array<{
    type: 'strength' | 'weakness' | 'action';
    text: string;
    honestyScore: number;
  }>;
  applicationAdvice: string;
  job: {
    title: string;
    company: string;
    location?: string;
    url: string;
    summary?: string;
    keyRequirements?: string[];
  };
}

// ============================================================================
// Main App Component
// ============================================================================

function App() {
  const [currentView, setCurrentView] = useState<'home' | 'upload' | 'analyze' | 'results' | 'history'>('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisDetail | null>(null);

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile`);
      const data = await response.json();
      if (data.status === 'success' && data.profile) {
        setProfile(data.profile);
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const loadAnalyses = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyses`);
      const data = await response.json();
      if (data.status === 'success') {
        setAnalyses(data.analyses);
      }
    } catch (err) {
      console.error('Failed to load analyses:', err);
    }
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>AppLy</h1>
        <p style={styles.subtitle}>AI-Powered Job Application Assistant</p>
        <nav style={styles.nav}>
          <button
            style={{ ...styles.navButton, ...(currentView === 'home' && styles.navButtonActive) }}
            onClick={() => setCurrentView('home')}
          >
            Home
          </button>
          <button
            style={{ ...styles.navButton, ...(currentView === 'upload' && styles.navButtonActive) }}
            onClick={() => setCurrentView('upload')}
          >
            {profile ? 'Update CV' : 'Upload CV'}
          </button>
          <button
            style={{ ...styles.navButton, ...(currentView === 'analyze' && styles.navButtonActive) }}
            onClick={() => setCurrentView('analyze')}
            disabled={!profile}
          >
            Analyze Job
          </button>
          <button
            style={{ ...styles.navButton, ...(currentView === 'history' && styles.navButtonActive) }}
            onClick={() => {
              setCurrentView('history');
              loadAnalyses();
            }}
            disabled={!profile}
          >
            History
          </button>
        </nav>
      </header>

      <main style={styles.main}>
        {error && (
          <div style={styles.error}>
            <strong>Error:</strong> {error}
            <button style={styles.errorClose} onClick={() => setError(null)}>×</button>
          </div>
        )}

        {currentView === 'home' && (
          <HomeView profile={profile} onNavigate={setCurrentView} />
        )}

        {currentView === 'upload' && (
          <UploadView
            onUploadSuccess={(newProfile) => {
              setProfile(newProfile);
              setCurrentView('home');
            }}
            onError={setError}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {currentView === 'analyze' && profile && (
          <AnalyzeView
            profile={profile}
            onAnalysisComplete={(analysis) => {
              setSelectedAnalysis(analysis);
              setCurrentView('results');
            }}
            onError={setError}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {currentView === 'results' && selectedAnalysis && (
          <ResultsView analysis={selectedAnalysis} />
        )}

        {currentView === 'history' && (
          <HistoryView
            analyses={analyses}
            onSelectAnalysis={async (analysisId) => {
              try {
                const response = await fetch(`${API_BASE_URL}/api/analyses/${analysisId}`);
                const data = await response.json();
                if (data.status === 'success') {
                  setSelectedAnalysis(data.analysis);
                  setCurrentView('results');
                }
              } catch (err) {
                setError('Failed to load analysis details');
              }
            }}
          />
        )}
      </main>

      <footer style={styles.footer}>
        <p>AppLy provides honest, realistic job application advice. All recommendations are based on your actual qualifications.</p>
      </footer>
    </div>
  );
}

// ============================================================================
// Home View
// ============================================================================

function HomeView({ profile, onNavigate }: { profile: Profile | null; onNavigate: (view: any) => void }) {
  return (
    <div style={styles.view}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Welcome to AppLy</h2>
        
        {profile ? (
          <div>
            <div style={styles.profileSummary}>
              <h3>Your Profile</h3>
              <p><strong>CV:</strong> {profile.originalFilename}</p>
              <p><strong>Uploaded:</strong> {new Date(profile.uploadedAt).toLocaleDateString()}</p>
              {profile.careerLevel && <p><strong>Level:</strong> {profile.careerLevel}</p>}
              {profile.summary && (
                <div style={styles.summaryBox}>
                  <strong>Summary:</strong>
                  <p>{profile.summary}</p>
                </div>
              )}
              {profile.keyStrengths && profile.keyStrengths.length > 0 && (
                <div>
                  <strong>Key Strengths:</strong>
                  <ul style={styles.list}>
                    {profile.keyStrengths.map((strength, i) => (
                      <li key={i}>{strength}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div style={styles.actions}>
              <button style={styles.primaryButton} onClick={() => onNavigate('analyze')}>
                Analyze a Job Posting
              </button>
              <button style={styles.secondaryButton} onClick={() => onNavigate('upload')}>
                Update CV
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={styles.text}>Get started by uploading your CV. AppLy will analyze your qualifications and help you make honest, informed decisions about job applications.</p>
            
            <div style={styles.features}>
              <div style={styles.feature}>
                <h3>📄 CV Analysis</h3>
                <p>Upload your CV and we'll extract your skills, experience, and strengths</p>
              </div>
              <div style={styles.feature}>
                <h3>🔍 Job Analysis</h3>
                <p>Paste a job posting URL and we'll analyze requirements and expectations</p>
              </div>
              <div style={styles.feature}>
                <h3>✅ Honest Matching</h3>
                <p>Get realistic assessments of your fit with no exaggeration or fabrication</p>
              </div>
              <div style={styles.feature}>
                <h3>💡 Smart Advice</h3>
                <p>Receive actionable recommendations based on your actual qualifications</p>
              </div>
            </div>
            
            <button style={styles.primaryButton} onClick={() => onNavigate('upload')}>
              Upload Your CV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Upload View
// ============================================================================

function UploadView({
  onUploadSuccess,
  onError,
  loading,
  setLoading
}: {
  onUploadSuccess: (profile: Profile) => void;
  onError: (error: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];
    if (!validTypes.includes(file.type)) {
      onError('Please upload a PDF, DOCX, PNG, or JPEG file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      onError('File size must be less than 10MB');
      return;
    }

    setLoading(true);
    onError('');

    try {
      const formData = new FormData();
      formData.append('cv', file);

      const response = await fetch(`${API_BASE_URL}/api/profile/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.status === 'success') {
        onUploadSuccess(data.profile);
      } else {
        onError(data.message || 'Upload failed');
      }
    } catch (err: any) {
      onError(err.message || 'Failed to upload CV');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  return (
    <div style={styles.view}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Upload Your CV</h2>
        <p style={styles.text}>Upload your resume in PDF, DOCX, PNG, or JPEG format (max 10MB)</p>

        <div
          style={{
            ...styles.dropZone,
            ...(dragOver && styles.dropZoneActive)
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {loading ? (
            <div style={styles.loadingText}>
              <div style={styles.spinner}></div>
              <p>Uploading and analyzing your CV...</p>
              <p style={styles.loadingSubtext}>This may take 30-60 seconds</p>
            </div>
          ) : (
            <div>
              <p style={styles.dropZoneText}>📄 Drag & drop your CV here</p>
              <p style={styles.dropZoneSubtext}>or click to browse</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Analyze Job View
// ============================================================================

function AnalyzeView({
  profile,
  onAnalysisComplete,
  onError,
  loading,
  setLoading
}: {
  profile: Profile;
  onAnalysisComplete: (analysis: AnalysisDetail) => void;
  onError: (error: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [jobUrl, setJobUrl] = useState('');
  const [manualText, setManualText] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [useManualInput, setUseManualInput] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (useManualInput) {
      if (!manualText.trim()) {
        onError('Please paste the job description');
        return;
      }
      if (manualText.trim().length < 100) {
        onError('Job description seems too short. Please paste the full job posting.');
        return;
      }
    } else {
      if (!jobUrl.trim()) {
        onError('Please enter a job posting URL');
        return;
      }

      // Basic URL validation
      try {
        new URL(jobUrl);
      } catch {
        onError('Please enter a valid URL');
        return;
      }
    }

    setLoading(true);
    setAnalyzing(true);
    onError('');

    try {
      // Step 1: Analyze job posting
      const requestBody = useManualInput ? {
        manualText: manualText.trim(),
        title: jobTitle.trim() || undefined,
        company: company.trim() || undefined,
        url: 'manual-entry'
      } : {
        url: jobUrl
      };

      const jobResponse = await fetch(`${API_BASE_URL}/api/job/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const jobData = await jobResponse.json();

      if (jobData.status !== 'success') {
        // If URL scraping failed with suggestion to use manual paste, switch to manual mode
        if (jobData.suggestion === 'manual_paste' && !useManualInput) {
          setUseManualInput(true);
          onError(jobData.message + ' Switched to manual input mode - please paste the job description below.');
          return;
        }
        throw new Error(jobData.message || 'Failed to analyze job posting');
      }

      // Step 2: Match profile to job
      const matchResponse = await fetch(`${API_BASE_URL}/api/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobData.job.id })
      });

      const matchData = await matchResponse.json();

      if (matchData.status !== 'success') {
        throw new Error(matchData.message || 'Failed to match profile to job');
      }

      onAnalysisComplete(matchData.analysis);
    } catch (err: any) {
      onError(err.message || 'Failed to analyze job posting');
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  return (
    <div style={styles.view}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Analyze Job Posting</h2>
        <p style={styles.text}>
          {useManualInput 
            ? 'Paste the full job description below (recommended for Workday, Greenhouse, etc.)'
            : 'Paste a job posting URL, or switch to manual input if the URL doesn\'t work'}
        </p>

        {/* Toggle between URL and manual input */}
        <div style={{...styles.formGroup, marginBottom: '20px'}}>
          <button
            type="button"
            onClick={() => setUseManualInput(!useManualInput)}
            style={{
              ...styles.secondaryButton,
              padding: '8px 16px',
              fontSize: '14px'
            }}
            disabled={loading}
          >
            {useManualInput ? '← Switch to URL Input' : 'Switch to Manual Input →'}
          </button>
        </div>

        {!useManualInput ? (
          // URL input mode
          <div style={styles.formGroup}>
            <label style={styles.label}>Job Posting URL</label>
            <input
              type="url"
              style={styles.input}
              placeholder="https://example.com/job-posting"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              disabled={loading}
            />
            <p style={{...styles.loadingSubtext, marginTop: '8px', fontSize: '12px'}}>
              Note: Some job boards (Workday, Greenhouse) don't work with URL scraping. Use manual input for those.
            </p>
          </div>
        ) : (
          // Manual input mode
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>Job Title (optional)</label>
              <input
                type="text"
                style={styles.input}
                placeholder="e.g., Senior Software Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={loading}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Company (optional)</label>
              <input
                type="text"
                style={styles.input}
                placeholder="e.g., NVIDIA, Google, etc."
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={loading}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Job Description (paste full text) *</label>
              <textarea
                style={{
                  ...styles.input,
                  minHeight: '200px',
                  resize: 'vertical',
                  fontFamily: 'monospace',
                  fontSize: '13px'
                }}
                placeholder="Paste the complete job posting here, including requirements, responsibilities, qualifications, etc."
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                disabled={loading}
              />
              <p style={{...styles.loadingSubtext, marginTop: '8px', fontSize: '12px'}}>
                {manualText.length > 0 ? `${manualText.length} characters` : 'Paste at least 100 characters'}
              </p>
            </div>
          </>
        )}

        {analyzing && (
          <div style={styles.analyzing}>
            <div style={styles.spinner}></div>
            <div>
              <p><strong>{useManualInput ? 'Analyzing job description...' : 'Analyzing job posting...'}</strong></p>
              {!useManualInput && <p style={styles.analyzingSubtext}>• Scraping job details</p>}
              <p style={styles.analyzingSubtext}>• Extracting requirements</p>
              <p style={styles.analyzingSubtext}>• Matching to your profile</p>
              <p style={styles.analyzingSubtext}>• Generating recommendations</p>
              <p style={styles.loadingSubtext}>This may take 30-60 seconds</p>
            </div>
          </div>
        )}

        <button
          style={styles.primaryButton}
          onClick={handleAnalyze}
          disabled={loading || (useManualInput ? !manualText.trim() : !jobUrl.trim())}
        >
          {loading ? 'Analyzing...' : 'Analyze Job'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Results View
// ============================================================================

function ResultsView({ analysis }: { analysis: AnalysisDetail }) {
  const matchColor = analysis.matchScore >= 70 ? '#28a745' : analysis.matchScore >= 40 ? '#ffc107' : '#dc3545';

  return (
    <div style={styles.view}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Job Analysis Results</h2>

        <div style={styles.jobHeader}>
          <h3 style={styles.jobTitle}>{analysis.job.title}</h3>
          <p style={styles.jobCompany}>{analysis.job.company}</p>
          {analysis.job.location && <p style={styles.jobLocation}>📍 {analysis.job.location}</p>}
          <a href={analysis.job.url} target="_blank" rel="noopener noreferrer" style={styles.jobLink}>
            View Original Posting →
          </a>
        </div>

        <div style={{ ...styles.matchScore, borderColor: matchColor }}>
          <div style={styles.matchScoreNumber} data-score={analysis.matchScore}>
            {analysis.matchScore}%
          </div>
          <p style={styles.matchScoreLabel}>Match Score</p>
        </div>

        {analysis.job.summary && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Job Summary</h3>
            <p>{analysis.job.summary}</p>
          </div>
        )}

        {analysis.job.keyRequirements && analysis.job.keyRequirements.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Key Requirements</h3>
            <ul style={styles.list}>
              {analysis.job.keyRequirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Gap Analysis</h3>
          
          {analysis.gapAnalysis.matchingSkills.length > 0 && (
            <div style={styles.subsection}>
              <h4 style={styles.subsectionTitle}>✅ Matching Skills</h4>
              <div style={styles.skillTags}>
                {analysis.gapAnalysis.matchingSkills.map((skill, i) => (
                  <span key={i} style={{ ...styles.skillTag, ...styles.skillTagMatch }}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.gapAnalysis.missingSkills.length > 0 && (
            <div style={styles.subsection}>
              <h4 style={styles.subsectionTitle}>⚠️ Missing Skills</h4>
              <div style={styles.skillTags}>
                {analysis.gapAnalysis.missingSkills.map((skill, i) => (
                  <span key={i} style={{ ...styles.skillTag, ...styles.skillTagMissing }}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {analysis.gapAnalysis.experienceGap && (
            <div style={styles.subsection}>
              <h4 style={styles.subsectionTitle}>Experience Assessment</h4>
              <p>{analysis.gapAnalysis.experienceGap}</p>
            </div>
          )}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Recommendations</h3>
          {analysis.recommendations.map((rec, i) => (
            <div key={i} style={styles.recommendation}>
              <span style={styles.recommendationType}>
                {rec.type === 'strength' ? '💪' : rec.type === 'weakness' ? '⚠️' : '💡'}
              </span>
              <div>
                <p style={styles.recommendationText}>{rec.text}</p>
                {rec.honestyScore === 100 && (
                  <span style={styles.honesty}>✓ Honest recommendation</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.advice}>
          <h3 style={styles.sectionTitle}>Application Advice</h3>
          <p>{analysis.applicationAdvice}</p>
        </div>

        <p style={styles.disclaimer}>
          <strong>Note:</strong> All recommendations are based on honest assessment of your qualifications.
          We never suggest exaggerating or fabricating experience.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// History View
// ============================================================================

function HistoryView({
  analyses,
  onSelectAnalysis
}: {
  analyses: Analysis[];
  onSelectAnalysis: (id: string) => void;
}) {
  if (analyses.length === 0) {
    return (
      <div style={styles.view}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Analysis History</h2>
          <p style={styles.text}>No analyses yet. Analyze a job posting to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.view}>
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Analysis History</h2>
        <div style={styles.historyList}>
          {analyses.map((analysis) => (
            <div
              key={analysis.id}
              style={styles.historyItem}
              onClick={() => onSelectAnalysis(analysis.id)}
            >
              <div style={styles.historyItemContent}>
                <h3 style={styles.historyItemTitle}>{analysis.job.title}</h3>
                <p style={styles.historyItemCompany}>{analysis.job.company}</p>
                <p style={styles.historyItemDate}>
                  {new Date(analysis.analyzedAt).toLocaleDateString()}
                </p>
              </div>
              <div style={styles.historyItemScore}>
                <div style={styles.historyItemScoreNumber}>{analysis.matchScore}%</div>
                <div style={styles.historyItemScoreLabel}>Match</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#f5f5f5'
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '2rem',
    textAlign: 'center',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  title: {
    margin: 0,
    fontSize: '2.5rem',
    fontWeight: 'bold'
  },
  subtitle: {
    margin: '0.5rem 0 0 0',
    fontSize: '1.1rem',
    opacity: 0.9
  },
  nav: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    marginTop: '1.5rem',
    flexWrap: 'wrap'
  },
  navButton: {
    padding: '0.5rem 1.5rem',
    border: '2px solid rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
    color: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'all 0.3s'
  },
  navButtonActive: {
    backgroundColor: 'white',
    color: '#667eea',
    borderColor: 'white'
  },
  main: {
    flex: 1,
    padding: '2rem',
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto'
  },
  view: {
    width: '100%'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '2rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
  },
  cardTitle: {
    margin: '0 0 1.5rem 0',
    fontSize: '2rem',
    color: '#333'
  },
  text: {
    color: '#666',
    lineHeight: '1.6'
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '1rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  errorClose: {
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#721c24'
  },
  profileSummary: {
    backgroundColor: '#f8f9fa',
    padding: '1.5rem',
    borderRadius: '8px',
    marginBottom: '1.5rem'
  },
  summaryBox: {
    marginTop: '1rem',
    padding: '1rem',
    backgroundColor: 'white',
    borderRadius: '8px',
    borderLeft: '4px solid #667eea'
  },
  list: {
    marginTop: '0.5rem',
    paddingLeft: '1.5rem'
  },
  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1.5rem',
    margin: '2rem 0'
  },
  feature: {
    padding: '1.5rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    textAlign: 'center'
  },
  actions: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap'
  },
  primaryButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '600',
    transition: 'all 0.3s'
  },
  secondaryButton: {
    padding: '0.75rem 2rem',
    backgroundColor: 'transparent',
    color: '#667eea',
    border: '2px solid #667eea',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '600',
    transition: 'all 0.3s'
  },
  dropZone: {
    border: '2px dashed #ccc',
    borderRadius: '12px',
    padding: '3rem',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s',
    marginTop: '1.5rem'
  },
  dropZoneActive: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff'
  },
  dropZoneText: {
    fontSize: '1.3rem',
    color: '#333',
    margin: '0 0 0.5rem 0'
  },
  dropZoneSubtext: {
    color: '#666',
    margin: 0
  },
  loadingText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
  },
  loadingSubtext: {
    fontSize: '0.9rem',
    color: '#999',
    marginTop: '0.5rem'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  formGroup: {
    marginBottom: '1.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '600',
    color: '#333'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '2px solid #ddd',
    borderRadius: '8px',
    fontSize: '1rem',
    boxSizing: 'border-box'
  },
  analyzing: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    padding: '1.5rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '1.5rem'
  },
  analyzingSubtext: {
    margin: '0.25rem 0',
    color: '#666',
    fontSize: '0.9rem'
  },
  jobHeader: {
    marginBottom: '2rem',
    paddingBottom: '1.5rem',
    borderBottom: '2px solid #eee'
  },
  jobTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.8rem',
    color: '#333'
  },
  jobCompany: {
    fontSize: '1.2rem',
    color: '#667eea',
    margin: '0 0 0.5rem 0'
  },
  jobLocation: {
    color: '#666',
    margin: '0 0 0.5rem 0'
  },
  jobLink: {
    color: '#667eea',
    textDecoration: 'none',
    display: 'inline-block',
    marginTop: '0.5rem'
  },
  matchScore: {
    textAlign: 'center',
    padding: '2rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '12px',
    marginBottom: '2rem',
    border: '3px solid'
  },
  matchScoreNumber: {
    fontSize: '4rem',
    fontWeight: 'bold',
    color: '#333'
  },
  matchScoreLabel: {
    fontSize: '1.2rem',
    color: '#666',
    marginTop: '0.5rem'
  },
  section: {
    marginBottom: '2rem'
  },
  sectionTitle: {
    fontSize: '1.5rem',
    color: '#333',
    marginBottom: '1rem',
    borderBottom: '2px solid #667eea',
    paddingBottom: '0.5rem'
  },
  subsection: {
    marginBottom: '1.5rem'
  },
  subsectionTitle: {
    fontSize: '1.2rem',
    color: '#333',
    marginBottom: '0.75rem'
  },
  skillTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem'
  },
  skillTag: {
    padding: '0.5rem 1rem',
    borderRadius: '20px',
    fontSize: '0.9rem',
    fontWeight: '500'
  },
  skillTagMatch: {
    backgroundColor: '#d4edda',
    color: '#155724'
  },
  skillTagMissing: {
    backgroundColor: '#f8d7da',
    color: '#721c24'
  },
  recommendation: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '1rem'
  },
  recommendationType: {
    fontSize: '1.5rem'
  },
  recommendationText: {
    margin: '0 0 0.5rem 0',
    color: '#333'
  },
  honesty: {
    fontSize: '0.85rem',
    color: '#28a745',
    fontWeight: '600'
  },
  advice: {
    backgroundColor: '#fff3cd',
    padding: '1.5rem',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    borderLeft: '4px solid #ffc107'
  },
  disclaimer: {
    fontSize: '0.9rem',
    color: '#666',
    fontStyle: 'italic',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px'
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  historyItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s'
  },
  historyItemContent: {
    flex: 1
  },
  historyItemTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.3rem',
    color: '#333'
  },
  historyItemCompany: {
    color: '#667eea',
    margin: '0 0 0.25rem 0'
  },
  historyItemDate: {
    fontSize: '0.9rem',
    color: '#999',
    margin: 0
  },
  historyItemScore: {
    textAlign: 'center',
    minWidth: '80px'
  },
  historyItemScoreNumber: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: '#667eea'
  },
  historyItemScoreLabel: {
    fontSize: '0.85rem',
    color: '#666'
  },
  footer: {
    backgroundColor: '#333',
    color: 'white',
    textAlign: 'center',
    padding: '1.5rem',
    marginTop: 'auto'
  }
};

// ============================================================================
// App Initialization
// ============================================================================

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

// Add CSS animation for spinner
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  }
  
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .historyItem:hover {
    backgroundColor: #e9ecef;
    transform: translateX(4px);
  }
`;
document.head.appendChild(styleSheet);
