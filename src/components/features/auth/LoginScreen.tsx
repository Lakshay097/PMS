import React, { useState } from 'react';
import { Mail, Lock, LogIn, Shield, Zap, UserPlus, Eye, EyeOff } from 'lucide-react';
import { User } from '../../../types/index';
import AccountRequest from './AccountRequest';
import { login, mapUserResponseToUser } from '../../../api/auth';

interface LoginScreenProps {
  usersList: User[];
  onLoginSuccess: (email: string, user: User) => void;
}

export default function LoginScreen({ usersList, onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAccountRequest, setShowAccountRequest] = useState(false);

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
      const data = await login({ email: trimmedEmail, password });

      const user = mapUserResponseToUser(data.user);
      localStorage.setItem('PMS_auth_token', data.token);
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('PMS_user', JSON.stringify(user));
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

  return (
    <div className="auth-page min-h-screen min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-start sm:items-center justify-center font-sans px-4 sm:px-6 py-6 sm:py-12 relative overflow-x-hidden overflow-y-auto">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-48 sm:w-80 h-48 sm:h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-48 sm:w-80 h-48 sm:h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-96 h-64 sm:h-96 bg-cyan-500/5 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md space-y-6 sm:space-y-8 relative z-10 my-auto">
        {/* Logo/Brand Section */}
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg shadow-blue-500/25">
            <Shield className="text-white shrink-0" size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              PMS
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">Project Management System</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl">
          <div className="space-y-1 sm:space-y-2">
            <h2 className="text-xl sm:text-2xl font-semibold text-white">Welcome back</h2>
            <p className="text-slate-400 text-xs sm:text-sm">Enter your credentials to access your workspace</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-10 sm:pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="auth-icon-btn absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={18} className="shrink-0" /> : <Eye size={18} className="shrink-0" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-2">
                <Zap size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 sm:py-3.5 font-semibold flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 text-sm sm:text-base"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"></div>
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
          <div className="pt-4 border-t border-slate-700/50">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
              <p className="text-slate-500 text-xs text-center sm:text-left">
                Secure access powered by PMS
              </p>
              <button
                onClick={() => setShowAccountRequest(true)}
                className="text-blue-400 hover:text-blue-300 text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <UserPlus size={14} className="shrink-0" />
                Request Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
