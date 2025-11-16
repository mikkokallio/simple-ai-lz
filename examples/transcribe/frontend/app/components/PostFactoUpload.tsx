'use client';

import { useState } from 'react';
import { getApiBaseUrl } from '../lib/apiConfig';
import { useLanguage } from '../contexts/LanguageContext';
import { Language } from '../lib/i18n';

interface Props {
  onDocumentCreated: (doc: any) => void;
  onCancel: () => void;
}

// Map UI language to Speech SDK language codes
const languageMap: Record<Language, string> = {
  'fi': 'fi-FI',
  'sv': 'sv-SE',
  'en': 'en-US'
};

export default function PostFactoUpload({ onDocumentCreated, onCancel }: Props) {
  const { language, t } = useLanguage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [enhancedTranscript, setEnhancedTranscript] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [transcriptVersion, setTranscriptVersion] = useState<'original' | 'enhanced' | 'edited'>('original');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/x-wav', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'];
      const validExtensions = ['.wav', '.mp3', '.m4a'];
      const hasValidType = validTypes.includes(file.type);
      const hasValidExt = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      
      if (!hasValidType && !hasValidExt) {
        setError(t('errorUploading') + ': Invalid file format. Use WAV, MP3, or M4A files.');
        return;
      }

      // Validate file size (max 100MB)
      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(t('errorUploading') + ': File too large. Maximum size is 100MB.');
        return;
      }

      setSelectedFile(file);
      setError(null);
    }
  };

  const transcribeFile = async () => {
    if (!selectedFile) return;

    setIsTranscribing(true);
    setError(null);

    try {
      console.log('[Upload] Starting transcription for file:', selectedFile.name);
      const startTime = performance.now();

      // Read file as base64
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      // Call backend batch transcription API
      const apiBase = getApiBaseUrl();
      const speechLanguage = languageMap[language];

      console.log('[Upload] Calling batch transcription API');
      const response = await fetch(`${apiBase}/api/transcribeAudioFile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileData,
          language: speechLanguage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transcription failed');
      }

      const result = await response.json();
      console.log('[Upload] Response result:', result);
      console.log('[Upload] Transcript length:', result.transcript?.length || 0);
      
      if (!result.transcript || result.transcript.trim() === '') {
        throw new Error('Empty transcript received from server');
      }
      
      setTranscript(result.transcript);

      const duration = Math.round(performance.now() - startTime);
      console.log('[Upload] Transcription completed in', duration, 'ms, showing editing view');

    } catch (err: any) {
      setError(`${t('errorUploading')}: ${err.message}`);
      console.error('[Upload] Exception:', err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const enhanceTranscript = async () => {
    if (!transcript.trim()) {
      setError(t('noTranscript'));
      return;
    }

    setIsEnhancing(true);
    setError(null);

    try {
      const apiBase = getApiBaseUrl();
      const speechLanguage = languageMap[language];

      const response = await fetch(`${apiBase}/api/enhanceTranscript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: transcript.trim(),
          language: speechLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setEnhancedTranscript(result.enhancedTranscript);
      setEditedTranscript(result.enhancedTranscript); // Update the edited transcript
      setTranscriptVersion('edited');
    } catch (err: any) {
      setError(`${t('errorEnhancing')}: ${err.message}`);
      console.error(err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const getActiveTranscript = () => {
    if (editedTranscript) {
      return editedTranscript;
    }
    switch (transcriptVersion) {
      case 'enhanced':
        return enhancedTranscript;
      case 'edited':
        return editedTranscript;
      default:
        return transcript;
    }
  };

  const processTranscript = async () => {
    const activeTranscript = editedTranscript || transcript; // Use edited version if available
    if (!activeTranscript.trim()) {
      setError(t('noTranscript'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const apiBase = getApiBaseUrl();
      
      const response = await fetch(`${apiBase}/api/processTranscript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: activeTranscript.trim(),
          language: languageMap[language],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      onDocumentCreated(result);
    } catch (err: any) {
      setError(`${t('errorProcessing')}: ${err.message}`);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* File Selection Card */}
      {!transcript && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{t('uploadAudio')}</h2>
              <p className="text-gray-600 mt-1">{t('uploadDescription')}</p>
            </div>
            <button onClick={onCancel} className="btn-secondary">
              {t('cancel')}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {/* File Drop Zone */}
          <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center bg-green-50 hover:bg-green-100 transition-colors">
            <div className="flex flex-col items-center">
              <svg className="w-16 h-16 text-green-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              
              <label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-lg font-medium text-green-700 hover:text-green-800">
                  {t('selectFile')}
                </span>
                <input
                  id="file-upload"
                  type="file"
                  accept=".wav,.mp3,.m4a,audio/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
              
              <p className="text-sm text-gray-600 mt-2">
                WAV, MP3, M4A • Max 100MB
              </p>
            </div>
          </div>

          {/* Selected File Info */}
          {selectedFile && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="w-10 h-10 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  <div>
                    <p className="font-medium text-gray-800">{selectedFile.name}</p>
                    <p className="text-sm text-gray-600">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={transcribeFile}
                  disabled={isTranscribing}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isTranscribing ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('transcribing')}
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      {t('uploadAndProcess')}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-900">{t('uploadTip')}</p>
                <p className="text-sm text-blue-800 mt-1">
                  {t('uploadTipDescription')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Editing Card */}
      {transcript && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">{t('transcriptReady')}</h2>
            <button onClick={onCancel} className="btn-secondary">
              {t('cancel')}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-4">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            </div>
          )}

          {/* Transcript Editing Area */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {t('transcript')}
            </label>
            <textarea
              value={editedTranscript || transcript}
              onChange={(e) => {
                setEditedTranscript(e.target.value);
                setTranscriptVersion('edited');
              }}
              className="w-full min-h-[300px] p-4 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-800 leading-relaxed"
              placeholder={t('transcriptPlaceholder')}
            />
            <p className="text-xs text-gray-500 mt-1">{t('editDirectly')}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={enhanceTranscript}
              disabled={isEnhancing || isProcessing}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors"
            >
              {isEnhancing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('enhancing')}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {t('aiSmartEdit')}
                </>
              )}
            </button>
            <button
              onClick={processTranscript}
              disabled={isProcessing || isEnhancing}
              className="btn-success disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('processing')}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {t('createDocument')}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
