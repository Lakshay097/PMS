import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Building2, ArrowLeft, CheckCircle, X, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { requestAccount } from '../../../api/auth';
import { api } from '../../../api/client';

interface PublicTeam {
  TeamID: string;
  TeamName: string;
}

interface AccountRequestProps {
  onBackToLogin: () => void;
  onRequestSubmitted: () => void;
}

export default function AccountRequest({ onBackToLogin, onRequestSubmitted }: AccountRequestProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    managerEmail: '',
  });
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [publicTeams, setPublicTeams] = useState<PublicTeam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [sealAnimated, setSealAnimated] = useState(false);
  const [textAnimated, setTextAnimated] = useState(false);
  const [cardAnimated, setCardAnimated] = useState(false);
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);

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

  // Fetch active teams for the dropdown on mount — public endpoint, no auth needed
  useEffect(() => {
    api.get<{ success: boolean; teams: PublicTeam[] }>('/teams/public', { skipAuth: true })
      .then(res => { if (res.success) setPublicTeams(res.teams); })
      .catch(() => { /* non-fatal — dropdown just stays empty */ });
  }, []);

  const calculatePasswordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return Math.min(strength, 3);
  };

  const passwordStrength = calculatePasswordStrength(formData.password);

  const handleContinue = () => {
    setError(null);
    
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.password) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setCurrentStep(2);
  };

  const handleBack = () => {
    setCurrentStep(1);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.managerEmail.trim()) {
      setError('Manager email is required');
      return;
    }

    setIsLoading(true);

    try {
      await requestAccount({
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        managerEmail: formData.managerEmail.trim().toLowerCase(),
        teamId: selectedTeams.length > 0 ? selectedTeams[0] : undefined,
      });

      setSuccess(true);
      setTimeout(() => {
        onRequestSubmitted();
      }, 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit account request');
      setIsLoading(false);
    }
  };

  const toggleTeam = (teamId: string) => {
    setSelectedTeams(prev => 
      prev.includes(teamId) 
        ? prev.filter(t => t !== teamId)
        : [...prev, teamId]
    );
  };

  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  if (success) {
    return (
      <div 
        className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 relative overflow-hidden"
        style={{ 
          backgroundColor: '#0c0c10',
          fontFamily: 'Inter, sans-serif'
        }}
      >
        {/* Subtle animated background */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(201, 169, 97, 0.08) 0%, transparent 50%)',
            animation: prefersReducedMotion ? 'none' : 'pulse 8s ease-in-out infinite'
          }}
        />
        
        {/* Film-grain texture overlay */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E")',
          }}
        />

        <div className="w-full max-w-md relative z-10">
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
                  backgroundColor: 'radial-gradient(circle, #1a1a21 0%, #0c0c10 100%)',
                  border: '1.5px solid rgba(201, 169, 97, 0.3)',
                  boxShadow: '0 0 30px rgba(201, 169, 97, 0.1)'
                }}
              >
                <span 
                  className="text-2xl sm:text-3xl font-semibold"
                  style={{ 
                    color: '#e6cd94',
                    fontFamily: 'Cormorant Garamond, serif'
                  }}
                >
                  PW
                </span>
              </div>
              
              {/* Breathing/pulse animation */}
              {sealAnimated && !prefersReducedMotion && (
                <div 
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    border: '1.5px solid rgba(201, 169, 97, 0.3)',
                    animation: 'breathingPulse 3s ease-in-out infinite'
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
                  color: '#efece5',
                  fontFamily: 'Cormorant Garamond, serif'
                }}
              >
                PMS
              </h1>
              <p 
                className="text-sm tracking-wide"
                style={{ color: '#8c8c96' }}
              >
                Project Management System
              </p>
            </div>
          </div>

          {/* Success Card */}
          <div 
            className="rounded-2xl p-8 sm:p-12 space-y-6"
            style={{
              backgroundColor: 'linear-gradient(145deg, #1a1a21 0%, #17171d 100%)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
              opacity: cardAnimated ? 1 : 0,
              transform: cardAnimated ? 'translateY(0)' : 'translateY(12px)',
              transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease-out, transform 400ms ease-out'
            }}
          >
            <div className="text-center space-y-4">
              <div 
                className="inline-flex items-center justify-center w-16 h-16 rounded-full"
                style={{
                  backgroundColor: 'rgba(143, 174, 134, 0.1)',
                  border: '1px solid rgba(143, 174, 134, 0.3)'
                }}
              >
                <CheckCircle style={{ color: '#8fae86' }} size={32} />
              </div>
              
              <div className="space-y-2">
                <h2 
                  className="text-2xl font-medium"
                  style={{ 
                    color: '#efece5',
                    fontFamily: 'Cormorant Garamond, serif'
                  }}
                >
                  Request Submitted
                </h2>
                <p 
                  className="text-sm leading-relaxed"
                  style={{ color: '#8c8c96' }}
                >
                  Your account request has been submitted successfully. Please contact the Administrator of PMS to approve your request fast.
                </p>
              </div>
            </div>

            <button
              onClick={onBackToLogin}
              className="w-full rounded-lg py-3.5 font-medium flex items-center justify-center gap-2 transition-all duration-200 text-base"
              style={{
                backgroundColor: 'transparent',
                color: '#c9a961',
                border: '1px solid rgba(201, 169, 97, 0.3)',
                fontFamily: 'Inter, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(201, 169, 97, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(201, 169, 97, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(201, 169, 97, 0.3)';
              }}
            >
              <ArrowLeft size={18} className="shrink-0" />
              Back to Login
            </button>
          </div>
        </div>

        {/* Animation keyframes */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.05); }
          }
          @keyframes breathingPulse {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen min-h-[100dvh] flex items-center justify-center px-4 py-8 sm:py-12 relative overflow-hidden"
      style={{ 
        backgroundColor: '#0c0c10',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      {/* Subtle animated background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 0%, rgba(201, 169, 97, 0.08) 0%, transparent 50%)',
          animation: prefersReducedMotion ? 'none' : 'pulse 8s ease-in-out infinite'
        }}
      />
      
      {/* Film-grain texture overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22/%3E%3C/svg%3E")',
        }}
      />

      <div className="w-full max-w-md relative z-10">
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
                backgroundColor: 'radial-gradient(circle, #1a1a21 0%, #0c0c10 100%)',
                border: '1.5px solid rgba(201, 169, 97, 0.3)',
                boxShadow: '0 0 30px rgba(201, 169, 97, 0.1)'
              }}
            >
              <span 
                className="text-2xl sm:text-3xl font-semibold"
                style={{ 
                  color: '#e6cd94',
                  fontFamily: 'Cormorant Garamond, serif'
                }}
              >
                PW
              </span>
            </div>
            
            {/* Breathing/pulse animation */}
            {sealAnimated && !prefersReducedMotion && (
              <div 
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  border: '1.5px solid rgba(201, 169, 97, 0.3)',
                  animation: 'breathingPulse 3s ease-in-out infinite'
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
                color: '#efece5',
                fontFamily: 'Cormorant Garamond, serif'
              }}
            >
              PMS
            </h1>
            <p 
              className="text-sm tracking-wide"
              style={{ color: '#8c8c96' }}
            >
              Project Management System
            </p>
          </div>
        </div>

        {/* Account Request Card */}
        <div 
          className="rounded-2xl p-6 sm:p-8 space-y-6"
          style={{
            backgroundColor: 'linear-gradient(145deg, #1a1a21 0%, #17171d 100%)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
            opacity: cardAnimated ? 1 : 0,
            transform: cardAnimated ? 'translateY(0)' : 'translateY(12px)',
            transition: prefersReducedMotion ? 'none' : 'opacity 400ms ease-out, transform 400ms ease-out'
          }}
        >
          {/* Hairline gold gradient across top edge */}
          <div 
            className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(201, 169, 97, 0.5) 50%, transparent 100%)'
            }}
          />

          <div className="space-y-1">
            <h2 
              className="text-2xl font-medium"
              style={{ 
                color: '#efece5',
                fontFamily: 'Cormorant Garamond, serif'
              }}
            >
              Request Account
            </h2>
            <p 
              className="text-sm"
              style={{ color: '#8c8c96' }}
            >
              Submit your details for administrator review. You'll receive access once approved.
            </p>
          </div>

          {/* Step Progress Indicator */}
          <div className="flex items-center justify-between py-4">
            {/* Step 1 */}
            <div className="flex items-center">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-600"
                style={{
                  backgroundColor: currentStep >= 1 ? '#c9a961' : 'transparent',
                  border: currentStep >= 1 ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                  color: currentStep >= 1 ? '#0c0c10' : '#8c8c96',
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                {currentStep > 1 ? '✓' : '1'}
              </div>
              <span 
                className="ml-2 text-xs hidden sm:block"
                style={{ 
                  color: currentStep >= 1 ? '#efece5' : '#8c8c96',
                  fontFamily: 'Inter, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Details
              </span>
            </div>

            {/* Thread line */}
            <div 
              className="flex-1 mx-4 h-px transition-all duration-600"
              style={{
                background: `linear-gradient(90deg, ${currentStep >= 2 ? '#c9a961' : 'rgba(255, 255, 255, 0.1)'} 0%, ${currentStep >= 2 ? '#c9a961' : 'rgba(255, 255, 255, 0.1)'} ${currentStep === 2 ? '100%' : '0%'}, rgba(255, 255, 255, 0.1) ${currentStep === 2 ? '100%' : '0%'})`
              }}
            />

            {/* Step 2 */}
            <div className="flex items-center">
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-600"
                style={{
                  backgroundColor: currentStep >= 2 ? '#c9a961' : 'transparent',
                  border: currentStep >= 2 ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
                  color: currentStep >= 2 ? '#0c0c10' : '#8c8c96',
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                {currentStep > 2 ? '✓' : '2'}
              </div>
              <span 
                className="ml-2 text-xs hidden sm:block"
                style={{ 
                  color: currentStep >= 2 ? '#efece5' : '#8c8c96',
                  fontFamily: 'Inter, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                Team
              </span>
            </div>
          </div>

          {error && (
            <div 
              className="p-4 rounded-lg text-sm flex items-center gap-2"
              style={{
                backgroundColor: 'rgba(201, 127, 111, 0.1)',
                border: '1px solid rgba(201, 127, 111, 0.2)',
                color: '#c97f6f'
              }}
            >
              <X size={16} />
              {error}
            </div>
          )}

          {/* Step 1: Details */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="space-y-2">
                <label 
                  className="block text-xs font-medium tracking-wider uppercase"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Full Name
                </label>
                <div className="relative group">
                  <User 
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                    size={18}
                    style={{ color: '#8c8c96', strokeWidth: '1.6px' }}
                  />
                  <input
                    type="text"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    disabled={isLoading}
                    required
                    className="w-full rounded-lg py-3.5 pl-12 pr-4 transition-all duration-200 text-base outline-none"
                    style={{
                      backgroundColor: '#1f1f27',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      color: '#efece5',
                      fontFamily: 'Inter, sans-serif',
                      borderRadius: '9px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#c9a961';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 169, 97, 0.15)';
                      e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #c9a961; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #8c8c96; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label 
                  className="block text-xs font-medium tracking-wider uppercase"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Email Address
                </label>
                <div className="relative group">
                  <Mail 
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                    size={18}
                    style={{ color: '#8c8c96', strokeWidth: '1.6px' }}
                  />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={isLoading}
                    required
                    className="w-full rounded-lg py-3.5 pl-12 pr-4 transition-all duration-200 text-base outline-none"
                    style={{
                      backgroundColor: '#1f1f27',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      color: '#efece5',
                      fontFamily: 'Inter, sans-serif',
                      borderRadius: '9px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#c9a961';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 169, 97, 0.15)';
                      e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #c9a961; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #8c8c96; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label 
                  className="block text-xs font-medium tracking-wider uppercase"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Password
                </label>
                <div className="relative group">
                  <Lock 
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                    size={18}
                    style={{ color: '#8c8c96', strokeWidth: '1.6px' }}
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    disabled={isLoading}
                    required
                    minLength={6}
                    className="w-full rounded-lg py-3.5 pl-12 pr-12 transition-all duration-200 text-base outline-none"
                    style={{
                      backgroundColor: '#1f1f27',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      color: '#efece5',
                      fontFamily: 'Inter, sans-serif',
                      borderRadius: '9px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#c9a961';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 169, 97, 0.15)';
                      e.currentTarget.parentElement.querySelector('svg')?.setAttribute('style', 'color: #c9a961; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.parentElement.querySelector('svg')?.setAttribute('style', 'color: #8c8c96; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 transition-colors p-1"
                    style={{ color: '#8c8c96' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#efece5'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#8c8c96'}
                  >
                    {showPassword ? <EyeOff size={18} className="shrink-0" /> : <Eye size={18} className="shrink-0" />}
                  </button>
                </div>
                {/* Password strength meter */}
                {formData.password && (
                  <div className="flex gap-1 mt-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor: i < passwordStrength 
                            ? passwordStrength === 1 ? '#c97f6f' 
                            : passwordStrength === 2 ? '#e6cd94' 
                            : '#8fae86'
                            : 'rgba(255, 255, 255, 0.1)'
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label 
                  className="block text-xs font-medium tracking-wider uppercase"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Confirm Password
                </label>
                <div className="relative group">
                  <Lock 
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                    size={18}
                    style={{ color: '#8c8c96', strokeWidth: '1.6px' }}
                  />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    disabled={isLoading}
                    required
                    minLength={6}
                    className="w-full rounded-lg py-3.5 pl-12 pr-12 transition-all duration-200 text-base outline-none"
                    style={{
                      backgroundColor: '#1f1f27',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      color: '#efece5',
                      fontFamily: 'Inter, sans-serif',
                      borderRadius: '9px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#c9a961';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 169, 97, 0.15)';
                      e.currentTarget.parentElement.querySelector('svg')?.setAttribute('style', 'color: #c9a961; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.parentElement.querySelector('svg')?.setAttribute('style', 'color: #8c8c96; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 transition-colors p-1"
                    style={{ color: '#8c8c96' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#efece5'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#8c8c96'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} className="shrink-0" /> : <Eye size={18} className="shrink-0" />}
                  </button>
                </div>
                {formData.confirmPassword && (
                  <p 
                    className="text-xs mt-1"
                    style={{ 
                      color: formData.password === formData.confirmPassword ? '#8fae86' : '#c97f6f',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  >
                    {formData.password === formData.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleContinue}
                className="w-full rounded-lg py-3.5 font-medium transition-all duration-200 text-base"
                style={{
                  backgroundColor: '#c9a961',
                  color: '#0c0c10',
                  fontFamily: 'Inter, sans-serif',
                  borderRadius: '9px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(201, 169, 97, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Team */}
          {currentStep === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label 
                  className="block text-xs font-medium tracking-wider uppercase"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Manager Email
                </label>
                <div className="relative group">
                  <Mail 
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors duration-200 shrink-0" 
                    size={18}
                    style={{ color: '#8c8c96', strokeWidth: '1.6px' }}
                  />
                  <input
                    type="email"
                    placeholder="manager@company.com"
                    value={formData.managerEmail}
                    onChange={(e) => setFormData({ ...formData, managerEmail: e.target.value })}
                    disabled={isLoading}
                    required
                    className="w-full rounded-lg py-3.5 pl-12 pr-4 transition-all duration-200 text-base outline-none"
                    style={{
                      backgroundColor: '#1f1f27',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      color: '#efece5',
                      fontFamily: 'Inter, sans-serif',
                      borderRadius: '9px'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#c9a961';
                      e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201, 169, 97, 0.15)';
                      e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #c9a961; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.previousElementSibling?.setAttribute('style', 'color: #8c8c96; transition: color 200ms; stroke-width: 1.6px;');
                    }}
                  />
                </div>
                <p 
                  className="text-xs mt-1"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Enter your direct manager's email. Your initial role is assigned based on your manager's role (Admin manager → Stakeholder, otherwise Sub-stakeholder; adjustable later by an admin).
                </p>
              </div>

              {/* Multi-select team selection */}
              <div className="space-y-2">
                <label 
                  className="block text-xs font-medium tracking-wider uppercase"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Team
                </label>
                <div className="relative">
                  <div 
                    className="relative group min-h-[48px] rounded-lg py-2 pl-4 pr-10 transition-all duration-200 cursor-pointer"
                    style={{
                      backgroundColor: '#1f1f27',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      borderRadius: '9px'
                    }}
                    onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                  >
                    <Building2 
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 shrink-0 pointer-events-none" 
                      size={18}
                      style={{ color: '#8c8c96', strokeWidth: '1.6px' }}
                    />
                    <div className="flex flex-wrap gap-2 ml-6">
                      {selectedTeams.length === 0 ? (
                        <span 
                          className="text-sm"
                          style={{ color: '#5c5c66', fontFamily: 'Inter, sans-serif' }}
                        >
                          No team selected — Admin will assign
                        </span>
                      ) : (
                        selectedTeams.map(teamId => {
                          const team = publicTeams.find(t => t.TeamID === teamId);
                          return team ? (
                            <span
                              key={teamId}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all duration-200"
                              style={{
                                backgroundColor: 'rgba(201, 169, 97, 0.1)',
                                border: '1px solid rgba(201, 169, 97, 0.3)',
                                color: '#e6cd94',
                                fontFamily: 'Inter, sans-serif'
                              }}
                            >
                              {team.TeamName}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTeam(teamId);
                                }}
                                className="hover:text-red-400 transition-colors"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ) : null;
                        })
                      )}
                    </div>
                    <ChevronDown 
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none shrink-0 transition-transform duration-200" 
                      size={16}
                      style={{ 
                        color: '#8c8c96',
                        transform: isTeamDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                      }}
                    />
                  </div>

                  {/* Dropdown */}
                  {isTeamDropdownOpen && (
                    <div 
                      className="absolute z-50 w-full mt-2 rounded-lg p-2 space-y-1 shadow-xl"
                      style={{
                        backgroundColor: '#1a1a21',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        maxHeight: '200px',
                        overflowY: 'auto'
                      }}
                    >
                      {publicTeams.length === 0 ? (
                        <p 
                          className="text-sm p-2"
                          style={{ color: '#5c5c66', fontFamily: 'Inter, sans-serif' }}
                        >
                          No teams available
                        </p>
                      ) : (
                        publicTeams.map(team => (
                          <label
                            key={team.TeamID}
                            className="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors hover:bg-white/5"
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedTeams.includes(team.TeamID)}
                              onChange={() => toggleTeam(team.TeamID)}
                              className="w-4 h-4 rounded"
                              style={{
                                accentColor: '#c9a961',
                                backgroundColor: '#1f1f27',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                              }}
                            />
                            <span 
                              className="text-sm"
                              style={{ color: '#efece5' }}
                            >
                              {team.TeamName}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <p 
                  className="text-xs mt-1"
                  style={{ color: '#8c8c96', fontFamily: 'Inter, sans-serif' }}
                >
                  Select one or more teams. If left blank, an administrator will assign your team after approval.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex-1 rounded-lg py-3.5 font-medium transition-all duration-200 text-base"
                  style={{
                    backgroundColor: 'transparent',
                    color: '#c9a961',
                    border: '1px solid rgba(201, 169, 97, 0.3)',
                    fontFamily: 'Inter, sans-serif',
                    borderRadius: '9px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(201, 169, 97, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 rounded-lg py-3.5 font-medium transition-all duration-200 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: '#c9a961',
                    color: '#0c0c10',
                    fontFamily: 'Inter, sans-serif',
                    borderRadius: '9px'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(201, 169, 97, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {isLoading ? (
                    <>
                      <div 
                        className="w-5 h-5 border-2 rounded-full animate-spin shrink-0 inline-block"
                        style={{
                          borderColor: 'rgba(12, 12, 16, 0.3)',
                          borderTopColor: '#0c0c10'
                        }}
                      ></div>
                      Submitting...
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Footer */}
          <div 
            className="pt-4 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255, 255, 255, 0.07)' }}
          >
            <button
              onClick={onBackToLogin}
              className="text-xs font-medium flex items-center gap-1 transition-colors"
              style={{
                color: '#c9a961',
                fontFamily: 'Inter, sans-serif',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#e6cd94'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#c9a961'}
            >
              <ArrowLeft size={14} className="shrink-0" />
              Back to Login
            </button>
            <p 
              className="text-xs"
              style={{ color: '#5c5c66', fontFamily: 'Inter, sans-serif' }}
            >
              Secure access powered by PMS
            </p>
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes breathingPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
