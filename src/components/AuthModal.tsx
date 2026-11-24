import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Lock, Phone, ShieldCheck, UserPlus, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { DemoPersonaOption, PublicUser } from '../types';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'customer_login' | 'customer_register' | 'workspace';
  preferredPersonaId?: string;
  currentUser: PublicUser | null;
  token: string | null;
  onClose: () => void;
  onAuthSuccess: (token: string, user: PublicUser) => void;
  onSignOut: () => void;
}

interface WorkspaceStatusResponse {
  adminPasscodeConfigured: boolean;
  envPasscodeActive: boolean;
  demoPersonas: DemoPersonaOption[];
}

export function AuthModal({
  open,
  initialMode = 'customer_login',
  preferredPersonaId,
  currentUser,
  token,
  onClose,
  onAuthSuccess,
  onSignOut,
}: AuthModalProps) {
  const [tab, setTab] = useState<'customer_login' | 'customer_register' | 'workspace'>(initialMode);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Customer login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Customer register + OTP state
  const [regName, setRegName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regTerms, setRegTerms] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<PublicUser | null>(null);

  // Workspace claim / login state
  const [passcode, setPasscode] = useState('');
  const [selectedPersonaId, setSelectedPersonaId] = useState(preferredPersonaId || 'usr-adm-hosp-1');

  useEffect(() => {
    if (!open) return;
    setTab(initialMode);
    setError(null);
    setSuccessMsg(null);
    if (preferredPersonaId) setSelectedPersonaId(preferredPersonaId);

    apiRequest<WorkspaceStatusResponse>('/api/auth/workspace-status')
      .then((res) => setWorkspaceStatus(res))
      .catch(() => {});
  }, [open, initialMode, preferredPersonaId]);

  if (!open) return null;

  async function handleCustomerLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: PublicUser }>('/api/auth/login', {
        method: 'POST',
        body: { identifier: loginIdentifier, password: loginPassword },
      });
      onAuthSuccess(res.token, res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCustomerRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: PublicUser }>('/api/auth/register', {
        method: 'POST',
        body: {
          name: regName,
          mobile: regMobile,
          email: regEmail,
          password: regPassword,
          acceptedTerms: regTerms,
        },
      });
      setPendingToken(res.token);
      setPendingUser(res.user);

      // Immediately dispatch OTP for verification step
      const otpRes = await apiRequest<{ ok: boolean; demoOtpHint?: string }>('/api/auth/send-otp', {
        method: 'POST',
        body: { mobile: regMobile },
      });
      setOtpHint(otpRes.demoOtpHint || null);
      setOtpStep(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ verified: boolean; user?: PublicUser; token?: string }>(
        '/api/auth/verify-otp',
        {
          method: 'POST',
          token: pendingToken,
          body: { mobile: regMobile, code: otpCode },
        }
      );
      const finalToken = res.token || pendingToken;
      const finalUser = res.user || pendingUser;
      if (finalToken && finalUser) {
        onAuthSuccess(finalToken, { ...finalUser, verifiedOtp: true });
      }
      setOtpStep(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleSkipOtpForNow() {
    if (pendingToken && pendingUser) {
      onAuthSuccess(pendingToken, pendingUser);
      setOtpStep(false);
      onClose();
    }
  }

  async function handleWorkspaceSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = workspaceStatus?.adminPasscodeConfigured
        ? '/api/auth/admin-login'
        : '/api/auth/claim-admin';

      const res = await apiRequest<{ token: string; user: PublicUser }>(endpoint, {
        method: 'POST',
        body: { passcode, personaId: selectedPersonaId },
      });
      onAuthSuccess(res.token, res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSwitchDemoPersona(personaId: string) {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: PublicUser }>('/api/auth/switch-demo-role', {
        method: 'POST',
        token,
        body: { personaId },
      });
      onAuthSuccess(res.token, res.user);
      setSuccessMsg(`Switched active session to ${res.user.name}.`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch workspace role.');
    } finally {
      setLoading(false);
    }
  }

  const isDemoWorkspaceSession =
    Boolean(currentUser) &&
    Boolean(workspaceStatus?.demoPersonas.some((p) => p.id === currentUser?.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Account and Workspace Sign In"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {currentUser ? 'Account & Role Session' : 'Sign In to BookFlow'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer authentication, OTP verification, and isolated admin portals
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTab('customer_login');
                setError(null);
              }}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'customer_login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Customer Login
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('customer_register');
                setError(null);
              }}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'customer_register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register & OTP
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('workspace');
                setError(null);
              }}
              className={`py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                tab === 'workspace'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Admin & Staff
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
              {successMsg}
            </div>
          )}

          {currentUser && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{currentUser.name}</p>
                <p className="text-xs text-slate-500 truncate">
                  {currentUser.role.replace('_', ' ')} · {currentUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 bg-white rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap shrink-0"
              >
                Sign Out
              </button>
            </div>
          )}

          {tab === 'customer_login' && (
            <form onSubmit={handleCustomerLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email or Mobile Number
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="you@example.com or +1 415 555 0192"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign In as Customer'}
              </button>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>Want to test with sample bookings immediately?</span>
                <button
                  type="button"
                  onClick={() => setTab('workspace')}
                  className="font-medium text-blue-700 hover:underline whitespace-nowrap"
                >
                  Open Demo Workspace
                </button>
              </div>
            </form>
          )}

          {tab === 'customer_register' && !otpStep && (
            <form onSubmit={handleCustomerRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Jordan Rivera"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={regMobile}
                    onChange={(e) => setRegMobile(e.target.value)}
                    placeholder="+1 415 555 0184"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="jordan@example.com"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Password (min 6 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Create a secure password"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={regTerms}
                  onChange={(e) => setRegTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span>
                  I accept the BookFlow Terms and Conditions and consent to appointment status notifications.
                </span>
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>{loading ? 'Creating Account...' : 'Create Account & Send OTP'}</span>
              </button>
            </form>
          )}

          {tab === 'customer_register' && otpStep && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                  <Phone className="w-4 h-4" />
                  <span>OTP Verification</span>
                </div>
                <p className="text-xs text-blue-800 mt-1">
                  Enter the 6-digit verification code sent to <span className="font-mono font-semibold">{regMobile}</span>.
                </p>
                {otpHint && (
                  <p className="text-xs text-blue-900 mt-2 font-mono bg-white/80 border border-blue-200 rounded px-2.5 py-1.5 inline-block">
                    Preview Verification Code: <strong>{otpHint}</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  6-Digit OTP Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-base font-mono tracking-widest text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{loading ? 'Verifying...' : 'Verify & Continue'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSkipOtpForNow}
                  className="min-h-[44px] px-4 py-2.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Verify Later
                </button>
              </div>
            </form>
          )}

          {tab === 'workspace' && (
            <div className="space-y-4">
              {isDemoWorkspaceSession ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Workspace session active — switch directly between demo roles</span>
                  </div>
                  <div className="space-y-2">
                    {workspaceStatus?.demoPersonas.map((persona) => {
                      const active = currentUser?.id === persona.id;
                      return (
                        <button
                          key={persona.id}
                          type="button"
                          disabled={loading}
                          onClick={() => handleSwitchDemoPersona(persona.id)}
                          className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50/50'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">{persona.label}</span>
                            <span className="text-xs font-medium text-blue-700 capitalize">
                              {persona.role.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{persona.subtitle}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleWorkspaceSubmit} className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <KeyRound className="w-4 h-4 text-blue-700" />
                      <span>
                        {workspaceStatus?.adminPasscodeConfigured
                          ? 'Workspace Passcode Sign In'
                          : 'First-Run Workspace Setup'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {workspaceStatus?.adminPasscodeConfigured
                        ? 'Enter your configured workspace passcode and select a portal role to preview.'
                        : 'Set a workspace passcode once to unlock the Business Admin, Staff, Super Admin, and Demo Customer portals.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Select Portal Persona
                    </label>
                    <select
                      value={selectedPersonaId}
                      onChange={(e) => setSelectedPersonaId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                    >
                      {(workspaceStatus?.demoPersonas || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({p.role.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      {workspaceStatus?.adminPasscodeConfigured
                        ? 'Workspace Passcode'
                        : 'Choose Workspace Passcode (min 4 chars)'}
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        required
                        minLength={4}
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder={
                          workspaceStatus?.adminPasscodeConfigured
                            ? 'Enter workspace passcode'
                            : 'Create a demo workspace passcode'
                        }
                        className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
                  >
                    {loading
                      ? 'Authenticating...'
                      : workspaceStatus?.adminPasscodeConfigured
                      ? 'Sign In to Selected Portal'
                      : 'Activate Workspace & Open Portal'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
