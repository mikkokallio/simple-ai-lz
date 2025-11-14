'use client';

import { useState } from 'react';

interface Props {
  onDocumentCreated: (doc: any) => void;
  onCancel: () => void;
}

export default function PostFactoUpload({ onDocumentCreated, onCancel }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/x-wav'];
      if (!validTypes.includes(file.type) && !file.name.endsWith('.wav') && !file.name.endsWith('.mp3')) {
        setError('Virheellinen tiedostomuoto. Käytä WAV tai MP3 tiedostoa.');
        return;
      }

      // Validate file size (max 100MB)
      const maxSize = 100 * 1024 * 1024;
      if (file.size > maxSize) {
        setError('Tiedosto on liian suuri. Maksimikoko on 100MB.');
        return;
      }

      setSelectedFile(file);
      setError(null);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const storageAccountName = process.env.NEXT_PUBLIC_STORAGE_ACCOUNT || 'stailzezle7syi';
      const containerName = 'audio-uploads';
      
      // In production, get SAS token from backend
      // For MVP, we'll use a simplified approach
      
      // For now, simulate upload and show message
      setError('Tiedoston lataus toteutetaan seuraavassa vaiheessa. MVP-versiossa käytä reaaliaikaista sanelua.');
      
      // TODO: Implement actual blob upload with SAS token from backend
      // 1. Get SAS token from backend
      // 2. Upload to blob storage
      // 3. Wait for Event Grid trigger to process
      // 4. Poll for document creation
      
    } catch (err: any) {
      setError(`Virhe ladattaessa tiedostoa: ${err.message}`);
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Lataa nauhoite</h2>
          <button onClick={onCancel} className="btn-secondary">
            Peruuta
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Valitse äänitiedosto
          </label>
          
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
            <input
              type="file"
              accept=".wav,.mp3,audio/*"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-blue-600 font-medium">Klikkaa valitaksesi tiedosto</span>
              <span className="text-gray-500 text-sm mt-1">tai vedä ja pudota tähän</span>
              <span className="text-gray-400 text-xs mt-2">WAV tai MP3, max 100MB</span>
            </label>
          </div>

          {selectedFile && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg className="w-6 h-6 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-5L9 4H4zm7 5a1 1 0 10-2 0v1H8a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{selectedFile.name}</p>
                    <p className="text-xs text-gray-600">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-red-600 hover:text-red-800"
                  disabled={isUploading}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {isUploading && (
          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">Ladataan... {uploadProgress}%</p>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={uploadFile}
            disabled={!selectedFile || isUploading}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Ladataan...' : 'Lataa ja käsittele'}
          </button>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            <strong>Huom:</strong> Tiedoston lataus ja erätranskribointi on MVP-vaiheessa rajoitettu. 
            Käytä reaaliaikaista sanelua täyden toiminnallisuuden testaamiseen.
          </p>
        </div>
      </div>
    </div>
  );
}
