import React, { useState, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from '../services/logger';

type KeyMode = 'gemini' | 'spicy' | 'freepik' | 'fal';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  // Spicy Mode support
  mode?: KeyMode;
  kieApiKey?: string;
  setKieApiKey?: (key: string) => void;
  // Freepik support
  freepikApiKey?: string;
  setFreepikApiKey?: (key: string) => void;
  // FAL support
  falApiKey?: string;
  setFalApiKey?: (key: string) => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  setApiKey,
  mode = 'gemini',
  kieApiKey = '',
  setKieApiKey,
  freepikApiKey = '',
  setFreepikApiKey,
  falApiKey = '',
  setFalApiKey,
}) => {
  const [activeTab, setActiveTab] = useState<KeyMode>(mode);
  const [inputVal, setInputVal] = useState(
    mode === 'spicy' ? kieApiKey : 
    mode === 'freepik' ? freepikApiKey : 
    mode === 'fal' ? falApiKey : 
    apiKey
  );
  const [isVisible, setIsVisible] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isSpicyMode = activeTab === 'spicy';
  const isFreepikMode = activeTab === 'freepik';
  const isFalMode = activeTab === 'fal';

  // Initialize activeTab from mode prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(mode);
    }
  }, [isOpen, mode]);

  // Sync inputVal when tab changes
  useEffect(() => {
    setInputVal(
      isSpicyMode ? kieApiKey : 
      isFreepikMode ? freepikApiKey : 
      isFalMode ? falApiKey :
      apiKey
    );
    setErrorMsg('');
  }, [activeTab, apiKey, kieApiKey, freepikApiKey, falApiKey, isSpicyMode, isFreepikMode, isFalMode]);

  if (!isOpen) return null;

  const sanitizeKey = (raw: string): string => {
    let key = raw.trim();
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
    return key;
  };

  const validateGeminiKey = async (key: string): Promise<void> => {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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

  const validateFreepikApiKey = async (key: string): Promise<void> => {
    if (!key.startsWith('FPSX')) {
      throw new Error('Freepik keys start with "FPSX"');
    }
  };

  const validateFalApiKey = async (key: string): Promise<void> => {
    // FAL keys are UUIDs with dashes or alphanumeric strings
    if (key.length < 20) {
      throw new Error('FAL API key appears too short');
    }
    // Could add actual validation by calling FAL API here
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
      if (isFalMode) {
        logger.info('ApiKeyModal', 'Validating FAL API key');
        await validateFalApiKey(key);
        setFalApiKey?.(key);
        localStorage.setItem('fal_api_key', key);
        logger.info('ApiKeyModal', 'FAL API key saved');
      } else if (isFreepikMode) {
        logger.info('ApiKeyModal', 'Validating Freepik API key');
        await validateFreepikApiKey(key);
        setFreepikApiKey?.(key);
        localStorage.setItem('freepik_api_key', key);
        logger.info('ApiKeyModal', 'Freepik API key saved');
      } else if (isSpicyMode) {
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

      if (!isSpicyMode && !isFreepikMode && !isFalMode && (msg.includes("404") || msg.includes("not found"))) {
        logger.warn('ApiKeyModal', 'Model 404d but treating key as valid');
        setApiKey(key);
        localStorage.setItem('raw_studio_api_key', key);
        onClose();
        return;
      }

      if (msg.includes("400")) msg = "Invalid API Key (400)";
      if (msg.includes("401")) msg = "Unauthorized (401). Invalid key.";
      if (msg.includes("403")) msg = "Permission Denied (403)";

      if (!isSpicyMode && !isFreepikMode && !isFalMode && !key.startsWith("AIza")) {
        msg += " (Hint: Gemini keys start with 'AIza')";
      }

      setErrorMsg(msg);
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className={`bg-gray-900 border ${
        isSpicyMode ? 'border-red-500/30' : 
        isFalMode ? 'border-purple-500/30' :
        isFreepikMode ? 'border-cyan-500/30' : 
        'border-dash-300/30'
      } rounded-xl w-full max-w-md shadow-2xl relative`}>
        <div className="p-6 space-y-4">
          {/* Tab Bar */}
          <div className="flex border-b border-gray-800 -mt-2 mb-4">
            <button
              onClick={() => setActiveTab('gemini')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'gemini'
                  ? 'text-dash-300 border-dash-300'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                Gemini
                {apiKey && activeTab !== 'gemini' && (
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('fal')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'fal'
                  ? 'text-purple-400 border-purple-500'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-base">⚡</span>
                FAL
                {falApiKey && activeTab !== 'fal' && (
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('spicy')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'spicy'
                  ? 'text-red-400 border-red-500'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-base">🌶️</span>
                Kie.ai
                {kieApiKey && activeTab !== 'spicy' && (
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                )}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('freepik')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'freepik'
                  ? 'text-cyan-400 border-cyan-500'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Freepik
                {freepikApiKey && activeTab !== 'freepik' && (
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                )}
              </span>
            </button>
          </div>

          <div className="text-center">
            <div className={`w-12 h-12 ${
              isSpicyMode ? 'bg-red-900/50' : 
              isFreepikMode ? 'bg-cyan-900/50' : 
              isFalMode ? 'bg-purple-900/50' :
              'bg-dash-900/50'
            } rounded-full flex items-center justify-center mx-auto mb-3 ${
              isSpicyMode ? 'text-red-400' : 
              isFreepikMode ? 'text-cyan-400' : 
              isFalMode ? 'text-purple-400' :
              'text-dash-300'
            }`}>
              {isSpicyMode ? (
                <span className="text-2xl">🌶️</span>
              ) : isFalMode ? (
                <span className="text-2xl">⚡</span>
              ) : isFreepikMode ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
              )}
            </div>
            <h3 className="text-xl font-bold text-white">
              {isSpicyMode ? 'Kie.ai API Key' : 
               isFalMode ? 'FAL API Key' :
               isFreepikMode ? 'Freepik API Key' : 
               'Gemini API Key'}
            </h3>
            <p className="text-sm text-gray-400 mt-2">
              {isSpicyMode
                ? 'Required for Spicy Mode (Seedream 4.5 Edit)'
                : isFalMode
                  ? 'Required for AMT video interpolation'
                  : isFreepikMode
                    ? 'Required for Freepik image generation'
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
                    ? 'border-red-700/50 focus:ring-red-500'
                    : isFalMode
                      ? 'border-purple-700/50 focus:ring-purple-500'
                      : isFreepikMode
                        ? 'border-cyan-700/50 focus:ring-cyan-500'
                        : 'border-gray-700 focus:ring-dash-300'
              } rounded-lg py-3 pl-4 pr-10 text-sm text-white focus:ring-2 focus:border-transparent outline-none font-mono disabled:opacity-50 transition-colors`}
              placeholder={
                isSpicyMode ? "Enter Kie.ai API key..." : 
                isFalMode ? "Enter FAL API key..." :
                isFreepikMode ? "Enter Freepik API key..." : 
                "Paste your Gemini API key..."
              }
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
                  ? 'text-white bg-red-500 hover:bg-red-400'
                  : isFalMode
                    ? 'text-white bg-purple-600 hover:bg-purple-500'
                    : isFreepikMode
                      ? 'text-white bg-cyan-600 hover:bg-cyan-500'
                      : 'text-dash-900 bg-dash-300 hover:bg-dash-200'
              }`}
            >
              {isValidating && <div className={`w-4 h-4 border-2 ${
                isSpicyMode || isFalMode || isFreepikMode ? 'border-white' : 'border-dash-900'
              } border-t-transparent rounded-full animate-spin`}></div>}
              {isValidating ? 'Validating...' : 'Save Key'}
            </button>
          </div>

          <div className="text-center">
            <a
              href={
                isSpicyMode ? "https://kie.ai" : 
                isFalMode ? "https://fal.ai/dashboard/keys" :
                isFreepikMode ? "https://www.freepik.com/developers/dashboard/api-key" : 
                "https://aistudio.google.com/app/apikey"
              }
              target="_blank"
              rel="noreferrer"
              className={`text-xs ${
                isSpicyMode ? 'text-red-400' : 
                isFalMode ? 'text-purple-400' :
                isFreepikMode ? 'text-cyan-400' : 
                'text-dash-300'
              } hover:underline`}
            >
              Get {isSpicyMode ? 'Kie.ai' : isFalMode ? 'FAL' : isFreepikMode ? 'Freepik' : 'Gemini'} API Key →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
