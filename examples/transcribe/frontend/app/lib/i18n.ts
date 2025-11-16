export const translations = {
  fi: {
    // Header
    appTitle: "Terveydenhuollon Transkriptio",
    appSubtitle: "AI-avusteinen kliininen dokumentointi",
    
    // Mode selection
    selectMode: "Valitse toimintatila",
    selectModeDescription: "Aloita joko reaaliaikainen sanelu tai lataa aikaisempi nauhoite.",
    realtimeMode: "Reaaliaikainen sanelu",
    realtimeModeDescription: "Käytä mikrofonia ja sanele käynti reaaliaikaisesti. Transkriptio tapahtuu välittömästi.",
    uploadMode: "Lataa nauhoite",
    uploadModeDescription: "Lataa aikaisempi äänitallennus ja anna AI:n luoda strukturoidun muistiinpanon.",
    
    // Security info
    securityTitle: "Tietoturvasta",
    securityDescription: "Kaikki data käsitellään turvallisesti Azuren palveluissa. Käyttäjätunnistus Entra ID:llä, datasiirto salattu, ja tallennus GDPR-yhteensopiva.",
    
    // Real-time dictation
    realtimeDictation: "Reaaliaikainen sanelu",
    cancel: "Peruuta",
    startRecording: "Aloita nauhoitus",
    stopRecording: "Pysäytä nauhoitus",
    recording: "Nauhoitetaan...",
    preparing: "Valmistellaan...",
    createDocument: "Luo dokumentti",
    processing: "Käsitellään...",
    transcript: "Transkriptio",
    transcriptPlaceholder: "Transkriptio ilmestyy tähän...",
    recordingTip: "💡 Vinkki: Puhu selkeästi ja odota kunnes pysäytät nauhoituksen ennen dokumentin luomista.",
    
    // Transcript enhancement
    enhanceTranscript: "Paranna transkriptiota",
    enhancing: "Parannetaan...",
    useOriginal: "Käytä alkuperäistä",
    useEnhanced: "Käytä parannettua",
    manualEdit: "Muokkaa manuaalisesti",
    originalTranscript: "Alkuperäinen transkriptio",
    enhancedTranscript: "Parannettu transkriptio",
    editedTranscript: "Muokattu transkriptio",
    aiSmartEdit: "AI-älykäs muokkaus",
    editDirectly: "Voit muokata tekstiä suoraan tai käyttää AI-älykästä muokkausta poistamaan täytesanat ja toistot.",
    
    // Document viewer
    documentCreated: "Dokumentti luotu",
    draft: "Luonnos",
    finalized: "Viimeistelty",
    backToStart: "Takaisin alkuun",
    rawTranscript: "Alkuperäinen transkriptio",
    structuredNote: "Strukturoitu muistiinpano",
    summary: "Yhteenveto",
    clinicalFindings: "Kliiniset löydökset",
    patient: "Potilas",
    encounter: "Käynti",
    custodian: "Hoitoyksikkö",
    finalize: "Viimeistelee",
    finalizing: "Viimeistellään...",
    finalizeTip: "💡 Vinkki: Viimeistele dokumentti kun olet tarkistanut tiedot. Viimeistelty dokumentti tallennetaan pysyvästi.",
    
    // File upload
    uploadAudio: "Lataa äänitallennus",
    uploadDescription: "Valitse aikaisemmin tehty äänitiedosto (.wav, .mp3, .m4a)",
    selectFile: "Valitse tiedosto",
    uploadAndProcess: "Lataa ja käsittele",
    uploading: "Ladataan...",
    transcribing: "Transkribioidaan...",
    uploadTip: "Tuetut tiedostomuodot",
    uploadTipDescription: "Järjestelmä tukee WAV, MP3 ja M4A tiedostomuotoja. Suurin sallittu tiedostokoko on 100 MB.",
    transcriptReady: "Transkriptio valmis",
    
    // Errors
    error: "Virhe",
    errorStartingRecording: "Virhe aloitettaessa nauhoitusta",
    errorStopping: "Virhe pysäytettäessä",
    errorProcessing: "Virhe käsiteltäessä transkriptiota",
    errorEnhancing: "Virhe parannettaessa transkriptiota",
    errorFinalizing: "Virhe viimeisteltäessä dokumenttia",
    errorUploading: "Virhe ladattaessa tiedostoa",
    noTranscript: "Ei transkriptiota käsiteltäväksi",
    
    // Language names
    finnish: "Suomi",
    swedish: "Svenska",
    english: "English"
  },
  sv: {
    // Header
    appTitle: "Hälsovård Transkription",
    appSubtitle: "AI-assisterad klinisk dokumentation",
    
    // Mode selection
    selectMode: "Välj funktionsläge",
    selectModeDescription: "Börja antingen realtidsdikte eller ladda upp en tidigare inspelning.",
    realtimeMode: "Realtidsdikte",
    realtimeModeDescription: "Använd mikrofonen och diktera besöket i realtid. Transkription sker omedelbart.",
    uploadMode: "Ladda upp inspelning",
    uploadModeDescription: "Ladda upp en tidigare ljudinspelning och låt AI skapa en strukturerad anteckning.",
    
    // Security info
    securityTitle: "Om datasäkerhet",
    securityDescription: "All data hanteras säkert i Azure-tjänster. Användarautentisering med Entra ID, dataöverföring krypterad och lagring GDPR-kompatibel.",
    
    // Real-time dictation
    realtimeDictation: "Realtidsdikte",
    cancel: "Avbryt",
    startRecording: "Starta inspelning",
    stopRecording: "Stoppa inspelning",
    recording: "Spelar in...",
    preparing: "Förbereder...",
    createDocument: "Skapa dokument",
    processing: "Behandlar...",
    transcript: "Transkription",
    transcriptPlaceholder: "Transkriptionen visas här...",
    recordingTip: "💡 Tips: Tala tydligt och vänta tills du stoppar inspelningen innan du skapar dokumentet.",
    
    // Transcript enhancement
    enhanceTranscript: "Förbättra transkription",
    enhancing: "Förbättrar...",
    useOriginal: "Använd original",
    useEnhanced: "Använd förbättrad",
    manualEdit: "Redigera manuellt",
    originalTranscript: "Original transkription",
    enhancedTranscript: "Förbättrad transkription",
    editedTranscript: "Redigerad transkription",
    aiSmartEdit: "AI-smart redigering",
    editDirectly: "Du kan redigera texten direkt eller använda AI-smart redigering för att ta bort fyllnadsord och upprepningar.",
    
    // Document viewer
    documentCreated: "Dokument skapat",
    draft: "Utkast",
    finalized: "Slutförd",
    backToStart: "Tillbaka till start",
    rawTranscript: "Original transkription",
    structuredNote: "Strukturerad anteckning",
    summary: "Sammanfattning",
    clinicalFindings: "Kliniska fynd",
    patient: "Patient",
    encounter: "Besök",
    custodian: "Vårdenhet",
    finalize: "Slutför",
    finalizing: "Slutför...",
    finalizeTip: "💡 Tips: Slutför dokumentet när du har granskat informationen. Slutförda dokument sparas permanent.",
    
    // File upload
    uploadAudio: "Ladda upp ljudinspelning",
    uploadDescription: "Välj en tidigare gjord ljudfil (.wav, .mp3, .m4a)",
    selectFile: "Välj fil",
    uploadAndProcess: "Ladda upp och behandla",
    uploading: "Laddar upp...",
    transcribing: "Transkriberar...",
    uploadTip: "Stödda filformat",
    uploadTipDescription: "Systemet stöder WAV, MP3 och M4A filformat. Maximal tillåten filstorlek är 100 MB.",
    transcriptReady: "Transkription klar",
    
    // Errors
    error: "Fel",
    errorStartingRecording: "Fel vid start av inspelning",
    errorStopping: "Fel vid stopp",
    errorProcessing: "Fel vid behandling av transkription",
    errorEnhancing: "Fel vid förbättring av transkription",
    errorFinalizing: "Fel vid slutförande av dokument",
    errorUploading: "Fel vid uppladdning av fil",
    noTranscript: "Ingen transkription att behandla",
    
    // Language names
    finnish: "Suomi",
    swedish: "Svenska",
    english: "English"
  },
  en: {
    // Header
    appTitle: "Healthcare Transcription",
    appSubtitle: "AI-assisted clinical documentation",
    
    // Mode selection
    selectMode: "Select mode",
    selectModeDescription: "Start either real-time dictation or upload a previous recording.",
    realtimeMode: "Real-time dictation",
    realtimeModeDescription: "Use the microphone and dictate the visit in real-time. Transcription happens immediately.",
    uploadMode: "Upload recording",
    uploadModeDescription: "Upload a previous audio recording and let AI create a structured note.",
    
    // Security info
    securityTitle: "About security",
    securityDescription: "All data is processed securely in Azure services. User authentication with Entra ID, encrypted data transfer, and GDPR-compliant storage.",
    
    // Real-time dictation
    realtimeDictation: "Real-time dictation",
    cancel: "Cancel",
    startRecording: "Start recording",
    stopRecording: "Stop recording",
    recording: "Recording...",
    preparing: "Preparing...",
    createDocument: "Create document",
    processing: "Processing...",
    transcript: "Transcript",
    transcriptPlaceholder: "Transcript will appear here...",
    recordingTip: "💡 Tip: Speak clearly and wait until you stop recording before creating the document.",
    
    // Transcript enhancement
    enhanceTranscript: "Enhance transcript",
    enhancing: "Enhancing...",
    useOriginal: "Use original",
    useEnhanced: "Use enhanced",
    manualEdit: "Edit manually",
    originalTranscript: "Original transcript",
    enhancedTranscript: "Enhanced transcript",
    editedTranscript: "Edited transcript",
    aiSmartEdit: "AI Smart Edit",
    editDirectly: "You can edit the text directly or use AI Smart Edit to remove filler words and repetitions.",
    
    // Document viewer
    documentCreated: "Document created",
    draft: "Draft",
    finalized: "Finalized",
    backToStart: "Back to start",
    rawTranscript: "Raw transcript",
    structuredNote: "Structured note",
    summary: "Summary",
    clinicalFindings: "Clinical findings",
    patient: "Patient",
    encounter: "Encounter",
    custodian: "Care unit",
    finalize: "Finalize",
    finalizing: "Finalizing...",
    finalizeTip: "💡 Tip: Finalize the document when you have reviewed the information. Finalized documents are saved permanently.",
    
    // File upload
    uploadAudio: "Upload audio recording",
    uploadDescription: "Select a previously made audio file (.wav, .mp3, .m4a)",
    selectFile: "Select file",
    uploadAndProcess: "Upload and process",
    uploading: "Uploading...",
    transcribing: "Transcribing...",
    uploadTip: "Supported file formats",
    uploadTipDescription: "The system supports WAV, MP3 and M4A file formats. Maximum allowed file size is 100 MB.",
    transcriptReady: "Transcript ready",
    
    // Errors
    error: "Error",
    errorStartingRecording: "Error starting recording",
    errorStopping: "Error stopping",
    errorProcessing: "Error processing transcript",
    errorEnhancing: "Error enhancing transcript",
    errorFinalizing: "Error finalizing document",
    errorUploading: "Error uploading file",
    noTranscript: "No transcript to process",
    
    // Language names
    finnish: "Suomi",
    swedish: "Svenska",
    english: "English"
  }
};

export type Language = 'fi' | 'sv' | 'en';
export type TranslationKey = keyof typeof translations.fi;
