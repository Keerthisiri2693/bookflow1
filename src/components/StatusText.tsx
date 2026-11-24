import { useState } from 'react';
import {
  AlertCircle,
  Building2,
  Car,
  CheckCircle2,
  Clock,
  Dumbbell,
  Scissors,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import type { BookingStatus, CategorySlug } from '../types';

export function StatusText({ status }: { status: BookingStatus | 'Approved' | 'Pending Approval' | 'Suspended' }) {
  const config: Record<
    string,
    { colorClass: string; icon: typeof CheckCircle2; label: string }
  > = {
    Approved: { colorClass: 'text-emerald-700', icon: CheckCircle2, label: 'Approved' },
    Completed: { colorClass: 'text-blue-700', icon: CheckCircle2, label: 'Completed' },
    Rescheduled: { colorClass: 'text-blue-700', icon: Clock, label: 'Rescheduled' },
    Pending: { colorClass: 'text-amber-700', icon: Clock, label: 'Pending' },
    'Pending Approval': { colorClass: 'text-amber-700', icon: Clock, label: 'Pending Approval' },
    'Reschedule Requested': { colorClass: 'text-amber-700', icon: AlertCircle, label: 'Reschedule Requested' },
    Rejected: { colorClass: 'text-red-700', icon: XCircle, label: 'Rejected' },
    Cancelled: { colorClass: 'text-red-700', icon: XCircle, label: 'Cancelled' },
    'No Show': { colorClass: 'text-slate-600', icon: AlertCircle, label: 'No Show' },
    Suspended: { colorClass: 'text-red-700', icon: XCircle, label: 'Suspended' },
  };

  const entry = config[status] || {
    colorClass: 'text-slate-700',
    icon: Clock,
    label: status,
  };
  const Icon = entry.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${entry.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{entry.label}</span>
    </span>
  );
}

export function CategoryIcon({ slug, className = 'w-5 h-5' }: { slug: CategorySlug; className?: string }) {
  switch (slug) {
    case 'hospital':
      return <Stethoscope className={className} aria-hidden="true" />;
    case 'gym':
      return <Dumbbell className={className} aria-hidden="true" />;
    case 'car_service':
      return <Car className={className} aria-hidden="true" />;
    case 'salon':
      return <Scissors className={className} aria-hidden="true" />;
    default:
      return <Building2 className={className} aria-hidden="true" />;
  }
}

export function ImageWithFallback({
  src,
  alt,
  categorySlug = 'other',
  className = '',
}: {
  src: string;
  alt: string;
  categorySlug?: CategorySlug;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <CategoryIcon slug={categorySlug} className="w-7 h-7 mb-1.5 text-slate-400" />
        <span className="text-xs font-medium text-slate-600 line-clamp-1">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
