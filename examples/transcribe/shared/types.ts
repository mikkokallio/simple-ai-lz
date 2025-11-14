/**
 * Simplified FHIR DocumentReference structure for Finnish healthcare
 * Based on FHIR R4 DocumentReference but simplified for demo purposes
 */

export interface DocumentReference {
  resourceType: 'DocumentReference';
  id: string;
  status: 'draft' | 'final';
  type: {
    coding: Array<{
      system: string;
      code: string;
      display: string;
    }>;
  };
  subject: {
    display: string; // Patient name/ID placeholder
  };
  context: {
    encounter: {
      display: string; // Clinical encounter date/time
    };
  };
  custodian: {
    display: string; // Hospital/Clinic name placeholder
  };
  summary: string; // LLM generated clinical summary
  clinical_findings: Array<{
    code: string; // ICD-10 or other code
    detail: string; // Finding description
  }>;
  audioFileUrl?: string; // Reference to original audio in blob storage
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionRequest {
  transcript: string;
  language: string;
  timestamp: string;
}

export interface BatchTranscriptionRequest {
  blobUrl: string;
  blobName: string;
  language: string;
}

export interface TriageResponse {
  documentReference: DocumentReference;
  rawTranscript: string;
}
