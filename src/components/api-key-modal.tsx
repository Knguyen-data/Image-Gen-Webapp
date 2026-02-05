import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from '../services/logger';

type KeyMode = 'gemini' | 'spicy';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  // Spicy Mode support
  mode?: KeyMode;
  kieApiKey?: string;
  setKieApiKey?: (key: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  mode = 'gemini',
  kieApiKey = '',
  setKieApiKey
}) => {
  const [inputVal, setInputVal] = useState(mode === 'spicy' ? kieApiKey : apiKey);
  const [isVisible, setIsVisible] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isSpicyMode = mode === 'spicy';

  useEffect(() => {
    setInputVal(isSpicyMode ? kieApiKey : apiKey);
    setErrorMsg('');
  }, [apiKey, kieApiKey, isOpen, isSpicyMode]);

  if (!isOpen) return null;

  const sanitizeKey = (raw: string): string => {
    let key = raw.trim();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
    return key;
  };

  const validateGeminiKey = async (key: string): Promise<void> => {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite-preview-02-05" });
    const nonce = Date.now().toString();
    const result = await model.generateContent(`Return the word "pong" - ${nonce}`);
    if (!result || !result.response) {
      throw new Error("No response from AI Service");
    }
  };

  const validateKieApiKey = async (key: string): Promise<void> => {
    const response = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Invalid Kie.ai API key');
      throw new Error(`Kie.ai API error: ${response.status}`);
    }
    const result = await response.json();
    if (result.code !== 200) throw new Error(result.msg || 'Unknown error');
  };

  const handleSave = async () => {
    const key = sanitizeKey(inputVal);
    if (!key) {
      setErrorMsg("Please enter an API key");
      return;
    }

    setIsValidating(true);
    setErrorMsg('');

    try {
      if (isSpicyMode) {
        logger.info('ApiKeyModal', 'Validating Kie.ai API key');
        await validateKieApiKey(key);
        setKieApiKey?.(key);
        localStorage.setItem('raw_studio_kie_api_key', key);
        logger.info('ApiKeyModal', 'Kie.ai API key saved');
      } else {
        logger.info('ApiKeyModal', 'Validating Gemini API key');
        await validateGeminiKey(key);
        setApiKey(key);
        localStorage.setItem('raw_studio_api_key', key);
        logger.info('ApiKeyModal', 'Gemini API key saved');
      }
      onClose();
    } catch (error: any) {
      logger.error('ApiKeyModal', 'Validation failed', error);
      let msg = error.message || "Unknown error";

      // Handle 404 as success for Gemini (valid key, model not found)
      if (!isSpicyMode && (msg.includes("404") || msg.includes("not found"))) {
        logger.warn('ApiKeyModal', 'Model 404d but treating key as valid');
        setApiKey(key);
        localStorage.setItem('raw_studio_api_key', key);
        onClose();
        return;
      }

      // User-friendly error messages
      if (msg.includes("400")) msg = "Invalid API Key (400)";
      if (msg.includes("401")) msg = "Unauthorized (401). Invalid key.";
      if (msg.includes("403")) msg = "Permission Denied (403)";

      if (!isSpicyMode && !key.startsWith("AIza")) {
        msg += " (Hint: Gemini keys start with 'AIza')";
      }

      setErrorMsg(msg);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className={`bg-gray-900 border ${isSpicyMode ? 'border-orange-500/30' : 'border-dash-300/30'} rounded-xl w-full max-w-md shadow-2xl relative`}>
        <div className="p-6 space-y-4">
          <div className="text-center">
            <div className={`w-12 h-12 ${isSpicyMode ? 'bg-orange-900/50' : 'bg-dash-900/50'} rounded-full flex items-center justify-center mx-auto mb-3 ${isSpicyMode ? 'text-orange-400' : 'text-dash-300'}`}>
              {isSpicyMode ? (
                <span className="text-2xl">🌶️</span>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              )}
            </div>
            <h3 className="text-xl font-bold text-white">
              {isSpicyMode ? 'Kie.ai API Key' : 'Gemini API Key'}
            </h3>
            <p className="text-sm text-gray-400 mt-2">
              {isSpicyMode
                ? 'Required for Spicy Mode (Seedream 4.5 Edit)'
                : 'Required for Gemini image generation'
              }
            </p>
          </div>

          <div className="relative">
            <input
              type={isVisible ? "text" : "password"}
              className={`w-full bg-gray-950 border ${
                errorMsg
                  ? 'border-red-500 focus:ring-red-500'
                  : isSpicyMode
                    ? 'border-orange-700/50 focus:ring-orange-500'
                    : 'border-gray-700 focus:ring-dash-300'
              } rounded-lg py-3 pl-4 pr-10 text-sm text-white focus:ring-2 focus:border-transparent outline-none font-mono disabled:opacity-50 transition-colors`}
              placeholder={isSpicyMode ? "Enter Kie.ai API key..." : "Paste your Gemini API key..."}
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
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 ${
                isSpicyMode
                  ? 'text-black bg-orange-500 hover:bg-orange-400'
                  : 'text-dash-900 bg-dash-300 hover:bg-dash-200'
              }`}
            >
              {isValidating && <div className={`w-4 h-4 border-2 ${isSpicyMode ? 'border-black' : 'border-dash-900'} border-t-transparent rounded-full animate-spin`}></div>}
              {isValidating ? 'Validating...' : 'Save Key'}
            </button>
          </div>

          <div className="text-center">
            <a
              href={isSpicyMode ? "https://kie.ai" : "https://aistudio.google.com/app/apikey"}
              target="_blank"
              rel="noreferrer"
              className={`text-xs ${isSpicyMode ? 'text-orange-400' : 'text-dash-300'} hover:underline`}
            >
              Get {isSpicyMode ? 'Kie.ai' : 'Gemini'} API Key →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
