'use client';

import { useState, useRef } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
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

export default function RealTimeDictation({ onDocumentCreated, onCancel }: Props) {
  const { language, t } = useLanguage();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [enhancedTranscript, setEnhancedTranscript] = useState('');
  const [editedTranscript, setEditedTranscript] = useState('');
  const [transcriptVersion, setTranscriptVersion] = useState<'original' | 'enhanced' | 'edited'>('original');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const lastOffsetRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      setError(null);
      setIsInitializing(true); // Show loading state
      console.log('[Recording] Starting recording...');
      const startTime = performance.now();
      
      // Get Speech token from backend
      const apiBase = getApiBaseUrl();
      console.log('[Recording] Fetching speech token from:', `${apiBase}/api/getSpeechToken`);
      
      const tokenResponse = await fetch(`${apiBase}/api/getSpeechToken`);
      if (!tokenResponse.ok) {
        throw new Error('Failed to get speech token');
      }
      const { token, region } = await tokenResponse.json();
      console.log('[Recording] Token received, region:', region, 'time:', Math.round(performance.now() - startTime), 'ms');
      
      // Use fromAuthorizationToken for token-based authentication (not fromSubscription)
      const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
      const speechLanguage = languageMap[language];
      speechConfig.speechRecognitionLanguage = speechLanguage;
      console.log('[Recording] Using speech recognition language:', speechLanguage);

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      recognizerRef.current = recognizer;
      lastOffsetRef.current = 0; // Reset offset tracking

      recognizer.recognizing = (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
          console.log('[Recording] Recognizing (interim):', e.result.text);
          setInterimTranscript(e.result.text);
        }
      };

      recognizer.recognized = (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          const currentOffset = e.offset;
          
          // Only process if this is a new recognition (offset has advanced)
          if (currentOffset > lastOffsetRef.current) {
            console.log('[Recording] Recognized (final):', e.result.text, 'offset:', currentOffset);
            lastOffsetRef.current = currentOffset;
            
            setTranscript(prev => {
              const newText = prev ? prev + ' ' + e.result.text : e.result.text;
              return newText;
            });
            setInterimTranscript('');
          } else {
            console.log('[Recording] Skipping duplicate recognition at offset:', currentOffset);
          }
        }
      };

      recognizer.startContinuousRecognitionAsync(
        () => {
          console.log('[Recording] Recognition started successfully, time:', Math.round(performance.now() - startTime), 'ms');
          setIsRecording(true);
          setIsInitializing(false);
        },
        (err) => {
          setError(`${t('errorStartingRecording')}: ${err}`);
          console.error('[Recording] Error starting recognition:', err);
          setIsInitializing(false);
        }
      );
    } catch (err: any) {
      setError(`${t('error')}: ${err.message}`);
      console.error('[Recording] Exception:', err);
      setIsInitializing(false);
    }
  };

  const stopRecording = () => {
    if (recognizerRef.current) {
      recognizerRef.current.stopContinuousRecognitionAsync(
        () => {
          setIsRecording(false);
          setInterimTranscript('');
        },
        (err) => {
          setError(`${t('errorStopping')}: ${err}`);
          console.error(err);
        }
      );
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
      {/* Recording Card - Before/During Recording */}
      {(!transcript || isRecording) && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{t('realtimeDictation')}</h2>
              <p className="text-gray-600 mt-1">{t('realtimeModeDescription')}</p>
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

          {/* Microphone Action Zone */}
          <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isRecording 
              ? 'border-red-400 bg-red-50' 
              : 'border-blue-300 bg-blue-50 hover:bg-blue-100'
          }`}>
            <div className="flex flex-col items-center">
              {/* Microphone Icon with Animation */}
              <div className={`relative mb-4 ${isRecording ? 'animate-pulse' : ''}`}>
                <svg className={`w-20 h-20 ${isRecording ? 'text-red-600' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                {isRecording && (
                  <span className="absolute -top-2 -right-2 flex h-6 w-6">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500"></span>
                  </span>
                )}
              </div>

              {/* Action Button */}
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  disabled={isProcessing || isInitializing}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center text-lg px-8 py-4"
                >
                  {isInitializing ? (
                    <>
                      <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('preparing')}
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                      </svg>
                      {t('startRecording')}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-8 rounded-lg flex items-center text-lg shadow-lg transition-colors"
                >
                  <svg className="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  {t('stopRecording')}
                </button>
              )}

              {isRecording && (
                <div className="mt-4 flex items-center text-red-700 font-medium">
                  <span className="animate-pulse mr-2 text-2xl">●</span>
                  <span className="text-lg">{t('recording')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Transcript During Recording */}
          {isRecording && (
            <div className="mt-6">
              <div className="bg-white border-2 border-gray-200 rounded-lg p-6 min-h-[200px] shadow-inner">
                <div className="flex items-center mb-3">
                  <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-gray-700">{t('transcript')}</h3>
                </div>
                <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {transcript}
                  {interimTranscript && (
                    <span className="text-gray-400 italic"> {interimTranscript}</span>
                  )}
                  {!transcript && !interimTranscript && (
                    <p className="text-gray-400 italic">{t('transcriptPlaceholder')}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Info Tip */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-blue-800">{t('recordingTip')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Editing Card - After Recording */}
      {transcript && !isRecording && (
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
