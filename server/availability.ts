import type {
  Appointment,
  AvailabilityConfig,
  StaffMember,
  TimeSlot,
} from '../src/types.ts';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ACTIVE_SLOT_STATUSES = new Set([
  'Pending',
  'Approved',
  'Reschedule Requested',
  'Rescheduled',
]);

export function timeToMinutes(timeStr: string): number {
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeLabel(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function getDayAbbrev(dateStr: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(dt.getTime())) return null;
  return DAY_NAMES[dt.getUTCDay()] ?? null;
}

export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface ComputeSlotsParams {
  date: string;
  config: AvailabilityConfig;
  appointments: Appointment[];
  staff?: StaffMember | null;
  requestedDurationMinutes?: number;
  ignoreAppointmentId?: string;
}

export function computeAvailableTimeSlots(params: ComputeSlotsParams): {
  slots: TimeSlot[];
  closedReason?: string;
} {
  const { date, config, appointments, staff, requestedDurationMinutes, ignoreAppointmentId } = params;
  const dayAbbrev = getDayAbbrev(date);
  if (!dayAbbrev) {
    return { slots: [], closedReason: 'Invalid date format.' };
  }

  if (config.holidays.includes(date)) {
    return { slots: [], closedReason: 'Business is closed on this holiday.' };
  }

  if (!config.workingDays.includes(dayAbbrev)) {
    return { slots: [], closedReason: `Closed on ${dayAbbrev}.` };
  }

  if (staff && !staff.availableDays.includes(dayAbbrev)) {
    return { slots: [], closedReason: `${staff.name} is not available on ${dayAbbrev}.` };
  }

  const businessOpen = timeToMinutes(config.openTime);
  const businessClose = timeToMinutes(config.closeTime);
  const effectiveOpen = staff ? Math.max(businessOpen, timeToMinutes(staff.workingStart)) : businessOpen;
  const effectiveClose = staff ? Math.min(businessClose, timeToMinutes(staff.workingEnd)) : businessClose;

  if (effectiveOpen >= effectiveClose) {
    return { slots: [], closedReason: 'No active working hours for this schedule.' };
  }

  const breakStart = config.breakStart ? timeToMinutes(config.breakStart) : null;
  const breakEnd = config.breakEnd ? timeToMinutes(config.breakEnd) : null;
  const step = Math.max(15, config.slotDurationMinutes || 30);
  const duration = Math.max(step, requestedDurationMinutes || step);

  // Filter active appointments for that date & business
  const dayAppointments = appointments.filter(
    (apt) =>
      apt.businessId === config.businessId &&
      apt.date === date &&
      apt.id !== ignoreAppointmentId &&
      ACTIVE_SLOT_STATUSES.has(apt.status)
  );

  // Check if selected date is today in local server time
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: TimeSlot[] = [];

  for (let startMin = effectiveOpen; startMin + duration <= effectiveClose; startMin += step) {
    const endMin = startMin + duration;
    const timeStr = minutesToTime(startMin);

    if (breakStart !== null && breakEnd !== null && intervalsOverlap(startMin, endMin, breakStart, breakEnd)) {
      slots.push({
        time: timeStr,
        label: formatTimeLabel(timeStr),
        available: false,
        reason: 'Break window',
        remainingCapacity: 0,
      });
      continue;
    }

    if (date === todayStr && startMin <= currentMinutes + 15) {
      slots.push({
        time: timeStr,
        label: formatTimeLabel(timeStr),
        available: false,
        reason: 'Past time',
        remainingCapacity: 0,
      });
      continue;
    }

    if (staff) {
      const staffConflict = dayAppointments.some((apt) => {
        if (apt.staffId !== staff.id) return false;
        const aptStart = timeToMinutes(apt.time);
        const aptEnd = aptStart + Math.max(step, apt.durationMinutes);
        return intervalsOverlap(startMin, endMin, aptStart, aptEnd);
      });

      slots.push({
        time: timeStr,
        label: formatTimeLabel(timeStr),
        available: !staffConflict,
        reason: staffConflict ? 'Booked' : undefined,
        remainingCapacity: staffConflict ? 0 : 1,
      });
    } else {
      const overlappingCount = dayAppointments.filter((apt) => {
        const aptStart = timeToMinutes(apt.time);
        const aptEnd = aptStart + Math.max(step, apt.durationMinutes);
        return intervalsOverlap(startMin, endMin, aptStart, aptEnd);
      }).length;
      const capacity = Math.max(1, config.maxBookingsPerSlot || 1);
      const remaining = Math.max(0, capacity - overlappingCount);

      slots.push({
        time: timeStr,
        label: formatTimeLabel(timeStr),
        available: remaining > 0,
        reason: remaining === 0 ? 'Fully booked' : undefined,
        remainingCapacity: remaining,
      });
    }
  }

  return { slots };
}
