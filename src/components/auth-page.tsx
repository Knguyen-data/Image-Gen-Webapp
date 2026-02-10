import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/use-auth';

type AuthTab = 'signIn' | 'signUp';

interface AuthPageProps {
  onAuthenticated: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onAuthenticated }) => {
  const {
    loading,
    error,
    isAuthenticated,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    clearError,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mount animation
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Redirect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      onAuthenticated();
    }
  }, [isAuthenticated, onAuthenticated]);

  // Animated gradient canvas background (fallback + overlay)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      time += 0.003;
      const w = canvas.width;
      const h = canvas.height;

      // Dark base
      ctx.fillStyle = '#030712';
      ctx.fillRect(0, 0, w, h);

      // Floating orbs
      const orbs = [
        { x: 0.3 + Math.sin(time * 0.7) * 0.15, y: 0.4 + Math.cos(time * 0.5) * 0.2, r: 0.4, color: 'rgba(34, 197, 94, 0.06)' },
        { x: 0.7 + Math.cos(time * 0.6) * 0.1, y: 0.6 + Math.sin(time * 0.4) * 0.15, r: 0.35, color: 'rgba(74, 222, 128, 0.04)' },
        { x: 0.5 + Math.sin(time * 0.8) * 0.2, y: 0.3 + Math.cos(time * 0.3) * 0.1, r: 0.3, color: 'rgba(134, 239, 172, 0.05)' },
        { x: 0.2 + Math.cos(time * 0.5) * 0.1, y: 0.8 + Math.sin(time * 0.6) * 0.1, r: 0.25, color: 'rgba(16, 185, 129, 0.04)' },
      ];

      for (const orb of orbs) {
        const grad = ctx.createRadialGradient(
          orb.x * w, orb.y * h, 0,
          orb.x * w, orb.y * h, orb.r * Math.min(w, h)
        );
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Subtle grid overlay
      ctx.strokeStyle = 'rgba(134, 239, 172, 0.02)';
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Floating particles
      for (let i = 0; i < 30; i++) {
        const px = (Math.sin(time * 0.5 + i * 1.7) * 0.5 + 0.5) * w;
        const py = (Math.cos(time * 0.3 + i * 2.1) * 0.5 + 0.5) * h;
        const size = 1 + Math.sin(time + i) * 0.5;
        const alpha = 0.15 + Math.sin(time * 2 + i * 0.8) * 0.1;
        ctx.fillStyle = `rgba(134, 239, 172, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSuccessMessage('');

    if (activeTab === 'signIn') {
      const success = await signInWithEmail(email, password);
      if (success) onAuthenticated();
    } else {
      const success = await signUpWithEmail(email, password);
      if (success) {
        setSuccessMessage('Check your email to confirm your account!');
        setActiveTab('signIn');
        setPassword('');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    clearError();
    setSuccessMessage('');
    await signInWithGoogle();
  };

  return (
    <div className="fixed inset-0 z-[300] overflow-hidden">
      {/* Animated canvas background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 0 }}
      />

      {/* Video background overlay (shows AI-generated content reel) */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover opacity-[0.07]"
        style={{ zIndex: 1, filter: 'blur(2px) saturate(0.5)' }}
        autoPlay
        muted
        loop
        playsInline
        poster=""
      >
        {/* Can be populated with a showcase reel later */}
      </video>

      {/* Vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 2,
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(3,7,18,0.8) 100%)',
        }}
      />

      {/* Content */}
      <div
        className="relative flex flex-col items-center justify-center min-h-screen px-4"
        style={{ zIndex: 10 }}
      >
        {/* Logo / Brand */}
        <div
          className="mb-8 text-center"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(-20px)',
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Glowing icon */}
          <div className="relative inline-flex items-center justify-center mb-4">
            <div
              className="absolute w-20 h-20 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(34, 197, 94, 0.3) 0%, transparent 70%)',
                animation: 'pulse 3s ease-in-out infinite',
              }}
            />
            <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-dash-400/20 to-dash-600/20 border border-dash-500/30 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-7 h-7 text-dash-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            RAW <span className="text-dash-400">Studio</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2 font-light tracking-wide">
            AI-Powered Creative Suite
          </p>
        </div>

        {/* Auth Card — Glassmorphic */}
        <div
          className="w-full max-w-sm"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0) scale(1)' : 'translateY(30px) scale(0.95)',
            transition: 'all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.15s',
          }}
        >
          <div
            className="rounded-2xl border border-white/[0.06] overflow-hidden"
            style={{
              background: 'rgba(10, 15, 20, 0.7)',
              backdropFilter: 'blur(40px) saturate(1.2)',
              boxShadow: '0 0 80px rgba(34, 197, 94, 0.05), 0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
            }}
          >
            {/* Tab bar */}
            <div className="flex border-b border-white/[0.05]">
              {(['signIn', 'signUp'] as AuthTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); clearError(); setSuccessMessage(''); }}
                  className="flex-1 relative py-3.5 text-sm font-medium transition-colors"
                  style={{
                    color: activeTab === tab ? '#86efac' : '#6b7280',
                  }}
                >
                  {tab === 'signIn' ? 'Sign In' : 'Create Account'}
                  {activeTab === tab && (
                    <div
                      className="absolute bottom-0 left-1/2 h-[2px] bg-dash-400 rounded-full"
                      style={{
                        width: '40%',
                        transform: 'translateX(-50%)',
                        boxShadow: '0 0 10px rgba(134, 239, 172, 0.5)',
                      }}
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-5">
              {/* Google Sign In — Primary action */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="text-white/90">Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-[11px] text-gray-600 uppercase tracking-widest font-medium">or</span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              {/* Email/Password form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <input
                    type="email"
                    className="w-full rounded-xl py-3 px-4 text-sm text-white outline-none transition-all placeholder:text-gray-600 font-sans"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(134, 239, 172, 0.3)';
                      e.target.style.boxShadow = error ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(134, 239, 172, 0.05)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.06)';
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError(); }}
                    disabled={loading}
                  />
                </div>

                <div className="relative">
                  <input
                    type={isPasswordVisible ? 'text' : 'password'}
                    className="w-full rounded-xl py-3 px-4 pr-11 text-sm text-white outline-none transition-all placeholder:text-gray-600 font-sans"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(134, 239, 172, 0.3)';
                      e.target.style.boxShadow = error ? '0 0 0 3px rgba(239,68,68,0.1)' : '0 0 0 3px rgba(134, 239, 172, 0.05)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.06)';
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError(); }}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                    tabIndex={-1}
                  >
                    {isPasswordVisible ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>

                {/* Error message */}
                {error && (
                  <div
                    className="flex items-center gap-2 text-xs text-red-400 px-1"
                    style={{ animation: 'fadeSlideIn 0.3s ease' }}
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                {/* Success message */}
                {successMessage && (
                  <div
                    className="flex items-center gap-2 text-xs text-dash-400 px-1"
                    style={{ animation: 'fadeSlideIn 0.3s ease' }}
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    background: loading ? 'rgba(34, 197, 94, 0.3)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    color: '#052e16',
                    boxShadow: loading ? 'none' : '0 0 20px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}
                >
                  {loading && (
                    <div className="w-4 h-4 border-2 border-green-900 border-t-transparent rounded-full animate-spin" />
                  )}
                  {activeTab === 'signIn'
                    ? (loading ? 'Signing in...' : 'Sign In')
                    : (loading ? 'Creating account...' : 'Create Account')
                  }
                </button>
              </form>

              {/* Footer hint */}
              <p className="text-center text-[11px] text-gray-600 pt-1">
                {activeTab === 'signIn' ? (
                  <>Don't have an account?{' '}
                    <button onClick={() => { setActiveTab('signUp'); clearError(); }} className="text-dash-500 hover:text-dash-400 transition-colors">
                      Create one
                    </button>
                  </>
                ) : (
                  <>Already have an account?{' '}
                    <button onClick={() => { setActiveTab('signIn'); clearError(); }} className="text-dash-500 hover:text-dash-400 transition-colors">
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Subtle glow under card */}
          <div
            className="mx-auto mt-1"
            style={{
              width: '60%',
              height: '40px',
              background: 'radial-gradient(ellipse, rgba(34, 197, 94, 0.08) 0%, transparent 70%)',
              filter: 'blur(20px)',
            }}
          />
        </div>

        {/* Bottom tagline */}
        <div
          className="mt-8 text-center"
          style={{
            opacity: mounted ? 1 : 0,
            transition: 'opacity 1.2s ease 0.5s',
          }}
        >
          <p className="text-[11px] text-gray-700 tracking-wide">
            Generate · Edit · Interpolate · Create
          </p>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 0.2; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default AuthPage;
