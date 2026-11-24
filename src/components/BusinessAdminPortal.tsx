import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Building2,
  CalendarCheck,
  Clock,
  FileBarChart,
  FolderKanban,
  History,
  LayoutDashboard,
  Lock,
  Plus,
  Search,
  Stethoscope,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  Appointment,
  AppointmentHistoryEntry,
  AvailabilityConfig,
  BookingStatus,
  Business,
  Department,
  NotificationItem,
  PublicUser,
  ServiceItem,
  StaffMember,
  TimeSlot,
} from '../types';
import { StatusText } from './StatusText';

interface BusinessAdminPortalProps {
  user: PublicUser | null;
  token: string | null;
  onOpenAuth: (mode?: 'customer_login' | 'customer_register' | 'workspace', personaId?: string) => void;
}

type AdminSection =
  | 'dashboard'
  | 'appointments'
  | 'departments'
  | 'services'
  | 'staff'
  | 'availability'
  | 'customers'
  | 'profile'
  | 'notifications';

interface DashboardResponse {
  business: Business;
  metrics: {
    totalAppointments: number;
    pendingAppointments: number;
    approvedAppointments: number;
    cancelledAppointments: number;
    completedAppointments: number;
    totalCustomers: number;
    estimatedRevenue: number;
  };
  departments: Department[];
  services: ServiceItem[];
  staff: StaffMember[];
  availability: AvailabilityConfig | null;
}

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function BusinessAdminPortal({ user, token, onOpenAuth }: BusinessAdminPortalProps) {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [history, setHistory] = useState<AppointmentHistoryEntry[]>([]);
  const [customers, setCustomers] = useState<
    { id: string; name: string; mobile: string; totalBookings: number; lastDate: string }[]
  >([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Appointment filters & modals
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleNote, setRescheduleNote] = useState('');
  const [historyTarget, setHistoryTarget] = useState<Appointment | null>(null);

  // Add Department / Service / Staff forms
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  const [newSrvName, setNewSrvName] = useState('');
  const [newSrvPrice, setNewSrvPrice] = useState('85');
  const [newSrvDuration, setNewSrvDuration] = useState('30');
  const [newSrvDesc, setNewSrvDesc] = useState('');

  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('');
  const [newStaffQual, setNewStaffQual] = useState('');
  const [newStaffSpec, setNewStaffSpec] = useState('');
  const [newStaffDeptId, setNewStaffDeptId] = useState('');
  const [newStaffFee, setNewStaffFee] = useState('');

  // Availability form state
  const [availForm, setAvailForm] = useState<AvailabilityConfig | null>(null);
  const [newHoliday, setNewHoliday] = useState('');

  // Business profile form state
  const [bizName, setBizName] = useState('');
  const [bizDesc, setBizDesc] = useState('');
  const [bizAddr, setBizAddr] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizEmail, setBizEmail] = useState('');
  const [bizHours, setBizHours] = useState('');

  const isAuthorized = Boolean(
    user && token && (user.role === 'business_admin' || user.role === 'super_admin')
  );

  const loadData = useCallback(async () => {
    if (!isAuthorized || !token) return;
    setLoading(true);
    setError(null);
    try {
      const [dashRes, aptRes, custRes, notRes] = await Promise.all([
        apiRequest<DashboardResponse>('/api/admin/dashboard', { token }),
        apiRequest<{ appointments: Appointment[]; history: AppointmentHistoryEntry[] }>(
          '/api/admin/appointments',
          { token }
        ),
        apiRequest<{
          customers: { id: string; name: string; mobile: string; totalBookings: number; lastDate: string }[];
        }>('/api/admin/customers', { token }),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', { token }),
      ]);

      setDashboard(dashRes);
      setAppointments(aptRes.appointments);
      setHistory(aptRes.history);
      setCustomers(custRes.customers);
      setNotifications(notRes.notifications);

      if (dashRes.availability) setAvailForm(dashRes.availability);
      setBizName(dashRes.business.name);
      setBizDesc(dashRes.business.description);
      setBizAddr(dashRes.business.address);
      setBizPhone(dashRes.business.contactNumber);
      setBizEmail(dashRes.business.email);
      setBizHours(dashRes.business.workingHoursSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin workspace.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!rescheduleTarget || !rescheduleDate) return;
    const params = new URLSearchParams({
      businessId: rescheduleTarget.businessId,
      date: rescheduleDate,
      durationMinutes: String(rescheduleTarget.durationMinutes),
      ignoreAppointmentId: rescheduleTarget.id,
    });
    if (rescheduleTarget.staffId) params.set('staffId', rescheduleTarget.staffId);
    apiRequest<{ slots: TimeSlot[] }>(`/api/availability?${params.toString()}`)
      .then((res) => setRescheduleSlots(res.slots))
      .catch(() => setRescheduleSlots([]));
  }, [rescheduleTarget, rescheduleDate]);

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.id.toLowerCase().includes(q) ||
        a.customerName.toLowerCase().includes(q) ||
        a.serviceNames.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [appointments, statusFilter, searchQuery]);

  async function updateAppointmentStatus(
    id: string,
    status: BookingStatus,
    reason?: string,
    staffId?: string
  ) {
    if (!token) return;
    try {
      await apiRequest(`/api/admin/appointments/${id}/status`, {
        method: 'PATCH',
        token,
        body: { status, reason, staffId },
      });
      setFeedback(`Appointment ${id} updated to ${status}.`);
      setRejectTarget(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Status update failed.');
    }
  }

  async function handleAdminReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !rescheduleTarget || !rescheduleTime) return;
    try {
      await apiRequest(`/api/admin/appointments/${rescheduleTarget.id}/reschedule`, {
        method: 'PATCH',
        token,
        body: {
          date: rescheduleDate,
          time: rescheduleTime,
          note: rescheduleNote || 'Rescheduled by business admin.',
        },
      });
      setFeedback(`Appointment ${rescheduleTarget.id} rescheduled to ${rescheduleDate} at ${rescheduleTime}.`);
      setRescheduleTarget(null);
      setRescheduleNote('');
      loadData();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Reschedule failed.');
    }
  }

  async function handleAddDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newDeptName.trim()) return;
    await apiRequest('/api/admin/departments', {
      method: 'POST',
      token,
      body: { name: newDeptName, description: newDeptDesc },
    });
    setNewDeptName('');
    setNewDeptDesc('');
    setFeedback('Department added.');
    loadData();
  }

  async function toggleDepartment(dept: Department) {
    if (!token) return;
    await apiRequest(`/api/admin/departments/${dept.id}`, {
      method: 'PATCH',
      token,
      body: { active: !dept.active },
    });
    loadData();
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newSrvName.trim()) return;
    await apiRequest('/api/admin/services', {
      method: 'POST',
      token,
      body: {
        name: newSrvName,
        price: Number(newSrvPrice) || 0,
        durationMinutes: Number(newSrvDuration) || 30,
        description: newSrvDesc,
      },
    });
    setNewSrvName('');
    setNewSrvDesc('');
    setFeedback('Service created.');
    loadData();
  }

  async function toggleService(srv: ServiceItem) {
    if (!token) return;
    await apiRequest(`/api/admin/services/${srv.id}`, {
      method: 'PATCH',
      token,
      body: { active: !srv.active },
    });
    loadData();
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newStaffName.trim()) return;
    await apiRequest('/api/admin/staff', {
      method: 'POST',
      token,
      body: {
        name: newStaffName,
        roleTitle: newStaffRole || 'Specialist',
        qualification: newStaffQual,
        specialization: newStaffSpec,
        departmentId: newStaffDeptId || undefined,
        consultationFee: newStaffFee ? Number(newStaffFee) : undefined,
      },
    });
    setNewStaffName('');
    setNewStaffRole('');
    setNewStaffQual('');
    setNewStaffSpec('');
    setNewStaffFee('');
    setFeedback('Team member added.');
    loadData();
  }

  async function toggleStaff(member: StaffMember) {
    if (!token) return;
    await apiRequest(`/api/admin/staff/${member.id}`, {
      method: 'PATCH',
      token,
      body: { active: !member.active },
    });
    loadData();
  }

  async function handleSaveAvailability(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !availForm) return;
    await apiRequest('/api/admin/availability', {
      method: 'PATCH',
      token,
      body: availForm,
    });
    setFeedback('Working hours and availability updated.');
    loadData();
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiRequest('/api/admin/business', {
      method: 'PATCH',
      token,
      body: {
        name: bizName,
        description: bizDesc,
        address: bizAddr,
        contactNumber: bizPhone,
        email: bizEmail,
        workingHoursSummary: bizHours,
      },
    });
    setFeedback('Business profile updated.');
    loadData();
  }

  if (!isAuthorized) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Business Admin Portal</h1>
        <p className="text-sm text-slate-600">
          Each business admin operates inside an isolated workspace for their hospital, gym, auto service center, or salon. Sign in or activate a demo business admin portal to manage appointments, staff, and availability.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => onOpenAuth('workspace', 'usr-adm-hosp-1')}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
          >
            Open City Care Hospital Admin
          </button>
          <button
            type="button"
            onClick={() => onOpenAuth('workspace', 'usr-adm-car-1')}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open AutoCare Service Admin
          </button>
          <button
            type="button"
            onClick={() => onOpenAuth('workspace', 'usr-adm-salon-1')}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Open Style Studio Admin
          </button>
        </div>
      </div>
    );
  }

  const business = dashboard?.business;
  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: { id: AdminSection; label: string; icon: typeof LayoutDashboard; hide?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'appointments', label: 'Appointments', icon: CalendarCheck },
    {
      id: 'departments',
      label: 'Departments',
      icon: FolderKanban,
      hide: business?.categorySlug !== 'hospital',
    },
    { id: 'services', label: 'Services', icon: Wrench },
    {
      id: 'staff',
      label: business?.categorySlug === 'hospital' ? 'Doctors & Staff' : 'Staff & Trainers',
      icon: Stethoscope,
    },
    { id: 'availability', label: 'Availability', icon: Clock },
    { id: 'customers', label: 'Customers & Reports', icon: FileBarChart },
    { id: 'profile', label: 'Business Profile', icon: Building2 },
    { id: 'notifications', label: `Notifications (${unreadCount})`, icon: Bell },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Sidebar */}
      <aside className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="pb-3 border-b border-slate-100">
          <p className="text-xs font-medium text-blue-700">Isolated Business Scope</p>
          <h2 className="text-base font-bold text-slate-900 mt-0.5 truncate">
            {business?.name || 'Loading...'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {business?.cityName} · {user?.name}
          </p>
        </div>

        <nav className="space-y-1">
          {navItems
            .filter((i) => !i.hide)
            .map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-800 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
        </nav>

        <div className="pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onOpenAuth('workspace')}
            className="w-full py-2 px-3 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Switch Demo Business
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:col-span-9 space-y-6">
        {feedback && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex items-center justify-between">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="underline font-medium">
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading && !dashboard ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
            Loading business workspace...
          </div>
        ) : null}

        {/* DASHBOARD */}
        {section === 'dashboard' && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Bookings', val: dashboard.metrics.totalAppointments },
                { label: 'Pending', val: dashboard.metrics.pendingAppointments },
                { label: 'Approved', val: dashboard.metrics.approvedAppointments },
                { label: 'Completed', val: dashboard.metrics.completedAppointments },
                { label: 'Cancelled', val: dashboard.metrics.cancelledAppointments },
                { label: 'Est. Revenue', val: `₹${dashboard.metrics.estimatedRevenue}` },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">{kpi.label}</p>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
                    {kpi.val}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Pending Approval Queue</h3>
                  <p className="text-xs text-slate-500">
                    Review incoming customer requests and prevent scheduling conflicts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('appointments')}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Open all appointments
                </button>
              </div>

              {appointments.filter((a) => a.status === 'Pending' || a.status === 'Reschedule Requested')
                .length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No pending requests right now.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {appointments
                    .filter((a) => a.status === 'Pending' || a.status === 'Reschedule Requested')
                    .map((apt) => (
                      <div
                        key={apt.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-slate-500">{apt.id}</span>
                            <StatusText status={apt.status} />
                          </div>
                          <p className="text-sm font-semibold text-slate-900 mt-1">
                            {apt.customerName} · {apt.serviceNames.join(', ')}
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            {apt.date} at {apt.time} ({apt.durationMinutes} min)
                            {apt.requestedDate ? ` → Requested: ${apt.requestedDate} ${apt.requestedTime}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {apt.status === 'Reschedule Requested' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setRescheduleTarget(apt);
                                setRescheduleDate(apt.requestedDate || apt.date);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-blue-700 text-xs font-medium text-white hover:bg-blue-800"
                            >
                              Confirm Reschedule
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(apt.id, 'Approved')}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setRejectTarget(apt)}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* APPOINTMENTS MANAGEMENT */}
        {section === 'appointments' && dashboard && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">Appointment Management</h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ID, customer, service..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {[
                'All',
                'Pending',
                'Approved',
                'Reschedule Requested',
                'Rescheduled',
                'Completed',
                'Rejected',
                'Cancelled',
              ].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Booking ID</th>
                    <th className="py-2.5 pr-3 font-medium">Customer</th>
                    <th className="py-2.5 pr-3 font-medium">Service & Staff</th>
                    <th className="py-2.5 pr-3 font-medium">Date & Time</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAppointments.map((apt) => (
                    <tr key={apt.id} className="hover:bg-slate-50/60">
                      <td className="py-3 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {apt.id}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{apt.customerName}</p>
                        <p className="text-slate-500 font-mono">{apt.customerMobile}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{apt.serviceNames.join(', ')}</p>
                        {dashboard.staff.length > 0 && (
                          <select
                            value={apt.staffId || ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                updateAppointmentStatus(
                                  apt.id,
                                  apt.status === 'Pending' ? 'Approved' : (apt.status as BookingStatus),
                                  'Staff assigned by business admin.',
                                  e.target.value
                                );
                              }
                            }}
                            className="mt-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
                          >
                            <option value="">Unassigned / Any</option>
                            {dashboard.staff.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-3 pr-3 font-mono tabular-nums whitespace-nowrap">
                        <p className="text-slate-900">{apt.date}</p>
                        <p className="text-slate-500">
                          {apt.time} ({apt.durationMinutes}m)
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        <StatusText status={apt.status} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          {(apt.status === 'Pending' || apt.status === 'Reschedule Requested') && (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(apt.id, 'Approved')}
                              className="px-2.5 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800"
                            >
                              Approve
                            </button>
                          )}
                          {['Pending', 'Approved', 'Reschedule Requested', 'Rescheduled'].includes(
                            apt.status
                          ) && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleTarget(apt);
                                  setRescheduleDate(apt.requestedDate || apt.date);
                                }}
                                className="px-2.5 py-1 rounded border border-slate-200 text-blue-700 hover:bg-blue-50"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectTarget(apt)}
                                className="px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {(apt.status === 'Approved' || apt.status === 'Rescheduled') && (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(apt.id, 'Completed')}
                              className="px-2.5 py-1 rounded border border-slate-200 text-slate-800 hover:bg-slate-100"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setHistoryTarget(apt)}
                            className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                            title="Audit History"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DEPARTMENTS (HOSPITAL) */}
        {section === 'departments' && dashboard && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <h3 className="text-lg font-bold text-slate-900">Hospital Departments</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {dashboard.departments.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{d.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{d.description}</p>
                    <p className="text-xs text-slate-500 mt-2 font-mono">
                      Doctors: {dashboard.staff.filter((s) => s.departmentId === d.id).length} · Appointments:{' '}
                      {appointments.filter((a) => a.departmentId === d.id).length}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDepartment(d)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                      d.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}
                  >
                    {d.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddDepartment} className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Department Name (e.g. ENT)"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Description"
                value={newDeptDesc}
                onChange={(e) => setNewDeptDesc(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 text-xs font-medium text-white px-4 py-2 hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Department</span>
              </button>
            </form>
          </div>
        )}

        {/* SERVICES */}
        {section === 'services' && dashboard && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <h3 className="text-lg font-bold text-slate-900">Service Catalog</h3>
            <div className="divide-y divide-slate-100">
              {dashboard.services.map((srv) => (
                <div key={srv.id} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{srv.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{srv.description}</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      ₹{srv.price} · {srv.durationMinutes}m
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleService(srv)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                        srv.active
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-600'
                      }`}
                    >
                      {srv.active ? 'Active' : 'Paused'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddService} className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-5 gap-3">
              <input
                type="text"
                required
                placeholder="Service Name"
                value={newSrvName}
                onChange={(e) => setNewSrvName(e.target.value)}
                className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="number"
                required
                placeholder="Price ($)"
                value={newSrvPrice}
                onChange={(e) => setNewSrvPrice(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
              <input
                type="number"
                required
                step={15}
                min={15}
                placeholder="Duration (min)"
                value={newSrvDuration}
                onChange={(e) => setNewSrvDuration(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 text-xs font-medium text-white px-4 py-2 hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Service</span>
              </button>
            </form>
          </div>
        )}

        {/* STAFF & DOCTORS */}
        {section === 'staff' && dashboard && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <h3 className="text-lg font-bold text-slate-900">
              {dashboard.business.categorySlug === 'hospital'
                ? 'Doctors & Specialists'
                : 'Staff & Professionals'}
            </h3>
            <div className="divide-y divide-slate-100">
              {dashboard.staff.map((st) => (
                <div key={st.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{st.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {st.roleTitle} · {st.qualification} · {st.workingStart}–{st.workingEnd} (
                      {st.availableDays.join(', ')})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleStaff(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border ${
                      st.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}
                  >
                    {st.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={handleAddStaff} className="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Full Name (e.g. Dr. Priya Rao)"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                placeholder="Role (e.g. Senior Stylist / Consultant)"
                value={newStaffRole}
                onChange={(e) => setNewStaffRole(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Qualification"
                value={newStaffQual}
                onChange={(e) => setNewStaffQual(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                placeholder="Specialization"
                value={newStaffSpec}
                onChange={(e) => setNewStaffSpec(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              {dashboard.departments.length > 0 && (
                <select
                  value={newStaffDeptId}
                  onChange={(e) => setNewStaffDeptId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="">Select Department</option>
                  {dashboard.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 text-xs font-medium text-white px-4 py-2 hover:bg-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Professional</span>
              </button>
            </form>
          </div>
        )}

        {/* AVAILABILITY & WORKING HOURS */}
        {section === 'availability' && availForm && (
          <form
            onSubmit={handleSaveAvailability}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5"
          >
            <h3 className="text-lg font-bold text-slate-900">Working Hours & Slot Availability</h3>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">Working Days</label>
              <div className="flex flex-wrap gap-2">
                {ALL_DAYS.map((day) => {
                  const active = availForm.workingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setAvailForm({
                          ...availForm,
                          workingDays: active
                            ? availForm.workingDays.filter((d) => d !== day)
                            : [...availForm.workingDays, day],
                        })
                      }
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${
                        active
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Opening Time</label>
                <input
                  type="time"
                  value={availForm.openTime}
                  onChange={(e) => setAvailForm({ ...availForm, openTime: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Closing Time</label>
                <input
                  type="time"
                  value={availForm.closeTime}
                  onChange={(e) => setAvailForm({ ...availForm, closeTime: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Break Start</label>
                <input
                  type="time"
                  value={availForm.breakStart || ''}
                  onChange={(e) => setAvailForm({ ...availForm, breakStart: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Break End</label>
                <input
                  type="time"
                  value={availForm.breakEnd || ''}
                  onChange={(e) => setAvailForm({ ...availForm, breakEnd: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Slot Interval (minutes)
                </label>
                <select
                  value={availForm.slotDurationMinutes}
                  onChange={(e) =>
                    setAvailForm({ ...availForm, slotDurationMinutes: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Max Bookings Per Slot
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={availForm.maxBookingsPerSlot}
                  onChange={(e) =>
                    setAvailForm({ ...availForm, maxBookingsPerSlot: Number(e.target.value) || 1 })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Holidays / Closed Dates</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {availForm.holidays.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() =>
                      setAvailForm({
                        ...availForm,
                        holidays: availForm.holidays.filter((d) => d !== h),
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono text-slate-700"
                  >
                    <span>{h}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
              <div className="flex gap-2 max-w-xs">
                <input
                  type="date"
                  value={newHoliday}
                  onChange={(e) => setNewHoliday(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newHoliday && !availForm.holidays.includes(newHoliday)) {
                      setAvailForm({ ...availForm, holidays: [...availForm.holidays, newHoliday] });
                      setNewHoliday('');
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium hover:bg-slate-50"
                >
                  Add Holiday
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
            >
              Save Availability Configuration
            </button>
          </form>
        )}

        {/* CUSTOMERS & REPORTS */}
        {section === 'customers' && dashboard && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Customers & Business Reports</h3>
              <span className="text-xs text-slate-500 font-mono">
                {customers.length} unique customers
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Customer Name</th>
                    <th className="py-2 pr-3 font-medium">Mobile</th>
                    <th className="py-2 pr-3 font-medium text-right">Total Bookings</th>
                    <th className="py-2 font-medium text-right">Last Appointment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">{c.name}</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">{c.mobile}</td>
                      <td className="py-2.5 pr-3 font-mono text-right tabular-nums">{c.totalBookings}</td>
                      <td className="py-2.5 font-mono text-right tabular-nums text-slate-600">
                        {c.lastDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* BUSINESS PROFILE */}
        {section === 'profile' && (
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <h3 className="text-lg font-bold text-slate-900">Business Profile Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Business Name</label>
                <input
                  type="text"
                  value={bizName}
                  onChange={(e) => setBizName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Working Hours Summary
                </label>
                <input
                  type="text"
                  value={bizHours}
                  onChange={(e) => setBizHours(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Contact Number</label>
                <input
                  type="text"
                  value={bizPhone}
                  onChange={(e) => setBizPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={bizAddr}
                  onChange={(e) => setBizAddr(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={bizDesc}
                  onChange={(e) => setBizDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="min-h-[42px] px-5 py-2 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
            >
              Save Business Details
            </button>
          </form>
        )}

        {/* NOTIFICATIONS */}
        {section === 'notifications' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Business Notifications</h3>
              {unreadCount > 0 && token && (
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest('/api/notifications/mark-all-read', { method: 'POST', token });
                    loadData();
                  }}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500">No business notifications.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <div key={n.id} className="py-3">
                    <p className="text-xs font-medium text-blue-700">{n.event}</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{n.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reject Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateAppointmentStatus(rejectTarget.id, 'Rejected', rejectReason);
            }}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-slate-900">Reject Booking {rejectTarget.id}</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Rejection Reason (Sent to Customer)
              </label>
              <textarea
                required
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Specialist unavailable due to emergency surgery..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-700 text-xs font-medium text-white hover:bg-red-800"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <form
            onSubmit={handleAdminReschedule}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Reschedule {rescheduleTarget.id}
              </h3>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="p-1 text-slate-500 hover:bg-slate-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">New Date</label>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Available Time Slots
              </label>
              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                {rescheduleSlots.map((s) => (
                  <button
                    key={s.time}
                    type="button"
                    disabled={!s.available}
                    onClick={() => setRescheduleTime(s.time)}
                    className={`py-2 px-2 rounded-lg border text-xs font-mono ${
                      !s.available
                        ? 'bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                        : rescheduleTime === s.time
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-800 border-slate-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              placeholder="Note to customer (optional)"
              value={rescheduleNote}
              onChange={(e) => setRescheduleNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={!rescheduleTime}
              className="w-full min-h-[42px] rounded-lg bg-blue-700 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Confirm Reschedule & Notify Customer
            </button>
          </form>
        </div>
      )}

      {/* Audit History Modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Audit History · {historyTarget.id}
              </h3>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="p-1 text-slate-500 hover:bg-slate-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {history
                .filter((h) => h.appointmentId === historyTarget.id)
                .map((h) => (
                  <div key={h.id} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                    <div className="flex justify-between font-semibold text-slate-900">
                      <span>
                        {h.previousStatus} → {h.newStatus}
                      </span>
                      <span className="font-mono text-slate-500">
                        {new Date(h.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-600 mt-1">{h.note}</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      By {h.actorName} ({h.actorRole})
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
