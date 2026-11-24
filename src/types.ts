export type UserRole = 'customer' | 'business_admin' | 'staff' | 'super_admin';

export type CategorySlug = 'hospital' | 'gym' | 'car_service' | 'salon' | 'other';

export type BookingStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Reschedule Requested'
  | 'Rescheduled'
  | 'Cancelled'
  | 'Completed'
  | 'No Show';

export type NotificationEvent =
  | 'Booking Submitted'
  | 'Booking Approved'
  | 'Booking Rejected'
  | 'Appointment Rescheduled'
  | 'Booking Cancelled'
  | 'Appointment Reminder'
  | 'Appointment Completed';

export interface PublicUser {
  id: string;
  name: string;
  mobile: string;
  email: string;
  role: UserRole;
  businessId?: string;
  staffId?: string;
  verifiedOtp: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  slug: CategorySlug;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
}

export interface City {
  id: string;
  name: string;
  state: string;
  popular: boolean;
  active: boolean;
}

export interface Business {
  id: string;
  name: string;
  categoryId: string;
  categorySlug: CategorySlug;
  cityId: string;
  cityName: string;
  description: string;
  address: string;
  mapCoordinates: { lat: number; lng: number };
  contactNumber: string;
  email: string;
  imageUrl: string;
  workingHoursSummary: string;
  hospitalType?: string;
  specialties: string[];
  facilities: string[];
  membershipInfo?: string;
  status: 'Approved' | 'Pending Approval' | 'Suspended';
  popular: boolean;
  rating?: number;
  reviewCount?: number;
  createdAt: string;
}

export interface Department {
  id: string;
  businessId: string;
  name: string;
  description: string;
  active: boolean;
}

export interface ServiceItem {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  requiresStaff: boolean;
  active: boolean;
}

export interface StaffMember {
  id: string;
  businessId: string;
  departmentId?: string;
  name: string;
  imageUrl: string;
  initials?: string;
  roleTitle: string;
  qualification: string;
  specialization: string;
  experienceYears: number;
  consultationFee?: number;
  rating?: number;
  reviewCount?: number;
  about?: string;
  assignedServiceIds: string[];
  workingStart: string;
  workingEnd: string;
  availableDays: string[];
  active: boolean;
}

export interface Vehicle {
  id: string;
  customerId: string;
  brand: string;
  model: string;
  registrationNumber: string;
  fuelType: string;
  manufacturingYear: string;
}

export interface AvailabilityConfig {
  businessId: string;
  workingDays: string[];
  openTime: string;
  closeTime: string;
  breakStart?: string;
  breakEnd?: string;
  slotDurationMinutes: number;
  maxBookingsPerSlot: number;
  holidays: string[];
}

export interface TimeSlot {
  time: string;
  label: string;
  available: boolean;
  reason?: string;
  remainingCapacity: number;
}

export interface PatientDetails {
  patientName: string;
  age: string;
  gender: string;
  symptoms: string;
}

export interface VehicleDetails {
  brand: string;
  model: string;
  registrationNumber: string;
  fuelType: string;
  manufacturingYear: string;
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  customerMobile: string;
  categoryId: string;
  categorySlug: CategorySlug;
  businessId: string;
  businessName: string;
  departmentId?: string;
  departmentName?: string;
  serviceIds: string[];
  serviceNames: string[];
  staffId?: string;
  staffName?: string;
  date: string;
  time: string;
  durationMinutes: number;
  totalPrice: number;
  customerNotes: string;
  patientDetails?: PatientDetails;
  vehicleDetails?: VehicleDetails;
  status: BookingStatus;
  rejectionReason?: string;
  rescheduleReason?: string;
  requestedDate?: string;
  requestedTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentHistoryEntry {
  id: string;
  appointmentId: string;
  previousStatus: BookingStatus | 'New';
  newStatus: BookingStatus;
  actorName: string;
  actorRole: UserRole;
  note: string;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  recipientUserId?: string;
  recipientBusinessId?: string;
  recipientRole: UserRole;
  appointmentId?: string;
  event: NotificationEvent;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface DemoPersonaOption {
  id: string;
  label: string;
  role: UserRole;
  businessName?: string;
  subtitle: string;
}
