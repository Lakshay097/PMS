import React, { useState } from 'react';
import { Mail, Lock, User, Building2, ArrowLeft, CheckCircle, Clock, X } from 'lucide-react';
import { requestAccount } from '../../../api/auth';

interface AccountRequestProps {
  onBackToLogin: () => void;
  onRequestSubmitted: () => void;
}

export default function AccountRequest({ onBackToLogin, onRequestSubmitted }: AccountRequestProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '123456',
    confirmPassword: '123456',
    managerEmail: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.fullName.trim() || !formData.email.trim()) {
      setError('Please fill in all required fields');
      return;
    }

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
      });

      setSuccess(true);
      setTimeout(() => {
        onRequestSubmitted();
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to submit account request');
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page min-h-screen min-h-[100dvh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-start sm:items-center justify-center font-sans px-4 sm:px-6 py-6 sm:py-12 relative overflow-x-hidden overflow-y-auto">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-48 sm:w-80 h-48 sm:h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-48 sm:w-80 h-48 sm:h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="w-full max-w-md relative z-10 my-auto">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-green-500/20 rounded-full">
              <CheckCircle className="text-green-400 shrink-0" size={28} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-white">Request Submitted</h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-2">
                Your account request has been submitted for approval. An administrator will review your request and activate your account.
              </p>
            </div>
            <button
              onClick={onBackToLogin}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-3 font-medium transition-colors text-sm sm:text-base"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
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

      <div className="w-full max-w-md space-y-4 sm:space-y-6 relative z-10 my-auto">
        {/* Back Button */}
        <button
          onClick={onBackToLogin}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm sticky top-0 z-20 py-1"
        >
          <ArrowLeft size={18} className="shrink-0" />
          Back to Login
        </button>

        {/* Logo/Brand Section */}
        <div className="text-center space-y-3 sm:space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl shadow-lg shadow-blue-500/25">
            <User className="text-white shrink-0" size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              Request Account
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">Submit your account request for admin approval</p>
          </div>
        </div>

        {/* Account Request Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl max-h-[calc(100dvh-8rem)] sm:max-h-none overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Full Name</label>
              <div className="relative group">
                <User className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  disabled={isLoading}
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={isLoading}
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Password (Default: 123456)</label>
              <div className="relative group">
                <Lock className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={isLoading}
                  required
                  minLength={6}
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Confirm Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  disabled={isLoading}
                  required
                  minLength={6}
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">Manager Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-slate-500 group-focus-within:text-blue-400 transition-colors shrink-0" size={18} />
                <input
                  type="email"
                  placeholder="manager@company.com"
                  value={formData.managerEmail}
                  onChange={(e) => setFormData({ ...formData, managerEmail: e.target.value })}
                  disabled={isLoading}
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 text-white rounded-xl py-3 sm:py-3.5 pl-10 sm:pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder-slate-500 text-base sm:text-sm"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter your direct manager's email. Your initial role is assigned based on your manager's role (Admin manager = Stakeholder, otherwise Sub-stakeholder), but can be updated by an administrator at any time.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm flex items-center gap-2">
                <X size={16} />
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
                  Submitting...
                </>
              ) : (
                <>
                  <Clock size={18} className="shrink-0" />
                  Submit Request
                </>
              )}
            </button>
          </form>

          {/* Info Section */}
          <div className="pt-4 border-t border-slate-700/50">
            <p className="text-center text-slate-500 text-xs">
              Your request will be reviewed by administrators. You'll be notified once your account is approved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
