import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, apiKey, setApiKey }) => {
  const [inputVal, setInputVal] = useState(apiKey);
  const [isVisible, setIsVisible] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setInputVal(apiKey);
    setErrorMsg('');
  }, [apiKey, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    const key = inputVal.trim();
    if (!key) {
        setErrorMsg("Please enter an API key");
        return;
    }

    // Removed manual format checks per user request. 
    // Validation relies solely on the actual API call below.

    setIsValidating(true);
    setErrorMsg('');

    try {
        const ai = new GoogleGenAI({ apiKey: key });
        
        // Use STABLE model for connection test (Ping)
        const nonce = Date.now().toString();
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: { parts: [{ text: `Return the word "pong" - ${nonce}` }] },
        });
        
        if (!response || !response.candidates || response.candidates.length === 0) {
            throw new Error("Empty response from API");
        }
        
        // Trigger getter to ensure parsing works
        const responseText = response.text;
        
        setApiKey(key);
        localStorage.setItem('raw_studio_api_key', key);
        onClose();
    } catch (error: any) {
        console.error("API Validation failed", error);
        let msg = error.message || "Unknown error";
        if (msg.includes("400")) msg = "Invalid API Key (400 Bad Request)";
        if (msg.includes("403")) msg = "Permission Denied (403). Check if key is enabled.";
        if (msg.includes("404")) msg = "Model not found. Key might be invalid.";
        
        setErrorMsg(`Validation Failed: ${msg}`);
    } finally {
        setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-dash-300/30 rounded-xl w-full max-w-md shadow-2xl relative">
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className="w-12 h-12 bg-dash-900/50 rounded-full flex items-center justify-center mx-auto mb-3 text-dash-300">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white">Gemini API Key</h3>
            <p className="text-sm text-gray-400 mt-2">
              Your API key is stored locally in your browser. 
              Required for Gemini 3 Pro.
            </p>
          </div>

          <div className="relative">
            <input
              type={isVisible ? "text" : "password"}
              className={`w-full bg-gray-950 border ${errorMsg ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-dash-300'} rounded-lg py-3 pl-4 pr-10 text-sm text-white focus:ring-2 focus:border-transparent outline-none font-mono disabled:opacity-50 transition-colors`}
              placeholder="Paste your API key here..."
              value={inputVal}
              onChange={(e) => {
                  setInputVal(e.target.value);
                  setErrorMsg('');
              }}
              autoFocus
              disabled={isValidating}
            />
            <button 
              onClick={() => setIsVisible(!isVisible)}
              className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
              disabled={isValidating}
            >
              {isVisible ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
              ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
          </div>

          {errorMsg && (
             <div className="text-xs text-red-400 font-medium animate-in slide-in-from-top-1 flex items-center gap-1">
                 <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                 <span className="break-all">{errorMsg}</span>
             </div>
          )}

          <div className="flex gap-3 pt-2">
            <button 
                onClick={onClose}
                disabled={isValidating}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
                Cancel
            </button>
            <button 
                onClick={handleSave}
                disabled={isValidating}
                className="flex-1 py-2 rounded-lg text-sm font-bold text-dash-900 bg-dash-300 hover:bg-dash-200 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
                {isValidating && <div className="w-4 h-4 border-2 border-dash-900 border-t-transparent rounded-full animate-spin"></div>}
                {isValidating ? 'Validating...' : 'Save Key'}
            </button>
          </div>
          
          <div className="text-center">
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-dash-300 hover:underline">
                Get API Key ->
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;