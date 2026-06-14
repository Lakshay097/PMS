import React, { useState } from 'react';
import { Grid3x3, Mail, Lock, ArrowRight } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => void;
  onForgotPassword?: () => void;
  onRequestAccess?: () => void;
}

export default function LoginScreen({ onLogin, onForgotPassword, onRequestAccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate login delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    onLogin(email, password);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex">
      {/* Left column - Brand statement */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-blue-600 to-blue-800 p-12 flex-col justify-center">
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <img src="/pw-logo.jpg" alt="PW Logo" className="w-12 h-12 object-contain" />
          </div>
          
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Professional Project Management
          </h1>
          
          <p className="text-lg text-blue-100 mb-6 leading-relaxed">
            Streamline your workflows, track progress, and collaborate seamlessly with your team. 
            Built for modern teams who need clarity and control.
          </p>
          
          <div className="space-y-3 text-blue-100">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm">✓</span>
              </div>
              <span className="text-sm">Real-time task tracking and updates</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm">✓</span>
              </div>
              <span className="text-sm">Automated recurring work schedules</span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm">✓</span>
              </div>
              <span className="text-sm">Role-based views for stakeholders, managers, and admins</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right column - Login card */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <img src="/pw-logo.jpg" alt="PW Logo" className="w-10 h-10 object-contain" />
          </div>

          <div className="bg-surface rounded-xl shadow-lg p-8 border border-[var(--color-border)]">
            {/* Desktop logo */}
            <div className="hidden lg:flex items-center justify-center gap-3 mb-8">
              <img src="/pw-logo.jpg" alt="PW Logo" className="w-12 h-12 object-contain" />
            </div>

            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold text-[#0f172a] mb-2">Welcome back</h2>
              <p className="text-sm text-muted">Sign in to your account to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email field */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#0f172a] mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#0f172a] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Remember me */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                  />
                  <span className="text-sm text-[#0f172a]">Remember me</span>
                </label>
                
                {onForgotPassword && (
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-sm text-[var(--color-accent)] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Request access */}
            {onRequestAccess && (
              <div className="mt-6 text-center">
                <p className="text-sm text-muted">
                  Don't have an account?{' '}
                  <button
                    onClick={onRequestAccess}
                    className="text-[var(--color-accent)] hover:underline font-medium"
                  >
                    Request access
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
