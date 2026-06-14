import React, { useState } from 'react';
import { ClipboardList, Lock, Mail, ChevronRight, AlertOctagon, HelpCircle, UserPlus, CheckCircle2, User as UserIcon } from 'lucide-react';
import { User } from '../types';

interface LoginScreenProps {
  usersList: User[];
  onLoginSuccess: (email: string) => void;
  onRegisterUser?: (newUser: User) => Promise<void>;
}

export default function LoginScreen({ usersList, onLoginSuccess, onRegisterUser }: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Registration form states
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState<'Admin' | 'Stakeholder'>('Stakeholder');
  const [regManagerEmail, setRegManagerEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Auto-generate a default password when opening registration form
  React.useEffect(() => {
    if (isRegistering && !regPassword) {
      setRegPassword('TG-' + Math.floor(1000 + Math.random() * 9000));
    }
  }, [isRegistering, regPassword]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    setIsLoading(true);

    // Simulate database lookup delay
    setTimeout(() => {
      const foundUser = usersList.find(u => u.Email.toLowerCase() === trimmedEmail);
      if (!foundUser) {
        setError('No active user profile matches this email address. Please make sure you are registered in the system.');
        setIsLoading(false);
        return;
      }

      // Enforce password security code check if user has a password set
      const expectedPassword = foundUser.Password;
      if (password && password !== expectedPassword) {
        setError('Incorrect Security Code/Password. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      if (!foundUser.Active) {
        const mgrUser = usersList.find(u => u.Email.toLowerCase() === foundUser.ManagerEmail.toLowerCase());
        if (mgrUser && mgrUser.Role === 'Stakeholder') {
          setError(`Your registration request is pending. It must be accepted by your designated Stakeholder manager (${mgrUser.FullName} - ${mgrUser.Email}) before you can log in.`);
        } else {
          setError('Your account is pending registration approval. An admin must accept your account before you can log in.');
        }
        setIsLoading(false);
        return;
      }

      // If user typed a password, we validate it or allow any input as simple password simulation.
      onLoginSuccess(foundUser.Email);
      setIsLoading(false);
    }, 600);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedName = regFullName.trim();
    const trimmedEmail = regEmail.trim().toLowerCase();
    const trimmedMgrEmail = regManagerEmail.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail) {
      setError('Please complete all the required fields.');
      return;
    }

    // Check if user already exists
    const alreadyExists = usersList.some(u => u.Email.toLowerCase() === trimmedEmail);
    if (alreadyExists) {
      setError('A profile with this email address has already been registered.');
      return;
    }

    setIsLoading(true);

    try {
      // Find selected manager details to determine Role and Team
      const selectedManager = trimmedMgrEmail ? usersList.find(u => u.Email.toLowerCase() === trimmedMgrEmail) : undefined;
      
      // Determine Role: "How to know someone is sub-stakeholder if manager is Stakeholder"
      let calculatedRole: User['Role'] = regRole;
      if (selectedManager && selectedManager.Role === 'Stakeholder') {
        calculatedRole = 'Sub-stakeholder';
      }

      // Set TeamID/Name based on selected manager
      const teamId = selectedManager ? selectedManager.TeamID : (calculatedRole === 'Admin' ? 'T-00' : 'T-01');
      const teamName = selectedManager ? selectedManager.TeamName : (calculatedRole === 'Admin' ? 'Admin Team' : 'Enterprise Sales');

      const newUser: User = {
        UserID: `USR-${Math.floor(1000 + Math.random() * 8999)}`,
        FullName: trimmedName,
        Email: trimmedEmail,
        Role: calculatedRole,
        ManagerEmail: trimmedMgrEmail,
        TeamID: teamId,
        TeamName: teamName,
        Active: false, // Must be accepted/approved to log in
        CanCreateFollowUp: calculatedRole === 'Admin',
        CanCloseTask: calculatedRole === 'Admin',
        CreatedAt: new Date().toISOString(),
        UpdatedAt: new Date().toISOString(),
        Password: regPassword
      };

      if (onRegisterUser) {
        await onRegisterUser(newUser);
      }

      setSuccessMsg('Account created here only for 2 second only');

      // Reset registration form
      setRegFullName('');
      setRegEmail('');
      setRegManagerEmail('');
      setRegPassword('');

      // Back to login after 2 seconds
      setTimeout(() => {
        setIsRegistering(false);
        setSuccessMsg(null);
      }, 2000);

    } catch (err: any) {
      setError(err?.message || 'Failed to complete registration.');
    } finally {
      setIsLoading(false);
    }
  };

  // Get active roles for manager selection
  const validManagers = usersList.filter(u => u.Active && u.Role !== 'Sub-stakeholder');

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center font-sans px-4 relative overflow-hidden">
      {/* Mesh Background Effects */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/10 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-900/15 blur-[150px]" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <img src="/pw-logo.jpg" alt="PW Logo" className="w-16 h-16 object-contain" />
            <h1 className="text-2xl font-black text-white tracking-tight uppercase">
              BE
            </h1>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-[#1E293B]/70 backdrop-blur-md border border-[#334155]/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {!isRegistering ? (
            <>
              {/* LOGIN VIEW */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Identity Verification</h2>
                  <button 
                    onClick={() => {
                      setIsRegistering(true);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider border-none bg-none cursor-pointer p-0"
                  >
                    Need Account? Create One
                  </button>
                </div>
                <p className="text-xs text-slate-400">Secure access to project tasks, progress reports &amp; timeline management.</p>
              </div>

              {successMsg && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl flex items-start gap-2 text-xs leading-relaxed">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Authorized Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Mail size={14} />
                    </div>
                    <input
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="w-full bg-[#0F172A]/90 border border-[#334155] text-slate-100 placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Security Code</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Lock size={14} />
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      className="w-full bg-[#0F172A]/90 border border-[#334155] text-slate-100 placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-start gap-2 text-xs leading-relaxed">
                    <AlertOctagon size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider shadow transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer border-none"
                >
                  <span>{isLoading ? 'Verifying...' : 'Authenticate'}</span>
                  <ChevronRight size={14} />
                </button>
              </form>
            </>
          ) : (
            <>
              {/* REGISTRATION VIEW */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <UserPlus size={16} className="text-blue-400" />
                    <span>Create Account</span>
                  </h2>
                  <button 
                    onClick={() => {
                      setIsRegistering(false);
                      setError(null);
                    }}
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider border-none bg-none cursor-pointer p-0"
                  >
                    Back to Sign In
                  </button>
                </div>
                <p className="text-xs text-slate-400">Register your user profile. Admin or your designated Manager must accept your profile to authorize access.</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <UserIcon size={14} />
                    </div>
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      required
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      disabled={isLoading}
                      className="w-full bg-[#0F172A]/90 border border-[#334155] text-slate-100 placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Mail size={14} />
                    </div>
                    <input
                      type="email"
                      placeholder="jane.doe@example.com"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      disabled={isLoading}
                      className="w-full bg-[#0F172A]/90 border border-[#334155] text-slate-100 placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150"
                    />
                  </div>
                </div>

                {/* Desired / Intent Role */}
                <div className="space-y-1.5 row-role">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Intended Role</label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as 'Admin' | 'Stakeholder')}
                    disabled={isLoading}
                    className="w-full bg-[#0F172A]/90 border border-[#334155] text-slate-100 rounded-xl py-2.5 px-3 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150 cursor-pointer"
                  >
                    <option value="Stakeholder">Stakeholder</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                {/* Designated Manager Email Input */}
                {regRole !== 'Admin' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Designated Manager Email</label>
                      <span className="text-[9px] text-blue-400 font-semibold uppercase tracking-wider">Sub-stakeholder linkage</span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <Mail size={14} />
                      </div>
                      <input
                        type="email"
                        placeholder="manager.email@example.com"
                        value={regManagerEmail}
                        onChange={(e) => setRegManagerEmail(e.target.value)}
                        disabled={isLoading}
                        className="w-full bg-[#0F172A]/90 border border-[#334155] text-slate-100 placeholder-slate-500 rounded-xl py-2.5 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-150"
                      />
                    </div>
                    <p className="text-[9px] text-slate-400 font-sans leading-normal">
                      Enter your manager's email. If your manager is a Stakeholder, you will be registered as a Sub-stakeholder and they will accept your registration. Leave blank for direct Admin-managed.
                    </p>
                  </div>
                )}

                {/* Error Message */}
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl flex items-start gap-2 text-xs leading-relaxed">
                    <AlertOctagon size={16} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Register Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider shadow transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer border-none"
                >
                  <span>{isLoading ? 'Creating account...' : 'Request Access'}</span>
                  <ChevronRight size={14} />
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer Support Info */}
        <div className="text-center text-[10px] text-slate-500 font-mono">
          Security policy enforced by secure Firestore rules
        </div>

      </div>
    </div>
  );
}
