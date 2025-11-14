'use client';

import { useState } from 'react';

interface Props {
  document: any;
  onReset: () => void;
}

export default function DocumentViewer({ document, onReset }: Props) {
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { documentReference, rawTranscript } = document;

  const finalizeDocument = async () => {
    setIsFinalizing(true);
    setError(null);

    try {
      const functionAppUrl = process.env.NEXT_PUBLIC_FUNCTION_APP_URL;
      
      const response = await fetch(`${functionAppUrl}/api/finalizeDocument`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: documentReference.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();
      setIsFinalized(true);
    } catch (err: any) {
      setError(`Virhe viimeisteltäessä dokumenttia: ${err.message}`);
      console.error(err);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="card mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Dokumentti luotu</h2>
            <p className="text-gray-600 mt-1">
              {isFinalized ? (
                <span className="text-green-600 font-medium">✓ Viimeistelty</span>
              ) : (
                <span className="text-yellow-600 font-medium">● Luonnos</span>
              )}
            </p>
          </div>
          <button onClick={onReset} className="btn-secondary">
            Takaisin alkuun
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Side-by-side view */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Raw Transcript */}
        <div className="card">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Alkuperäinen transkriptio
          </h3>
          <div className="transcript-box">
            <p className="text-gray-800 whitespace-pre-wrap">{rawTranscript}</p>
          </div>
        </div>

        {/* Structured Note */}
        <div className="card">
          <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
            <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Strukturoitu kliininen muistiinpano
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700">Potilas:</label>
              <p className="text-gray-800">{documentReference.subject.display}</p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">Käynti:</label>
              <p className="text-gray-800">{documentReference.context.encounter.display}</p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">Yksikkö:</label>
              <p className="text-gray-800">{documentReference.custodian.display}</p>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Yhteenveto:</label>
              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <p className="text-gray-800">{documentReference.summary}</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Kliiniset löydökset:</label>
              <div className="space-y-2">
                {documentReference.clinical_findings && documentReference.clinical_findings.length > 0 ? (
                  documentReference.clinical_findings.map((finding: any, index: number) => (
                    <div key={index} className="bg-gray-50 border border-gray-200 rounded p-3">
                      {finding.code && (
                        <span className="text-xs font-mono text-blue-600 bg-blue-100 px-2 py-1 rounded mr-2">
                          {finding.code}
                        </span>
                      )}
                      <span className="text-gray-800">{finding.detail}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic">Ei erityisiä löydöksiä kirjattu</p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <div className="text-xs text-gray-500 space-y-1">
                <p>Dokumentti ID: {documentReference.id}</p>
                <p>Luotu: {new Date(documentReference.createdAt).toLocaleString('fi-FI')}</p>
                <p>Päivitetty: {new Date(documentReference.updatedAt).toLocaleString('fi-FI')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      {!isFinalized && (
        <div className="card bg-yellow-50 border border-yellow-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-800 mb-2">Tarkista ja viimeistele</h3>
              <p className="text-gray-700 mb-4">
                Tarkista dokumentin sisältö huolellisesti. Kun olet valmis, 
                viimeistele dokumentti merkitsemällä se lopulliseksi. 
                Tämä tallentaa dokumentin lopullisena versiona tietokantaan.
              </p>
            </div>
          </div>
          <button
            onClick={finalizeDocument}
            disabled={isFinalizing}
            className="btn-success disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFinalizing ? 'Viimeistellään...' : '✓ Hyväksy ja viimeistele'}
          </button>
        </div>
      )}

      {isFinalized && (
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center">
            <svg className="w-8 h-8 text-green-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-green-800">Dokumentti viimeistelty!</h3>
              <p className="text-green-700">
                Dokumentti on tallennettu lopullisena versiona ja valmis arkistointiin.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
