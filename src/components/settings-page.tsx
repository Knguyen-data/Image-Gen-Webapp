import React, { useState, useEffect, useCallback } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../services/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

type SettingsSection = 'api-keys' | 'credits' | 'video-processing' | 'about';

interface ProviderStatus {
  configured: boolean;
  validating: boolean;
  error: string;
  extra?: string; // e.g. credit balance
}

interface SettingsPageProps {
  onClose: () => void;
  // Gemini
  apiKey: string;
  setApiKey: (key: string) => void;
  // Kie.ai
  kieApiKey: string;
  setKieApiKey: (key: string) => void;
  // Freepik
  freepikApiKey: string;
  setFreepikApiKey: (key: string) => void;
  // RunPod / Extreme Mode
  runpodApiKey: string;
  setRunpodApiKey: (key: string) => void;
  // Credits
  credits: number | null;
  creditsLoading: boolean;
  creditsError: string | null;
  isLowCredits: boolean;
  isCriticalCredits: boolean;
  refreshCredits: () => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sanitizeKey = (raw: string): string => {
  let key = raw.trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1);
  return key;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Reusable password input with show/hide toggle */
const SecretInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  accentColor: string; // tailwind border/ring color token like "dash-300"
  disabled?: boolean;
  isPassword?: boolean;
  monospace?: boolean;
}> = ({ value, onChange, placeholder, accentColor, disabled, isPassword = true, monospace = true }) => {
  const [visible, setVisible] = useState(false);

  const borderClass = `border-${accentColor}/30`;
  const ringClass = `focus:ring-${accentColor}`;

  return (
    <div className="relative">
      <input
        type={isPassword && !visible ? 'password' : 'text'}
        className={`w-full bg-gray-950 border ${borderClass} ${ringClass} rounded-lg py-2.5 pl-4 pr-10 text-sm text-white focus:ring-2 focus:border-transparent outline-none transition-colors disabled:opacity-50 ${monospace ? 'font-mono' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-300 transition-colors"
          tabIndex={-1}
        >
          {visible ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          )}
        </button>
      )}
    </div>
  );
};

/** Status badge */
const StatusBadge: React.FC<{ configured: boolean; validating?: boolean }> = ({ configured, validating }) => {
  if (validating) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-400">
        <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        Validating…
      </span>
    );
  }
  if (configured) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
        <span className="w-2 h-2 bg-green-400 rounded-full" />
        Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-yellow-500">
      <span className="w-2 h-2 bg-yellow-500 rounded-full" />
      Not set
    </span>
  );
};

// ─── Provider Card ───────────────────────────────────────────────────────────

interface ProviderCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  accentColor: string; // e.g. "dash-300", "red-400", "cyan-400", "green-400"
  accentBorder: string;
  accentBg: string;
  status: ProviderStatus;
  link: { url: string; label: string };
  children: React.ReactNode;
  onSave: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
  name,
  description,
  icon,
  accentBorder,
  accentBg,
  status,
  link,
  children,
  onSave,
  saveLabel = 'Save Key',
  saveDisabled,
}) => (
  <div className={`bg-gray-900/80 border ${accentBorder} rounded-xl overflow-hidden`}>
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${accentBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
            {icon}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">{name}</h3>
            <p className="text-gray-500 text-xs mt-0.5">{description}</p>
          </div>
        </div>
        <StatusBadge configured={status.configured} validating={status.validating} />
      </div>

      {/* Fields */}
      <div className="space-y-3">
        {children}
      </div>

      {/* Error */}
      {status.error && (
        <div className="text-xs text-red-400 font-medium flex items-center gap-1.5 bg-red-950/30 border border-red-900/50 rounded-lg px-3 py-2">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="break-all">{status.error}</span>
        </div>
      )}

      {/* Extra info (e.g. credit balance) */}
      {status.extra && (
        <div className="text-xs text-green-400 font-medium bg-green-950/30 border border-green-900/50 rounded-lg px-3 py-2">
          {status.extra}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-gray-400 hover:text-white transition-colors hover:underline"
        >
          {link.label} →
        </a>
        <button
          onClick={onSave}
          disabled={status.validating || saveDisabled}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${accentBg} text-white hover:brightness-110`}
        >
          {status.validating ? 'Validating…' : saveLabel}
        </button>
      </div>
    </div>
  </div>
);

// ─── Sidebar Nav Item ────────────────────────────────────────────────────────

const NavItem: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
}> = ({ label, icon, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-gray-800 text-white'
        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
    }`}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
    {badge}
  </button>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const SettingsPage: React.FC<SettingsPageProps> = ({
  onClose,
  apiKey,
  setApiKey,
  kieApiKey,
  setKieApiKey,
  freepikApiKey,
  setFreepikApiKey,
  runpodApiKey,
  setRunpodApiKey,
  credits,
  creditsLoading,
  creditsError,
  isLowCredits,
  isCriticalCredits,
  refreshCredits,
}) => {
  const [section, setSection] = useState<SettingsSection>('api-keys');

  // ── Local form state ───
  const [geminiInput, setGeminiInput] = useState(apiKey);
  const [kieInput, setKieInput] = useState(kieApiKey);
  const [freepikInput, setFreepikInput] = useState(freepikApiKey);
  const [runpodInput, setRunpodInput] = useState(runpodApiKey);
  

  // ── Provider statuses ───
  const [geminiStatus, setGeminiStatus] = useState<ProviderStatus>({ configured: !!apiKey, validating: false, error: '' });
  const [kieStatus, setKieStatus] = useState<ProviderStatus>({ configured: !!kieApiKey, validating: false, error: '' });
  const [freepikStatus, setFreepikStatus] = useState<ProviderStatus>({ configured: !!freepikApiKey, validating: false, error: '' });
  const [runpodStatus, setRunpodStatus] = useState<ProviderStatus>({ configured: !!runpodApiKey, validating: false, error: '' });

  // ── Credits timestamp ───
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // Sync statuses when props change
  useEffect(() => { setGeminiStatus(s => ({ ...s, configured: !!apiKey })); }, [apiKey]);
  useEffect(() => { setKieStatus(s => ({ ...s, configured: !!kieApiKey })); }, [kieApiKey]);
  useEffect(() => { setFreepikStatus(s => ({ ...s, configured: !!freepikApiKey })); }, [freepikApiKey]);
  useEffect(() => { setRunpodStatus(s => ({ ...s, configured: !!runpodApiKey })); }, [runpodApiKey]);

  // Set initial lastRefreshed
  useEffect(() => {
    if (credits !== null && !lastRefreshed) setLastRefreshed(new Date());
  }, [credits, lastRefreshed]);

  // ── Validation handlers ───

  const handleSaveGemini = useCallback(async () => {
    const key = sanitizeKey(geminiInput);
    if (!key) { setGeminiStatus(s => ({ ...s, error: 'Please enter an API key' })); return; }

    setGeminiStatus(s => ({ ...s, validating: true, error: '' }));
    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const nonce = Date.now().toString();
      const result = await model.generateContent(`Return the word "pong" - ${nonce}`);
      if (!result || !result.response) throw new Error('No response from AI Service');

      setApiKey(key);
      localStorage.setItem('raw_studio_api_key', key);
      logger.info('Settings', 'Gemini API key saved');
      setGeminiStatus({ configured: true, validating: false, error: '' });
    } catch (err: any) {
      let msg = err.message || 'Unknown error';
      // 404 means model not found but key is valid
      if (msg.includes('404') || msg.includes('not found')) {
        setApiKey(key);
        localStorage.setItem('raw_studio_api_key', key);
        logger.warn('Settings', 'Model 404d but treating key as valid');
        setGeminiStatus({ configured: true, validating: false, error: '' });
        return;
      }
      if (msg.includes('400')) msg = 'Invalid API Key (400)';
      if (msg.includes('401')) msg = 'Unauthorized (401). Invalid key.';
      if (msg.includes('403')) msg = 'Permission Denied (403)';
      if (!key.startsWith('AIza')) msg += " (Hint: Gemini keys start with 'AIza')";
      logger.error('Settings', 'Gemini validation failed', err);
      setGeminiStatus(s => ({ ...s, validating: false, error: msg }));
    }
  }, [geminiInput, setApiKey]);

  const handleSaveKie = useCallback(async () => {
    const key = sanitizeKey(kieInput);
    if (!key) { setKieStatus(s => ({ ...s, error: 'Please enter an API key' })); return; }

    setKieStatus(s => ({ ...s, validating: true, error: '', extra: undefined }));
    try {
      const response = await fetch('https://api.kie.ai/api/v1/chat/credit', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error('Invalid Kie.ai API key');
        throw new Error(`Kie.ai API error: ${response.status}`);
      }
      const result = await response.json();
      if (result.code !== 200) throw new Error(result.msg || 'Unknown error');

      setKieApiKey(key);
      localStorage.setItem('raw_studio_kie_api_key', key);
      logger.info('Settings', 'Kie.ai API key saved');

      const balance = result.data?.credit ?? result.data?.balance;
      setKieStatus({
        configured: true,
        validating: false,
        error: '',
        extra: balance !== undefined ? `Credit balance: ${balance}` : undefined,
      });
    } catch (err: any) {
      logger.error('Settings', 'Kie.ai validation failed', err);
      setKieStatus(s => ({ ...s, validating: false, error: err.message || 'Validation failed' }));
    }
  }, [kieInput, setKieApiKey]);

  const handleSaveFreepik = useCallback(async () => {
    const key = sanitizeKey(freepikInput);
    if (!key) { setFreepikStatus(s => ({ ...s, error: 'Please enter an API key' })); return; }
    if (!key.startsWith('FPSX')) {
      setFreepikStatus(s => ({ ...s, error: 'Freepik keys start with "FPSX"' }));
      return;
    }

    setFreepikApiKey(key);
    localStorage.setItem('freepik_api_key', key);
    logger.info('Settings', 'Freepik API key saved');
    setFreepikStatus({ configured: true, validating: false, error: '' });
  }, [freepikInput, setFreepikApiKey]);

  const handleSaveRunpod = useCallback(async () => {
    const key = sanitizeKey(runpodInput);
    if (!key) { setRunpodStatus(s => ({ ...s, error: 'Please enter an API key' })); return; }
    if (key.length < 20) {
      setRunpodStatus(s => ({ ...s, error: 'API key seems too short (minimum 20 characters)' }));
      return;
    }

    setRunpodStatus(s => ({ ...s, validating: true, error: '' }));
    try {
      const response = await fetch('https://api.runpod.ai/v2/rj1ppodzmtdoiz/health', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      });
      if (response.status === 401) {
        throw new Error('Invalid RunPod API key (401 Unauthorized)');
      }
      // Other errors are OK — endpoint might be cold/sleeping

      setRunpodApiKey(key);
      localStorage.setItem('raw_studio_runpod_api_key', key);
      logger.info('Settings', 'RunPod API key saved');
      setRunpodStatus({ configured: true, validating: false, error: '' });
    } catch (err: any) {
      if (err.message?.includes('401')) {
        logger.error('Settings', 'RunPod validation failed', err);
        setRunpodStatus(s => ({ ...s, validating: false, error: err.message || 'Invalid API key' }));
      } else {
        // Network errors or non-401 errors — key is probably fine, endpoint may be cold
        setRunpodApiKey(key);
        localStorage.setItem('raw_studio_runpod_api_key', key);
        logger.warn('Settings', 'RunPod health check failed but saving key anyway', err);
        setRunpodStatus({ configured: true, validating: false, error: '' });
      }
    }
  }, [runpodInput, setRunpodApiKey]);


  const handleRefreshCredits = useCallback(async () => {
    await refreshCredits();
    setLastRefreshed(new Date());
  }, [refreshCredits]);

  // ── Count configured providers for badge ───
  const configuredCount = [!!apiKey, !!kieApiKey, !!freepikApiKey, !!runpodApiKey]
    .filter(Boolean).length;

  // ── Render sections ───

  const renderApiKeys = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">API Keys</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure your provider API keys. Keys are stored locally in your browser.
        </p>
      </div>

      {/* Gemini */}
      <ProviderCard
        name="Gemini"
        description="Google AI image generation (primary)"
        icon={
          <svg className="w-5 h-5 text-dash-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
        }
        accentColor="dash-300"
        accentBorder="border-dash-300/20"
        accentBg="bg-dash-900/60"
        status={geminiStatus}
        link={{ url: 'https://aistudio.google.com/app/apikey', label: 'Get Gemini API Key' }}
        onSave={handleSaveGemini}
      >
        <SecretInput
          value={geminiInput}
          onChange={(v) => { setGeminiInput(v); setGeminiStatus(s => ({ ...s, error: '' })); }}
          placeholder="AIza... (paste your Gemini API key)"
          accentColor="dash-300"
          disabled={geminiStatus.validating}
        />
      </ProviderCard>

      {/* Kie.ai */}
      <ProviderCard
        name="Kie.ai / Spicy Mode 🌶️"
        description="Seedream 4.5 image editing & generation"
        icon={<span className="text-xl">🌶️</span>}
        accentColor="red-400"
        accentBorder="border-red-500/20"
        accentBg="bg-red-900/60"
        status={kieStatus}
        link={{ url: 'https://kie.ai', label: 'Get Kie.ai API Key' }}
        onSave={handleSaveKie}
      >
        <SecretInput
          value={kieInput}
          onChange={(v) => { setKieInput(v); setKieStatus(s => ({ ...s, error: '', extra: undefined })); }}
          placeholder="Enter Kie.ai API key..."
          accentColor="red-400"
          disabled={kieStatus.validating}
        />
      </ProviderCard>

      {/* Freepik */}
      <ProviderCard
        name="Freepik"
        description="Kling video generation via Freepik API"
        icon={
          <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        }
        accentColor="cyan-400"
        accentBorder="border-cyan-500/20"
        accentBg="bg-cyan-900/60"
        status={freepikStatus}
        link={{ url: 'https://www.freepik.com/developers/dashboard/api-key', label: 'Get Freepik API Key' }}
        onSave={handleSaveFreepik}
      >
        <SecretInput
          value={freepikInput}
          onChange={(v) => { setFreepikInput(v); setFreepikStatus(s => ({ ...s, error: '' })); }}
          placeholder="FPSX... (paste your Freepik API key)"
          accentColor="cyan-400"
          disabled={freepikStatus.validating}
        />
      </ProviderCard>

      {/* RunPod / Extreme Mode */}
      <ProviderCard
        name="RunPod / Extreme Mode ⚡"
        description="ComfyUI Lustify SDXL (NSFW generation)"
        icon={
          <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        }
        accentColor="orange-400"
        accentBorder="border-orange-500/20"
        accentBg="bg-orange-900/60"
        status={runpodStatus}
        link={{ url: 'https://www.runpod.io/console/user/settings', label: 'Get RunPod API Key' }}
        onSave={handleSaveRunpod}
      >
        <SecretInput
          value={runpodInput}
          onChange={(v) => { setRunpodInput(v); setRunpodStatus(s => ({ ...s, error: '' })); }}
          placeholder="Enter RunPod API key..."
          accentColor="orange-400"
          disabled={runpodStatus.validating}
        />
      </ProviderCard>
    </div>
  );

  const renderCredits = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Kie.ai Credits</h2>
        <p className="text-sm text-gray-500 mt-1">
          Monitor your Seedream credit balance for Spicy Mode and video generation.
        </p>
      </div>

      <div className={`bg-gray-900/80 border rounded-xl p-6 ${
        isCriticalCredits ? 'border-red-500/40' : isLowCredits ? 'border-yellow-500/40' : 'border-gray-800'
      }`}>
        {/* Balance display */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Credit Balance</p>
            <div className="mt-2">
              {creditsLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-dash-300 border-t-transparent rounded-full animate-spin" />
                  <span className="text-gray-400 text-sm">Loading…</span>
                </div>
              ) : creditsError ? (
                <p className="text-red-400 text-sm">{creditsError}</p>
              ) : credits !== null ? (
                <p className={`text-4xl font-bold tabular-nums ${
                  isCriticalCredits ? 'text-red-400' : isLowCredits ? 'text-yellow-400' : 'text-white'
                }`}>
                  {credits.toLocaleString()}
                </p>
              ) : (
                <p className="text-gray-500 text-sm">No API key configured</p>
              )}
            </div>
          </div>

          <button
            onClick={handleRefreshCredits}
            disabled={creditsLoading || !kieApiKey}
            className="p-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh credits"
          >
            <svg className={`w-5 h-5 ${creditsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Warning indicators */}
        {isCriticalCredits && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2 mb-4">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            <span className="text-xs text-red-400 font-medium">Critical: Credits nearly depleted! Top up immediately.</span>
          </div>
        )}
        {isLowCredits && !isCriticalCredits && (
          <div className="flex items-center gap-2 bg-yellow-950/40 border border-yellow-900/50 rounded-lg px-3 py-2 mb-4">
            <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            <span className="text-xs text-yellow-400 font-medium">Low credits. Consider topping up soon.</span>
          </div>
        )}

        {/* Last refreshed */}
        {lastRefreshed && (
          <p className="text-xs text-gray-600 mt-2">
            Last refreshed: {lastRefreshed.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );



  const renderVideoProcessing = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">Video Processing</h2>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered video enhancement services for upscaling and frame interpolation.
        </p>
      </div>

      {/* Video Upscaling (Real-ESRGAN) */}
      <div className="bg-gray-900/80 border border-purple-500/20 rounded-xl overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-900/60 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Video Upscaling (Real-ESRGAN)</h3>
                <p className="text-gray-500 text-xs mt-0.5">AI upscaling for generated videos using Real-ESRGAN</p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${runpodApiKey ? 'text-green-400' : 'text-yellow-500'}`}>
              <span className={`w-2 h-2 rounded-full ${runpodApiKey ? 'bg-green-400' : 'bg-yellow-500'}`} />
              {runpodApiKey ? 'Active' : 'Needs RunPod Key'}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-gray-950 border border-purple-500/20 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">2× Upscale</span>
                  <span className="text-xs text-purple-400 font-medium">720p → 1440p</span>
                </div>
              </div>
              <div className="flex-1 bg-gray-950 border border-purple-500/20 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">4× Upscale</span>
                  <span className="text-xs text-purple-400 font-medium">720p → 4K</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-950/50 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Uses RunPod serverless infrastructure — no separate API key needed
          </div>
        </div>
      </div>

      {/* Frame Interpolation (RIFE) */}
      <div className="bg-gray-900/80 border border-indigo-500/20 rounded-xl overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-900/60 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Frame Interpolation (RIFE v4.6)</h3>
                <p className="text-gray-500 text-xs mt-0.5">Smooth video frame interpolation using RIFE</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Available
            </span>
          </div>

          <div className="space-y-2">
            <div className="bg-gray-950 border border-indigo-500/20 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Effect</span>
                <span className="text-xs text-indigo-400 font-medium">Doubles framerate • Smoother AI videos</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 bg-gray-950/50 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Deployed on Modal.com — no additional API key required
          </div>
        </div>
      </div>
    </div>
  );

  const renderAbout = () => (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">About</h2>
        <p className="text-sm text-gray-500 mt-1">Application information.</p>
      </div>

      <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-6 space-y-4">
        <div>
          <h3 className="text-white font-semibold text-sm">Image Gen Webapp</h3>
          <p className="text-gray-500 text-xs mt-1">
            AI-powered image and video generation studio with multi-provider support.
          </p>
        </div>

        <div className="border-t border-gray-800 pt-4 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Providers</span>
            <span className="text-gray-300">Gemini · Kie.ai · Freepik · RunPod</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Storage</span>
            <span className="text-gray-300">IndexedDB + localStorage</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Keys configured</span>
            <span className="text-gray-300">{configuredCount} / 4</span>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-4">
          <p className="text-xs text-gray-600">
            All API keys are stored locally in your browser's localStorage. They are never sent to any server other than the respective API providers.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[150] bg-gray-950 flex animate-in fade-in duration-200">
      {/* Sidebar */}
      <div className="w-56 border-r border-gray-800 flex flex-col bg-gray-950">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              title="Back to app"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <h1 className="text-white font-bold text-sm">Settings</h1>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          <NavItem
            label="API Keys"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>}
            active={section === 'api-keys'}
            onClick={() => setSection('api-keys')}
            badge={
              <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
                {configuredCount}/4
              </span>
            }
          />
          <NavItem
            label="Credits"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            active={section === 'credits'}
            onClick={() => setSection('credits')}
            badge={
              isCriticalCredits ? (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              ) : isLowCredits ? (
                <span className="w-2 h-2 bg-yellow-500 rounded-full" />
              ) : null
            }
          />
          <NavItem
            label="Video Processing"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>}
            active={section === 'video-processing'}
            onClick={() => setSection('video-processing')}
          />
          <NavItem
            label="About"
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            active={section === 'about'}
            onClick={() => setSection('about')}
          />
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            Close Settings
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8">
          {section === 'api-keys' && renderApiKeys()}
          {section === 'credits' && renderCredits()}
          {section === 'video-processing' && renderVideoProcessing()}
          {section === 'about' && renderAbout()}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
