'use client';

import { useState } from 'react';
import RealTimeDictation from './components/RealTimeDictation';
import PostFactoUpload from './components/PostFactoUpload';
import DocumentViewer from './components/DocumentViewer';
import LanguageSelector from './components/LanguageSelector';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';

type Mode = 'realtime' | 'upload' | null;

function HomeContent() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>(null);
  const [currentDocument, setCurrentDocument] = useState<any>(null);

  const handleDocumentCreated = (doc: any) => {
    setCurrentDocument(doc);
  };

  const handleReset = () => {
    setMode(null);
    setCurrentDocument(null);
  };

  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white p-6 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('appTitle')}</h1>
            <p className="mt-2 text-blue-100">{t('appSubtitle')}</p>
          </div>
          <LanguageSelector />
        </div>
      </header>

      <div className="container mx-auto p-6">
        {!mode && !currentDocument && (
          <div className="max-w-4xl mx-auto">
            <div className="card mb-8">
              <h2 className="text-2xl font-bold mb-4 text-gray-800">{t('selectMode')}</h2>
              <p className="text-gray-600 mb-6">
                {t('selectModeDescription')}
              </p>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Real-time Mode */}
                <button
                  onClick={() => setMode('realtime')}
                  className="p-6 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="flex items-center mb-3">
                    <svg className="w-8 h-8 text-blue-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <h3 className="text-xl font-bold text-gray-800">{t('realtimeMode')}</h3>
                  </div>
                  <p className="text-gray-600">
                    {t('realtimeModeDescription')}
                  </p>
                </button>

                {/* Upload Mode */}
                <button
                  onClick={() => setMode('upload')}
                  className="p-6 border-2 border-green-600 rounded-lg hover:bg-green-50 transition-colors text-left"
                >
                  <div className="flex items-center mb-3">
                    <svg className="w-8 h-8 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <h3 className="text-xl font-bold text-gray-800">{t('uploadMode')}</h3>
                  </div>
                  <p className="text-gray-600">
                    {t('uploadModeDescription')}
                  </p>
                </button>
              </div>
            </div>

            {/* Info Section */}
            <div className="card bg-blue-50 border border-blue-200">
              <h3 className="text-lg font-bold text-blue-900 mb-2">{t('securityTitle')}</h3>
              <p className="text-blue-800 text-sm">
                {t('securityDescription')}
              </p>
            </div>
          </div>
        )}

        {mode === 'realtime' && !currentDocument && (
          <RealTimeDictation 
            onDocumentCreated={handleDocumentCreated}
            onCancel={handleReset}
          />
        )}

        {mode === 'upload' && !currentDocument && (
          <PostFactoUpload 
            onDocumentCreated={handleDocumentCreated}
            onCancel={handleReset}
          />
        )}

        {currentDocument && (
          <DocumentViewer 
            document={currentDocument}
            onReset={handleReset}
          />
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <LanguageProvider>
      <HomeContent />
    </LanguageProvider>
  );
}
