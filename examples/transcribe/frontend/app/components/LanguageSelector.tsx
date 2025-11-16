'use client';

import { useLanguage } from '../contexts/LanguageContext';
import { Language } from '../lib/i18n';

export default function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  const languages: { code: Language; name: string }[] = [
    { code: 'fi', name: t('finnish') },
    { code: 'sv', name: t('swedish') },
    { code: 'en', name: t('english') }
  ];

  return (
    <div className="flex gap-2 items-center">
      <span className="text-sm text-gray-600 mr-2">🌐</span>
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
            language === lang.code
              ? 'bg-blue-700 text-white border-2 border-white shadow-md'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {lang.name}
        </button>
      ))}
    </div>
  );
}
