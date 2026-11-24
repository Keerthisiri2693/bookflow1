import { useCallback, useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Lock, UserCheck } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Appointment, PublicUser, StaffMember } from '../types';
import { StatusText } from './StatusText';

interface StaffPortalProps {
  user: PublicUser | null;
  token: string | null;
  onOpenAuth: (mode?: 'customer_login' | 'customer_register' | 'workspace', personaId?: string) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function StaffPortal({ user, token, onOpenAuth }: StaffPortalProps) {
  const [staffProfile, setStaffProfile] = useState<StaffMember | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('17:00');
  const [availDays, setAvailDays] = useState<string[]>([]);

  const isStaff = Boolean(user && token && user.role === 'staff');

  const loadSchedule = useCallback(async () => {
    if (!isStaff || !token) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ staffProfile: StaffMember; appointments: Appointment[] }>(
        '/api/staff/appointments',
        { token }
      );
      setStaffProfile(res.staffProfile);
      setAppointments(res.appointments);
      setWorkStart(res.staffProfile.workingStart);
      setWorkEnd(res.staffProfile.workingEnd);
      setAvailDays(res.staffProfile.availableDays);
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [isStaff, token]);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  async function updateProgress(id: string, status: 'Completed' | 'No Show') {
    if (!token) return;
    try {
      await apiRequest(`/api/staff/appointments/${id}/progress`, {
        method: 'PATCH',
        token,
        body: { status },
      });
      setFeedback(`Appointment ${id} marked ${status}.`);
      loadSchedule();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to update appointment.');
    }
  }

  async function saveAvailability(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    await apiRequest('/api/staff/availability', {
      method: 'PATCH',
      token,
      body: { availableDays: availDays, workingStart: workStart, workingEnd: workEnd },
    });
    setFeedback('Your schedule preferences have been updated.');
    loadSchedule();
  }

  if (!isStaff) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4 my-8">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Staff & Professional Schedule</h1>
        <p className="text-sm text-slate-600">
          Doctors, trainers, technicians, and stylists can view their assigned appointments, mark visits completed, and manage permitted working days.
        </p>
        <button
          type="button"
          onClick={() => onOpenAuth('workspace', 'usr-staff-doc-1')}
          className="min-h-[44px] px-5 py-2.5 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
        >
          Open Dr. Arjun Kumar Staff View
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {staffProfile && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{staffProfile.name}</h1>
              <p className="text-xs text-slate-500">
                {staffProfile.roleTitle} · {staffProfile.qualification} · {staffProfile.specialization}
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-slate-600">
            {appointments.length} assigned appointments
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Assigned Appointments</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Loading schedule...</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No appointments assigned to your schedule.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((apt) => (
                <div
                  key={apt.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold text-slate-500">{apt.id}</span>
                      <StatusText status={apt.status} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-1">
                      {apt.customerName} · {apt.serviceNames.join(', ')}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 font-mono tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {apt.date}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {apt.time} ({apt.durationMinutes}m)
                      </span>
                    </p>
                    {apt.patientDetails?.symptoms && (
                      <p className="text-xs text-slate-600 mt-1">
                        Patient Notes: {apt.patientDetails.symptoms}
                      </p>
                    )}
                  </div>
                  {(apt.status === 'Approved' || apt.status === 'Rescheduled') && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateProgress(apt.id, 'Completed')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Completed</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateProgress(apt.id, 'No Show')}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        No Show
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={saveAvailability}
          className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h2 className="text-base font-bold text-slate-900">Permitted Availability</h2>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Available Days</label>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const active = availDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setAvailDays(active ? availDays.filter((x) => x !== d) : [...availDays, d])
                    }
                    className={`px-2.5 py-1 rounded border text-xs font-medium ${
                      active
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start</label>
              <input
                type="time"
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End</label>
              <input
                type="time"
                value={workEnd}
                onChange={(e) => setWorkEnd(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full min-h-[40px] rounded-lg bg-blue-700 text-xs font-medium text-white hover:bg-blue-800"
          >
            Update My Schedule
          </button>
        </form>
      </div>
    </div>
  );
}
