import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CalendarCheck,
  Globe2,
  Layers,
  LayoutDashboard,
  Lock,
  Plus,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Appointment, Business, Category, City, PublicUser } from '../types';
import { StatusText } from './StatusText';

interface SuperAdminPortalProps {
  user: PublicUser | null;
  token: string | null;
  onOpenAuth: (mode?: 'customer_login' | 'customer_register' | 'workspace', personaId?: string) => void;
}

type SuperTab = 'overview' | 'businesses' | 'categories' | 'cities' | 'appointments';

interface PlatformDashboard {
  metrics: {
    totalBusinesses: number;
    totalCustomers: number;
    totalAppointments: number;
    pendingAppointments: number;
    approvedAppointments: number;
    cancelledAppointments: number;
  };
  categoryBreakdown: { categoryId: string; name: string; businesses: number; appointments: number }[];
  cityBreakdown: { cityId: string; name: string; businesses: number; appointments: number }[];
}

export function SuperAdminPortal({ user, token, onOpenAuth }: SuperAdminPortalProps) {
  const [tab, setTab] = useState<SuperTab>('overview');
  const [platform, setPlatform] = useState<PlatformDashboard | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add forms
  const [newCityName, setNewCityName] = useState('');
  const [newCityState, setNewCityState] = useState('');
  const [newCityPopular, setNewCityPopular] = useState(false);

  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const [newBizName, setNewBizName] = useState('');
  const [newBizCatId, setNewBizCatId] = useState('cat-hospital');
  const [newBizCityId, setNewBizCityId] = useState('city-sf');
  const [newBizAddr, setNewBizAddr] = useState('');
  const [newBizPhone, setNewBizPhone] = useState('');

  const isSuper = Boolean(user && token && user.role === 'super_admin');

  const loadAll = useCallback(async () => {
    if (!isSuper || !token) return;
    try {
      const [dashRes, bizRes, catRes, cityRes, aptRes] = await Promise.all([
        apiRequest<PlatformDashboard>('/api/admin/dashboard?scope=platform', { token }),
        apiRequest<{ businesses: Business[] }>('/api/super/businesses', { token }),
        apiRequest<{ categories: Category[] }>('/api/super/categories', { token }),
        apiRequest<{ cities: City[] }>('/api/super/cities', { token }),
        apiRequest<{ appointments: Appointment[] }>('/api/admin/appointments', { token }),
      ]);
      setPlatform(dashRes);
      setBusinesses(bizRes.businesses);
      setCategories(catRes.categories);
      setCities(cityRes.cities);
      setAppointments(aptRes.appointments);
    } catch {
      // Handle error
    }
  }, [isSuper, token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function updateBusinessStatus(id: string, status: 'Approved' | 'Suspended') {
    if (!token) return;
    await apiRequest(`/api/super/businesses/${id}/status`, {
      method: 'PATCH',
      token,
      body: { status },
    });
    setFeedback(`Business status updated to ${status}.`);
    loadAll();
  }

  async function handleAddBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiRequest('/api/super/businesses', {
      method: 'POST',
      token,
      body: {
        name: newBizName,
        categoryId: newBizCatId,
        cityId: newBizCityId,
        address: newBizAddr,
        contactNumber: newBizPhone,
      },
    });
    setNewBizName('');
    setNewBizAddr('');
    setNewBizPhone('');
    setFeedback('Business registered and approved on platform.');
    loadAll();
  }

  async function handleAddCity(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiRequest('/api/super/cities', {
      method: 'POST',
      token,
      body: { name: newCityName, state: newCityState, popular: newCityPopular },
    });
    setNewCityName('');
    setNewCityState('');
    setFeedback('City added.');
    loadAll();
  }

  async function toggleCity(c: City) {
    if (!token) return;
    await apiRequest(`/api/super/cities/${c.id}`, {
      method: 'PATCH',
      token,
      body: { active: !c.active },
    });
    loadAll();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiRequest('/api/super/categories', {
      method: 'POST',
      token,
      body: { name: newCatName, description: newCatDesc },
    });
    setNewCatName('');
    setNewCatDesc('');
    setFeedback('Category created.');
    loadAll();
  }

  async function toggleCategory(c: Category) {
    if (!token) return;
    await apiRequest(`/api/super/categories/${c.id}`, {
      method: 'PATCH',
      token,
      body: { active: !c.active },
    });
    loadAll();
  }

  if (!isSuper) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Platform Super Admin</h1>
        <p className="text-sm text-slate-600">
          Super Admins govern platform-wide business onboarding approvals, supported categories, active cities, and cross-domain booking analytics.
        </p>
        <button
          type="button"
          onClick={() => onOpenAuth('workspace', 'usr-super-1')}
          className="min-h-[44px] px-5 py-2.5 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
        >
          Open Platform Super Admin
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">BookFlow Platform Governance</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-domain oversight across businesses, categories, cities, and platform appointments
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {[
            { id: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
            { id: 'businesses' as const, label: 'Businesses', icon: Building2 },
            { id: 'categories' as const, label: 'Categories', icon: Layers },
            { id: 'cities' as const, label: 'Cities', icon: Globe2 },
            { id: 'appointments' as const, label: 'All Bookings', icon: CalendarCheck },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {tab === 'overview' && platform && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Businesses', val: platform.metrics.totalBusinesses },
              { label: 'Total Customers', val: platform.metrics.totalCustomers },
              { label: 'Total Bookings', val: platform.metrics.totalAppointments },
              { label: 'Pending', val: platform.metrics.pendingAppointments },
              { label: 'Approved', val: platform.metrics.approvedAppointments },
              { label: 'Cancelled / Rejected', val: platform.metrics.cancelledAppointments },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs text-slate-500">{k.label}</p>
                <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{k.val}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Distribution by Category</h2>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 font-medium">Category</th>
                    <th className="py-2 font-medium text-right">Businesses</th>
                    <th className="py-2 font-medium text-right">Appointments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {platform.categoryBreakdown.map((row) => (
                    <tr key={row.categoryId}>
                      <td className="py-2.5 font-medium text-slate-900">{row.name}</td>
                      <td className="py-2.5 font-mono text-right tabular-nums">{row.businesses}</td>
                      <td className="py-2.5 font-mono text-right tabular-nums">{row.appointments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900">Distribution by City</h2>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 font-medium">City</th>
                    <th className="py-2 font-medium text-right">Businesses</th>
                    <th className="py-2 font-medium text-right">Appointments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {platform.cityBreakdown.map((row) => (
                    <tr key={row.cityId}>
                      <td className="py-2.5 font-medium text-slate-900">{row.name}</td>
                      <td className="py-2.5 font-mono text-right tabular-nums">{row.businesses}</td>
                      <td className="py-2.5 font-mono text-right tabular-nums">{row.appointments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'businesses' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Registered Businesses & Onboarding</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Business</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">City</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {businesses.map((b) => (
                    <tr key={b.id}>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900">{b.name}</p>
                        <p className="text-slate-500">{b.address}</p>
                      </td>
                      <td className="py-3 pr-3 capitalize">{b.categorySlug.replace('_', ' ')}</td>
                      <td className="py-3 pr-3">{b.cityName}</td>
                      <td className="py-3 pr-3">
                        <StatusText status={b.status} />
                      </td>
                      <td className="py-3 text-right space-x-2 whitespace-nowrap">
                        {b.status !== 'Approved' && (
                          <button
                            type="button"
                            onClick={() => updateBusinessStatus(b.id, 'Approved')}
                            className="px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800"
                          >
                            Approve
                          </button>
                        )}
                        {b.status === 'Approved' && (
                          <button
                            type="button"
                            onClick={() => updateBusinessStatus(b.id, 'Suspended')}
                            className="px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                          >
                            Suspend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form
            onSubmit={handleAddBusiness}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">Register New Business</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Business Name"
                value={newBizName}
                onChange={(e) => setNewBizName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <select
                value={newBizCatId}
                onChange={(e) => setNewBizCatId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={newBizCityId}
                onChange={(e) => setNewBizCityId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.state}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="Street Address"
                value={newBizAddr}
                onChange={(e) => setNewBizAddr(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Contact Phone"
                value={newBizPhone}
                onChange={(e) => setNewBizPhone(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register & Approve Business</span>
            </button>
          </form>
        </div>
      )}

      {tab === 'categories' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900">Category Management</h2>
          <div className="divide-y divide-slate-100">
            {categories.map((c) => (
              <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                    c.active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                  }`}
                >
                  {c.active ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddCategory} className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="New Category Name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              placeholder="Category Description"
              value={newCatDesc}
              onChange={(e) => setNewCatDesc(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
            >
              Add Category
            </button>
          </form>
        </div>
      )}

      {tab === 'cities' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900">City Management</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {cities.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {c.name}, {c.state}
                  </p>
                  <p className="text-xs text-slate-500">{c.popular ? 'Popular City' : 'Standard'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCity(c)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border ${
                    c.active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-600'
                  }`}
                >
                  {c.active ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddCity} className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <input
              type="text"
              required
              placeholder="City Name (e.g. Denver)"
              value={newCityName}
              onChange={(e) => setNewCityName(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="text"
              required
              maxLength={4}
              placeholder="State (CO)"
              value={newCityState}
              onChange={(e) => setNewCityState(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={newCityPopular}
                onChange={(e) => setNewCityPopular(e.target.checked)}
              />
              <span>Popular City</span>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
            >
              Add City
            </button>
          </form>
        </div>
      )}

      {tab === 'appointments' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Platform-Wide Appointments Monitor</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Booking ID</th>
                  <th className="py-2 pr-3 font-medium">Business</th>
                  <th className="py-2 pr-3 font-medium">Customer</th>
                  <th className="py-2 pr-3 font-medium">Date & Time</th>
                  <th className="py-2 pr-3 font-medium">Total</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((apt) => (
                  <tr key={apt.id}>
                    <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">{apt.id}</td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">{apt.businessName}</td>
                    <td className="py-2.5 pr-3">{apt.customerName}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">
                      {apt.date} {apt.time}
                    </td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums">₹{apt.totalPrice}</td>
                    <td className="py-2.5">
                      <StatusText status={apt.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
