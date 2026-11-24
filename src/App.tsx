import { useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { BusinessAdminPortal } from './components/BusinessAdminPortal';
import { CustomerApp } from './components/CustomerApp';
import { StaffPortal } from './components/StaffPortal';
import { SuperAdminPortal } from './components/SuperAdminPortal';
import type { PublicUser } from './types';

type WorkspaceView = 'customer' | 'business_admin' | 'staff' | 'super_admin';

export default function App() {
  const [view, setView] = useState<WorkspaceView>('customer');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<
    'customer_login' | 'customer_register' | 'workspace'
  >('customer_login');
  const [preferredPersonaId, setPreferredPersonaId] = useState<string | undefined>(undefined);

  function openAuth(
    mode: 'customer_login' | 'customer_register' | 'workspace' = 'customer_login',
    personaId?: string
  ) {
    setAuthInitialMode(mode);
    setPreferredPersonaId(personaId);
    setAuthModalOpen(true);
  }

  function handleAuthSuccess(nextToken: string, nextUser: PublicUser) {
    setToken(nextToken);
    setUser(nextUser);

    if (nextUser.role === 'business_admin') {
      setView('business_admin');
    } else if (nextUser.role === 'staff') {
      setView('staff');
    } else if (nextUser.role === 'super_admin') {
      setView('super_admin');
    } else {
      setView('customer');
    }
  }

  function handleSignOut() {
    setToken(null);
    setUser(null);
    setView('customer');
  }

  const navLinks: { id: WorkspaceView; label: string }[] = [
    { id: 'customer', label: 'Customer App' },
    { id: 'business_admin', label: 'Business Admin' },
    { id: 'staff', label: 'Staff Schedule' },
    { id: 'super_admin', label: 'Super Admin' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setView('customer')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            BookFlow
          </button>

          {/* Zone 2: 4 Single-line Navigation Links */}
          <nav
            aria-label="Primary Workspace Navigation"
            className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar"
          >
            {navLinks.map((item) => {
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-blue-700 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => openAuth(user ? 'workspace' : 'customer_login')}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 max-w-[180px] truncate"
            >
              {user ? user.name : 'Sign In'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {view === 'customer' && (
          <CustomerApp
            user={user}
            token={token}
            onOpenAuth={openAuth}
            onUserUpdated={(updated) => setUser(updated)}
          />
        )}
        {view === 'business_admin' && (
          <BusinessAdminPortal user={user} token={token} onOpenAuth={openAuth} />
        )}
        {view === 'staff' && <StaffPortal user={user} token={token} onOpenAuth={openAuth} />}
        {view === 'super_admin' && (
          <SuperAdminPortal user={user} token={token} onOpenAuth={openAuth} />
        )}
      </main>

      {/* Clean Footer */}
      <footer className="hidden md:block border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between text-xs text-slate-500">
          <span>BookFlow Multi-Domain Appointment Booking Platform</span>
          <span>Healthcare · Fitness · Automotive Service · Salons</span>
        </div>
      </footer>

      <AuthModal
        open={authModalOpen}
        initialMode={authInitialMode}
        preferredPersonaId={preferredPersonaId}
        currentUser={user}
        token={token}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
