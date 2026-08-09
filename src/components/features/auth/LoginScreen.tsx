import React, { useState, useEffect } from 'react';
import { Mail, Lock, LogIn, Eye, EyeOff, UserPlus } from 'lucide-react';
import { User } from '../../../types/index';
import AccountRequest from './AccountRequest';
import { useAuth } from '../../../contexts/AuthContext';

interface LoginScreenProps {
  usersList: User[];
  onLoginSuccess: (email: string, user: User) => void;
}

export default function LoginScreen({ usersList, onLoginSuccess }: LoginScreenProps) {
  const { login: authLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAccountRequest, setShowAccountRequest] = useState(false);
  const [sealAnimated, setSealAnimated] = useState(false);
  const [textAnimated, setTextAnimated] = useState(false);
  const [cardAnimated, setCardAnimated] = useState(false);

  useEffect(() => {
    // Seal animation sequence
    const sealTimer = setTimeout(() => setSealAnimated(true), 100);
    const textTimer = setTimeout(() => setTextAnimated(true), 600);
    const cardTimer = setTimeout(() => setCardAnimated(true), 750);
    
    return () => {
      clearTimeout(sealTimer);
      clearTimeout(textTimer);
      clearTimeout(cardTimer);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setError('Please enter email and password');
      return;
    }

    setIsLoading(true);

    try {
      // Must go through AuthContext so isAuthenticated flips and useDatabase loads data.
      const user = await authLogin(trimmedEmail, password);
      onLoginSuccess(user.Email, user);
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setIsLoading(false);
    }
  };

  if (showAccountRequest) {
    return (
      <AccountRequest
        onBackToLogin={() => setShowAccountRequest(false)}
        onRequestSubmitted={() => {
          setShowAccountRequest(false);
        }}
      />
    );
  }

  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  return (
    <div 
      className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 relative overflow-hidden"
      style={{ 
        backgroundColor: '#14161C',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      {/* Subtle animated background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(201, 161, 93, 0.03) 0%, transparent 50%)',
          animation: prefersReducedMotion ? 'none' : 'pulse 8s ease-in-out infinite'
        }}
      />
      
      {/* Grain texture overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E")',
        }}
      />

      <div className="w-full max-w-[440px] relative z-10">
        {/* Logo/Brand Section with seal animation */}
        <div className="text-center mb-8">
          <div 
            className="relative inline-block mb-6"
            style={{
              transform: prefersReducedMotion ? 'none' : sealAnimated ? 'scale(1) rotate(0deg)' : 'scale(1.1) rotate(-8deg)',
              transition: prefersReducedMotion ? 'none' : 'transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            {/* Circular monogram seal */}
            <div 
              className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: '#000000',
                border: '2px solid #3A3D47'
              }}
            >
              <img 
                src="/pw-logo.jpg" 
                alt="PW Monogram" 
                className="w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-full"
              />
            </div>
            
            {/* Ink-spread glow effect */}
            {sealAnimated && !prefersReducedMotion && (
              <div 
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(201, 161, 93, 0.4) 0%, transparent 70%)',
                  animation: 'glowPulse 600ms ease-out forwards'
                }}
              />
            )}
          </div>

          <div 
            className="space-y-2"
            style={{
              opacity: textAnimated ? 1 : 0,
              transform: textAnimated ? 'translateY(0)' : 'translateY(12px)',
              transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease-out, transform 400ms ease-out'
            }}
          >
            <h1 
              className="text-4xl sm:text-5xl font-semibold tracking-tight"
              style={{ 
                color: '#F4F2ED',
                fontFamily: 'Fraunces, serif'
              }}
            >
              PMS
            </h1>
            <p 
              className="text-sm tracking-wide"
              style={{ color: '#9A9DA6' }}
            >
              Project Management System
            </p>
          </div>
        </div>

        {/* Login Card */}
        <div 
          className="rounded-2xl p-12 space-y-6"
          style={{
            backgroundColor: 'rgba(42, 45, 54, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid #3A3D47',
            opacity: cardAnimated ? 1 : 0,
            transform: cardAnimated ? 'translateY(0)' : 'translateY(12px)',
            transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease-out, transform 400ms ease-out'
          }}
        >
          <div className="space-y-1">
            <h2 
              className="text-2xl font-medium"
              style={{ 
                color: '#F4F2ED',
                fontFamily: 'Fraunces, serif'
              }}
            >
              Welcome back
            </h2>
            <p 
              className="text-sm"
              style={{ color: '#9A9DA6' }}
            >
              Enter your credentials to access your workspace
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label 
                className="block text-xs font-medium tracking-wider uppercase"
                style={{ color: '#9A9DA6', fontFamily: 'Inter, sans-serif' }}
              >
                Email Address
              </label>
              <div className="relative group">
                <Mail 
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                  size={18}
                  style={{ color: '#9A9DA6' }}
                />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  autoComplete="email"
                  className="w-full rounded-lg py-3.5 pl-12 pr-4 transition-all duration-200 text-base"
                  style={{
                    backgroundColor: '#1C1E25',
                    border: '1px solid #3A3D47',
                    color: '#F4F2ED',
                    fontFamily: 'Inter, sans-serif'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C9A15D';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 161, 93, 0.1)';
                    e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #C9A15D; transition: color 200ms;');
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#3A3D47';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #9A9DA6; transition: color 200ms;');
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label 
                className="block text-xs font-medium tracking-wider uppercase"
                style={{ color: '#9A9DA6', fontFamily: 'Inter, sans-serif' }}
              >
                Password
              </label>
              <div className="relative group">
                <Lock 
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                  size={18}
                  style={{ color: '#9A9DA6' }}
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg py-3.5 pl-12 pr-12 transition-all duration-200 text-base"
                  style={{
                    backgroundColor: '#1C1E25',
                    border: '1px solid #3A3D47',
                    color: '#F4F2ED',
                    fontFamily: 'Inter, sans-serif'
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#C9A15D';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 161, 93, 0.1)';
                    e.currentTarget.parentElement.querySelector('svg')?.setAttribute('style', 'color: #C9A15D; transition: color 200ms;');
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#3A3D47';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.parentElement.querySelector('svg')?.setAttribute('style', 'color: #9A9DA6; transition: color 200ms;');
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 transition-colors p-1"
                  style={{ color: '#9A9DA6' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#F4F2ED'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#9A9DA6'}
                >
                  {showPassword ? <EyeOff size={18} className="shrink-0" /> : <Eye size={18} className="shrink-0" />}
                </button>
              </div>
            </div>

            {error && (
              <div 
                className="p-4 rounded-lg text-sm flex items-center gap-2"
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.2)',
                  color: '#f87171'
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg py-3.5 font-semibold flex items-center justify-center gap-2 transition-all duration-200 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#C9A15D',
                color: '#14161C',
                fontFamily: 'Inter, sans-serif'
              }}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.filter = 'brightness(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.filter = 'brightness(1)';
              }}
            >
              {isLoading ? (
                <>
                  <div 
                    className="w-5 h-5 border-2 rounded-full animate-spin shrink-0"
                    style={{
                      borderColor: 'rgba(20, 22, 28, 0.3)',
                      borderTopColor: '#14161C'
                    }}
                  ></div>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={18} className="shrink-0" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div 
            className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{ borderTop: '1px solid #3A3D47' }}
          >
            <p 
              className="text-xs text-center sm:text-left"
              style={{ color: '#9A9DA6', fontFamily: 'Inter, sans-serif' }}
            >
              Secure access powered by PMS
            </p>
            <button
              onClick={() => setShowAccountRequest(true)}
              className="text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
              style={{
                color: '#C9A15D',
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#D4B06E'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#C9A15D'}
            >
              <UserPlus size={14} className="shrink-0" />
              Request Account
            </button>
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes glowPulse {
          0% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
}
