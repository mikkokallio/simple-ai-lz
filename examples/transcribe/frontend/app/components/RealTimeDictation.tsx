'use client';

import { useState, useRef } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';

interface Props {
  onDocumentCreated: (doc: any) => void;
  onCancel: () => void;
}

export default function RealTimeDictation({ onDocumentCreated, onCancel }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);

  const startRecording = async () => {
    try {
      setError(null);
      
      // Get Speech token from backend
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071';
      const tokenResponse = await fetch(`${apiBase}/api/getSpeechToken`);
      if (!tokenResponse.ok) {
        throw new Error('Failed to get speech token');
      }
      const { token, region } = await tokenResponse.json();
      
      const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(token, region);
      speechConfig.speechRecognitionLanguage = 'fi-FI';

      const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
      const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

      recognizerRef.current = recognizer;

      recognizer.recognizing = (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
          setInterimTranscript(e.result.text);
        }
      };

      recognizer.recognized = (s, e) => {
        if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
          setTranscript(prev => prev + ' ' + e.result.text);
          setInterimTranscript('');
        }
      };

      recognizer.startContinuousRecognitionAsync(
        () => {
          setIsRecording(true);
        },
        (err) => {
          setError(`Virhe aloitettaessa nauhoitusta: ${err}`);
          console.error(err);
        }
      );
    } catch (err: any) {
      setError(`Virhe: ${err.message}`);
      console.error(err);
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
          setError(`Virhe pysäytettäessä: ${err}`);
          console.error(err);
        }
      );
    }
  };

  const processTranscript = async () => {
    if (!transcript.trim()) {
      setError('Ei transkriptiota käsiteltäväksi');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const functionAppUrl = process.env.NEXT_PUBLIC_FUNCTION_APP_URL;
      
      const response = await fetch(`${functionAppUrl}/api/processTranscript`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: transcript.trim(),
          language: 'fi-FI',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      onDocumentCreated(result);
    } catch (err: any) {
      setError(`Virhe käsiteltäessä transkriptiota: ${err.message}`);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Reaaliaikainen sanelu</h2>
          <button onClick={onCancel} className="btn-secondary">
            Peruuta
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Recording Controls */}
        <div className="mb-6">
          <div className="flex gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                disabled={isProcessing}
                className="btn-primary flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
                Aloita nauhoitus
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                Pysäytä nauhoitus
              </button>
            )}

            {transcript && !isRecording && (
              <button
                onClick={processTranscript}
                disabled={isProcessing}
                className="btn-success"
              >
                {isProcessing ? 'Käsitellään...' : 'Luo dokumentti'}
              </button>
            )}
          </div>

          {isRecording && (
            <div className="mt-4 flex items-center text-red-600">
              <span className="animate-pulse mr-2">●</span>
              <span className="font-medium">Nauhoitetaan...</span>
            </div>
          )}
        </div>

        {/* Transcript Display */}
        <div className="transcript-box">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Transkriptio</h3>
          <div className="text-gray-800 whitespace-pre-wrap">
            {transcript}
            {interimTranscript && (
              <span className="text-gray-400 italic"> {interimTranscript}</span>
            )}
            {!transcript && !interimTranscript && (
              <p className="text-gray-400 italic">Transkriptio ilmestyy tähän...</p>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <p>💡 Vinkki: Puhu selkeästi ja odota kunnes pysäytät nauhoituksen ennen dokumentin luomista.</p>
        </div>
      </div>
    </div>
  );
}
