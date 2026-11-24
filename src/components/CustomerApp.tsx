import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  Bell,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  History,
  MapPin,
  Monitor,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  User,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  Appointment,
  AppointmentHistoryEntry,
  AvailabilityConfig,
  Business,
  Category,
  City,
  Department,
  NotificationItem,
  PublicUser,
  ServiceItem,
  StaffMember,
  TimeSlot,
  Vehicle,
} from '../types';
import { CategoryIcon, ImageWithFallback, StatusText } from './StatusText';

interface CustomerAppProps {
  user: PublicUser | null;
  token: string | null;
  onOpenAuth: (mode?: 'customer_login' | 'customer_register' | 'workspace', personaId?: string) => void;
  onUserUpdated: (user: PublicUser) => void;
}

type CustomerTab = 'discover' | 'bookings' | 'notifications' | 'profile';
type DiscoverStep = 'home' | 'city' | 'businesses' | 'details' | 'confirmation';
type BookingsTab = 'Upcoming' | 'Pending' | 'Completed' | 'Cancelled';

function getTodayDateString(offsetDays = 0): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getGreetingLabel(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function CustomerApp({ user, token, onOpenAuth, onUserUpdated }: CustomerAppProps) {
  const [mobilePreview, setMobilePreview] = useState(false);
  const [activeTab, setActiveTab] = useState<CustomerTab>('discover');
  const [step, setStep] = useState<DiscoverStep>('home');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingSlide, setOnboardingSlide] = useState(0);

  // Discovery state
  const [categories, setCategories] = useState<Category[]>([]);
  const [cities, setCities] = useState<(City & { hasBusinesses?: boolean })[]>([]);
  const [popularBusinesses, setPopularBusinesses] = useState<Business[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Business[]>([]);
  const [homeSearchQuery, setHomeSearchQuery] = useState('');
  const [homeSearchResults, setHomeSearchResults] = useState<Business[] | null>(null);

  // Category -> City -> Business state
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [recentCity, setRecentCity] = useState<City | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [filteredBusinesses, setFilteredBusinesses] = useState<Business[]>([]);
  const [businessSearch, setBusinessSearch] = useState('');
  const [hospitalSpecFilter, setHospitalSpecFilter] = useState('');
  const [hospitalTypeFilter, setHospitalTypeFilter] = useState('');

  // Business Details & Booking Workflow state
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [availabilityConfig, setAvailabilityConfig] = useState<AvailabilityConfig | null>(null);

  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [doctorSearch, setDoctorSearch] = useState<string>('');
  const [profileDoctor, setProfileDoctor] = useState<StaffMember | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString(1));
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsClosedReason, setSlotsClosedReason] = useState<string | undefined>(undefined);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string>('');

  // Category-specific & common booking inputs
  const [customerNotes, setCustomerNotes] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('Female');
  const [patientSymptoms, setPatientSymptoms] = useState('');

  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleFuel, setVehicleFuel] = useState('Petrol');
  const [vehicleYear, setVehicleYear] = useState('2023');

  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // Customer data (bookings, notifications, vehicles, profile)
  const [bookings, setBookings] = useState<Appointment[]>([]);
  const [bookingHistory, setBookingHistory] = useState<AppointmentHistoryEntry[]>([]);
  const [bookingsTab, setBookingsTab] = useState<BookingsTab>('Upcoming');
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(getTodayDateString(2));
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Profile form state
  const [profName, setProfName] = useState(user?.name || '');
  const [profMobile, setProfMobile] = useState(user?.mobile || '');
  const [profEmail, setProfEmail] = useState(user?.email || '');
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg, setProfMsg] = useState<string | null>(null);
  const [newVehBrand, setNewVehBrand] = useState('');
  const [newVehModel, setNewVehModel] = useState('');
  const [newVehReg, setNewVehReg] = useState('');
  const [newVehFuel, setNewVehFuel] = useState('Hybrid');
  const [newVehYear, setNewVehYear] = useState('2024');

  // Initial public catalog fetch
  useEffect(() => {
    Promise.all([
      apiRequest<{ categories: Category[] }>('/api/categories'),
      apiRequest<{ cities: City[] }>('/api/cities'),
      apiRequest<{ businesses: Business[] }>('/api/businesses?popular=true'),
    ])
      .then(([catRes, cityRes, popRes]) => {
        setCategories(catRes.categories);
        setCities(cityRes.cities);
        setPopularBusinesses(popRes.businesses);
      })
      .catch(() => {});
  }, []);

  const refreshCustomerData = useCallback(async () => {
    if (!token || !user) {
      setBookings([]);
      setNotifications([]);
      setVehicles([]);
      return;
    }
    try {
      const [bookRes, notRes, vehRes] = await Promise.all([
        apiRequest<{ bookings: Appointment[]; history: AppointmentHistoryEntry[] }>(
          '/api/appointments/my-bookings',
          { token }
        ),
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications', { token }),
        apiRequest<{ vehicles: Vehicle[] }>('/api/vehicles', { token }),
      ]);
      setBookings(bookRes.bookings);
      setBookingHistory(bookRes.history);
      setNotifications(notRes.notifications);
      setVehicles(vehRes.vehicles);
    } catch {
      // Ignore transient errors
    }
  }, [token, user]);

  useEffect(() => {
    refreshCustomerData();
    if (user) {
      setProfName(user.name);
      setProfMobile(user.mobile);
      setProfEmail(user.email);
      if (!patientName) setPatientName(user.name);
    }
  }, [user, refreshCustomerData, patientName]);

  // Live home search
  useEffect(() => {
    const q = homeSearchQuery.trim();
    if (!q) {
      setHomeSearchResults(null);
      return;
    }
    const timer = setTimeout(() => {
      apiRequest<{ businesses: Business[] }>(`/api/businesses?q=${encodeURIComponent(q)}`)
        .then((res) => setHomeSearchResults(res.businesses))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [homeSearchQuery]);

  // Fetch cities annotated with business availability for selected category
  useEffect(() => {
    if (!selectedCategory) return;
    apiRequest<{ cities: (City & { hasBusinesses?: boolean })[] }>(
      `/api/cities?category=${encodeURIComponent(selectedCategory.slug)}`
    )
      .then((res) => setCities(res.cities))
      .catch(() => {});
  }, [selectedCategory]);

  // Fetch businesses when category & city change
  useEffect(() => {
    if (!selectedCategory || !selectedCity) return;
    const params = new URLSearchParams({
      category: selectedCategory.slug,
      cityId: selectedCity.id,
    });
    if (businessSearch.trim()) params.set('q', businessSearch.trim());
    if (hospitalSpecFilter.trim()) params.set('specialization', hospitalSpecFilter.trim());
    if (hospitalTypeFilter.trim()) params.set('hospitalType', hospitalTypeFilter.trim());

    apiRequest<{ businesses: Business[] }>(`/api/businesses?${params.toString()}`)
      .then((res) => setFilteredBusinesses(res.businesses))
      .catch(() => {});
  }, [selectedCategory, selectedCity, businessSearch, hospitalSpecFilter, hospitalTypeFilter]);

  const totalSelectedDuration = useMemo(() => {
    const picked = services.filter((s) => selectedServiceIds.includes(s.id));
    if (picked.length === 0) return 30;
    return picked.reduce((sum, s) => sum + s.durationMinutes, 0);
  }, [services, selectedServiceIds]);

  const totalSelectedPrice = useMemo(() => {
    const picked = services.filter((s) => selectedServiceIds.includes(s.id));
    const base = picked.reduce((sum, s) => sum + s.price, 0);
    if (activeBusiness?.categorySlug === 'hospital' && selectedStaffId) {
      const doc = staffList.find((s) => s.id === selectedStaffId);
      if (doc?.consultationFee) return doc.consultationFee;
    }
    return base;
  }, [services, selectedServiceIds, activeBusiness, selectedStaffId, staffList]);

  // Fetch real-time available time slots
  useEffect(() => {
    if (step !== 'details' || !activeBusiness || !selectedDate) return;
    setSlotsLoading(true);
    setSelectedTime('');
    const params = new URLSearchParams({
      businessId: activeBusiness.id,
      date: selectedDate,
      durationMinutes: String(totalSelectedDuration),
    });
    if (selectedStaffId) params.set('staffId', selectedStaffId);

    apiRequest<{ slots: TimeSlot[]; closedReason?: string }>(`/api/availability?${params.toString()}`)
      .then((res) => {
        setSlots(res.slots);
        setSlotsClosedReason(res.closedReason);
      })
      .catch(() => {
        setSlots([]);
      })
      .finally(() => setSlotsLoading(false));
  }, [step, activeBusiness, selectedDate, selectedStaffId, totalSelectedDuration]);

  // Fetch reschedule slots when reschedule modal is open
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
      .then((res) => {
        setRescheduleSlots(res.slots);
        setRescheduleTime('');
      })
      .catch(() => setRescheduleSlots([]));
  }, [rescheduleTarget, rescheduleDate]);

  async function openBusinessDetails(business: Business) {
    setBookingError(null);
    setSelectedTime('');
    setCustomerNotes('');
    setSelectedDepartmentId('');
    setSelectedStaffId('');
    setDoctorSearch('');
    setSelectedServiceIds([]);

    setRecentlyViewed((prev) => {
      const next = [business, ...prev.filter((b) => b.id !== business.id)];
      return next.slice(0, 4);
    });

    try {
      const res = await apiRequest<{
        business: Business;
        departments: Department[];
        services: ServiceItem[];
        staff: StaffMember[];
        availability: AvailabilityConfig | null;
      }>(`/api/businesses/${business.id}`);

      setActiveBusiness(res.business);
      setDepartments(res.departments);
      setServices(res.services);
      setStaffList(res.staff);
      setAvailabilityConfig(res.availability);

      if (res.business.categorySlug === 'hospital') {
        if (res.departments[0]) setSelectedDepartmentId(res.departments[0].id);
        if (res.services[0]) setSelectedServiceIds([res.services[0].id]);
      } else if (res.services[0]) {
        setSelectedServiceIds([res.services[0].id]);
      }

      if (vehicles[0] && !vehicleBrand) {
        setVehicleBrand(vehicles[0].brand);
        setVehicleModel(vehicles[0].model);
        setVehicleReg(vehicles[0].registrationNumber);
        setVehicleFuel(vehicles[0].fuelType);
        setVehicleYear(vehicles[0].manufacturingYear);
      }

      setActiveTab('discover');
      setStep('details');
    } catch {
      // Handle error
    }
  }

  function handleSelectCategory(cat: Category) {
    setSelectedCategory(cat);
    setBusinessSearch('');
    setHospitalSpecFilter('');
    setHospitalTypeFilter('');
    setCitySearch('');
    setStep('city');
  }

  function handleSelectCity(city: City) {
    setSelectedCity(city);
    setRecentCity(city);
    setStep('businesses');
  }

  function toggleServiceSelection(serviceId: string, allowMultiple: boolean) {
    if (allowMultiple) {
      setSelectedServiceIds((prev) =>
        prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
      );
    } else {
      setSelectedServiceIds([serviceId]);
    }
  }

  async function handleSubmitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!activeBusiness) return;
    setBookingError(null);

    if (!token || !user) {
      onOpenAuth('customer_login');
      return;
    }

    if (selectedServiceIds.length === 0) {
      setBookingError('Please select at least one service.');
      return;
    }
    if (activeBusiness.categorySlug === 'hospital' && (!selectedDepartmentId || !selectedStaffId)) {
      setBookingError('Please select a Department and Doctor.');
      return;
    }
    if (!selectedDate || !selectedTime) {
      setBookingError('Please select a date and an available time slot.');
      return;
    }

    setBookingSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        businessId: activeBusiness.id,
        departmentId: selectedDepartmentId || undefined,
        staffId: selectedStaffId || undefined,
        serviceIds: selectedServiceIds,
        date: selectedDate,
        time: selectedTime,
        customerNotes,
      };

      if (activeBusiness.categorySlug === 'hospital') {
        payload.patientDetails = {
          patientName: patientName || user.name,
          age: patientAge,
          gender: patientGender,
          symptoms: patientSymptoms,
        };
      }

      if (activeBusiness.categorySlug === 'car_service') {
        payload.vehicleDetails = {
          brand: vehicleBrand,
          model: vehicleModel,
          registrationNumber: vehicleReg,
          fuelType: vehicleFuel,
          manufacturingYear: vehicleYear,
        };
      }

      const res = await apiRequest<{ appointment: Appointment }>('/api/appointments', {
        method: 'POST',
        token,
        body: payload,
      });

      setConfirmedAppointment(res.appointment);
      setStep('confirmation');
      refreshCustomerData();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Unable to submit booking.');
    } finally {
      setBookingSubmitting(false);
    }
  }

  async function handleCancelBooking(appointmentId: string) {
    if (!token) return;
    try {
      await apiRequest(`/api/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        token,
        body: { reason: 'Cancelled by customer from My Bookings.' },
      });
      setActionMsg(`Booking ${appointmentId} cancelled.`);
      setDetailAppointment(null);
      refreshCustomerData();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Could not cancel booking.');
    }
  }

  async function handleSubmitReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !rescheduleTarget || !rescheduleTime) return;
    try {
      await apiRequest(`/api/appointments/${rescheduleTarget.id}/reschedule`, {
        method: 'POST',
        token,
        body: {
          date: rescheduleDate,
          time: rescheduleTime,
          reason: rescheduleReason || 'Customer requested a new time slot.',
        },
      });
      setActionMsg(`Reschedule request sent for ${rescheduleTarget.id}.`);
      setRescheduleTarget(null);
      setRescheduleReason('');
      refreshCustomerData();
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Could not submit reschedule request.');
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setProfSaving(true);
    setProfMsg(null);
    try {
      const res = await apiRequest<{ user: PublicUser }>('/api/auth/profile', {
        method: 'PATCH',
        token,
        body: { name: profName, mobile: profMobile, email: profEmail },
      });
      onUserUpdated(res.user);
      setProfMsg('Profile updated successfully.');
    } catch (err) {
      setProfMsg(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setProfSaving(false);
    }
  }

  async function handleAddVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      await apiRequest('/api/vehicles', {
        method: 'POST',
        token,
        body: {
          brand: newVehBrand,
          model: newVehModel,
          registrationNumber: newVehReg,
          fuelType: newVehFuel,
          manufacturingYear: newVehYear,
        },
      });
      setNewVehBrand('');
      setNewVehModel('');
      setNewVehReg('');
      refreshCustomerData();
    } catch {
      // Ignore error
    }
  }

  async function markNotificationRead(id: string) {
    if (!token) return;
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH', token });
    refreshCustomerData();
  }

  async function markAllNotificationsRead() {
    if (!token) return;
    await apiRequest('/api/notifications/mark-all-read', { method: 'POST', token });
    refreshCustomerData();
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const categorizedBookings = useMemo(() => {
    const map: Record<BookingsTab, Appointment[]> = {
      Upcoming: bookings.filter((b) => b.status === 'Approved' || b.status === 'Rescheduled'),
      Pending: bookings.filter((b) => b.status === 'Pending' || b.status === 'Reschedule Requested'),
      Completed: bookings.filter((b) => b.status === 'Completed' || b.status === 'No Show'),
      Cancelled: bookings.filter((b) => b.status === 'Cancelled' || b.status === 'Rejected'),
    };
    return map;
  }, [bookings]);

  const departmentDoctors = useMemo(() => {
    if (!activeBusiness || activeBusiness.categorySlug !== 'hospital') return staffList;
    const q = doctorSearch.trim().toLowerCase();
    return staffList.filter((s) => {
      if (s.departmentId !== selectedDepartmentId) return false;
      if (!q) return true;
      return `${s.name} ${s.qualification} ${s.specialization}`.toLowerCase().includes(q);
    });
  }, [activeBusiness, staffList, selectedDepartmentId, doctorSearch]);

  const groupedSlots = useMemo(() => {
    const morning: TimeSlot[] = [];
    const afternoon: TimeSlot[] = [];
    const evening: TimeSlot[] = [];
    for (const s of slots) {
      const hour = Number(s.time.split(':')[0]);
      if (hour < 12) morning.push(s);
      else if (hour < 16) afternoon.push(s);
      else evening.push(s);
    }
    return [
      { title: 'Morning', items: morning },
      { title: 'Afternoon', items: afternoon },
      { title: 'Evening', items: evening },
    ].filter((g) => g.items.length > 0);
  }, [slots]);

  const filteredCities = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    return cities.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)
    );
  }, [cities, citySearch]);

  const uniqueHospitalSpecs = useMemo(() => {
    const set = new Set<string>();
    filteredBusinesses.forEach((b) => b.specialties.forEach((s) => set.add(s)));
    return Array.from(set);
  }, [filteredBusinesses]);

  const onboardingSlides = [
    {
      title: 'One Platform, Every Appointment',
      body: 'Discover verified hospitals, fitness clubs, car service bays, and salons across Chennai, Coimbatore, Trichy, and Thiruvarur.',
    },
    {
      title: 'Verified Doctor Profiles & Real-Time Slots',
      body: 'Inspect qualifications, experience, consultation fees, and Morning/Afternoon slot availability before confirming.',
    },
    {
      title: 'Live Tracking & Instant Rescheduling',
      body: 'Receive status notifications and submit cancellation or reschedule requests directly from My Bookings.',
    },
  ];

  const bookingFlowStepIndex =
    step === 'home' ? 1 : step === 'city' ? 2 : step === 'businesses' ? 3 : step === 'details' ? 4 : 5;

  const appContent = (
    <div className={mobilePreview ? 'flex flex-col h-full min-h-0' : 'pb-20 md:pb-12'}>
      {mobilePreview && (
        <div className="shrink-0 z-30 flex items-center justify-between h-13 px-4 bg-white/95 backdrop-blur-md border-b border-slate-200">
          {activeTab === 'discover' && step !== 'home' ? (
            <button
              type="button"
              onClick={() => {
                if (step === 'city') setStep('home');
                else if (step === 'businesses') setStep('city');
                else if (step === 'details') setStep(selectedCity ? 'businesses' : 'home');
                else if (step === 'confirmation') setStep('home');
              }}
              className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-700"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <span className="font-display text-base font-bold text-slate-900">BookFlow</span>
          )}
          <span className="text-sm font-semibold text-slate-900 truncate">
            {activeTab === 'discover'
              ? step === 'home'
                ? 'Explore'
                : step === 'city'
                ? 'Select City'
                : step === 'businesses'
                ? selectedCategory?.name
                : step === 'details'
                ? activeBusiness?.name
                : 'Confirmed'
              : activeTab === 'bookings'
              ? 'My Bookings'
              : activeTab === 'notifications'
              ? 'Notifications'
              : 'Profile'}
          </span>
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center relative text-slate-700"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-2.5 right-2.5 text-[10px] font-mono font-bold text-blue-700">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      <div
        className={
          mobilePreview
            ? 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-6'
            : 'space-y-8'
        }
      >
        {activeTab === 'discover' && (
          <>
            {/* Step Progress Indicator when inside booking funnel */}
            {step !== 'home' && step !== 'confirmation' && (
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
                  {[
                    { idx: 1, label: 'Category' },
                    { idx: 2, label: 'City' },
                    { idx: 3, label: 'Provider' },
                    { idx: 4, label: 'Schedule & Book' },
                  ].map((item, i) => (
                    <span key={item.idx} className="inline-flex items-center gap-1.5">
                      {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                      <span
                        className={
                          bookingFlowStepIndex === item.idx
                            ? 'font-semibold text-blue-700'
                            : bookingFlowStepIndex > item.idx
                            ? 'text-slate-700 font-medium'
                            : 'text-slate-400'
                        }
                      >
                        0{item.idx}. {item.label}
                      </span>
                    </span>
                  ))}
                </div>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">
                  Step {bookingFlowStepIndex} of 4
                </span>
              </div>
            )}

            {step === 'home' && (
              <div className="space-y-8">
                {/* Clean Architectural Hero */}
                <section className="rounded-2xl bg-white border border-slate-200 p-6 md:p-8">
                  <div className={mobilePreview ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-center'}>
                    <div className={mobilePreview ? '' : 'lg:col-span-7'}>
                      <p className="text-xs font-medium text-blue-700 mb-1.5">
                        {getGreetingLabel()}
                        {user ? `, ${user.name}` : ' · Verified Local Scheduling'}
                      </p>
                      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                        Book trusted specialists, studios, and workshops in seconds.
                      </h1>
                      <p className="text-sm text-slate-600 mt-2 max-w-xl">
                        Select a category, pick your city across Tamil Nadu, compare verified specialists, and reserve real-time slots with zero double bookings.
                      </p>
                    </div>
                    <div className={mobilePreview ? '' : 'lg:col-span-5'}>
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                        <input
                          type="search"
                          value={homeSearchQuery}
                          onChange={(e) => setHomeSearchQuery(e.target.value)}
                          placeholder="Search hospitals, gyms, auto care, cities..."
                          className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {homeSearchResults && (
                    <div className="mt-5 pt-5 border-t border-slate-200">
                      <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-slate-900">
                          Search Results ({homeSearchResults.length})
                        </h2>
                        <button
                          type="button"
                          onClick={() => setHomeSearchQuery('')}
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          Clear search
                        </button>
                      </div>
                      {homeSearchResults.length === 0 ? (
                        <p className="text-sm text-slate-500">No providers matched "{homeSearchQuery}".</p>
                      ) : (
                        <div className={mobilePreview ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
                          {homeSearchResults.map((biz) => (
                            <button
                              key={biz.id}
                              type="button"
                              onClick={() => openBusinessDetails(biz)}
                              className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-600/50 transition-colors"
                            >
                              <p className="text-sm font-semibold text-slate-900">{biz.name}</p>
                              <p className="text-xs text-slate-500 mt-1">
                                {biz.cityName} · {biz.specialties.slice(0, 2).join(', ')}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Primary Categories */}
                <section>
                  <div className="flex items-end justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Browse by Category</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Choose a service domain to filter available cities and providers
                      </p>
                    </div>
                  </div>

                  <div
                    className={
                      mobilePreview
                        ? 'grid grid-cols-2 gap-3'
                        : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4'
                    }
                  >
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategory(cat)}
                        className="group text-left rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-600 transition-colors flex flex-col justify-between min-h-[128px]"
                      >
                        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-blue-700 group-hover:text-white flex items-center justify-center transition-colors">
                          <CategoryIcon slug={cat.slug} className="w-5 h-5" />
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">{cat.name}</span>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700" />
                          </div>
                          {!mobilePreview && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{cat.description}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Upcoming Appointments Strip */}
                {user && categorizedBookings.Upcoming.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold text-slate-900">Upcoming Appointments</h2>
                      <button
                        type="button"
                        onClick={() => setActiveTab('bookings')}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        View all bookings
                      </button>
                    </div>
                    <div className={mobilePreview ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
                      {categorizedBookings.Upcoming.slice(0, 2).map((apt) => (
                        <div
                          key={apt.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="font-mono">{apt.id}</span>
                              <span aria-hidden="true">·</span>
                              <StatusText status={apt.status} />
                            </div>
                            <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
                              {apt.businessName}
                            </p>
                            <p className="text-xs text-slate-600 mt-0.5 truncate">
                              {apt.serviceNames.join(', ')}
                              {apt.staffName ? ` · ${apt.staffName}` : ''} · {apt.date} at {apt.time}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDetailAppointment(apt);
                              setActiveTab('bookings');
                            }}
                            className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-blue-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                          >
                            Details
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Popular Providers */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Featured Providers</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Highest-rated medical centers, studios, auto bays, and salons
                      </p>
                    </div>
                  </div>
                  <div
                    className={
                      mobilePreview ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5'
                    }
                  >
                    {popularBusinesses.map((biz) => (
                      <button
                        key={biz.id}
                        type="button"
                        onClick={() => openBusinessDetails(biz)}
                        className="group text-left rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-blue-600/60 transition-colors flex flex-col"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden bg-slate-100">
                          <ImageWithFallback
                            src={biz.imageUrl}
                            alt={biz.name}
                            categorySlug={biz.categorySlug}
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                          />
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                              {biz.name}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                              <span>{biz.cityName}</span>
                              {biz.rating && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium">
                                    <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                    {biz.rating.toFixed(1)} ({biz.reviewCount})
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100 truncate">
                            {biz.workingHoursSummary}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Recently Viewed */}
                {recentlyViewed.length > 0 && (
                  <section>
                    <h2 className="text-base font-semibold text-slate-900 mb-3">Recently Viewed</h2>
                    <div className={mobilePreview ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-4 gap-4'}>
                      {recentlyViewed.map((biz) => (
                        <button
                          key={biz.id}
                          type="button"
                          onClick={() => openBusinessDetails(biz)}
                          className="text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-blue-600/50 transition-colors flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
                            <CategoryIcon slug={biz.categorySlug} className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{biz.name}</p>
                            <p className="text-xs text-slate-500 truncate">{biz.cityName}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* STEP 2: CITY SELECTION */}
            {step === 'city' && selectedCategory && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <button
                      type="button"
                      onClick={() => setStep('home')}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline mb-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Change Category</span>
                    </button>
                    <h1 className="text-xl font-bold text-slate-900">
                      Select Your City for {selectedCategory.name}
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                      Only verified {selectedCategory.name.toLowerCase()} providers operating in your chosen city will appear.
                    </p>
                  </div>
                </div>

                <div className="relative max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="search"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder="Search city (Chennai, Coimbatore, Trichy, Thiruvarur)..."
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 pl-10 pr-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>

                {recentCity && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Recently Selected</p>
                    <button
                      type="button"
                      onClick={() => handleSelectCity(recentCity)}
                      className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-2.5 text-sm font-medium text-blue-900 hover:bg-blue-50"
                    >
                      <MapPin className="w-4 h-4 text-blue-700" />
                      <span>
                        {recentCity.name}, {recentCity.state}
                      </span>
                    </button>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-slate-500 mb-3">Available Cities</p>
                  <div className={mobilePreview ? 'space-y-2.5' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3'}>
                    {filteredCities.map((city) => (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => handleSelectCity(city)}
                        className="text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-600 transition-colors flex items-center justify-between min-h-[68px]"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {city.name}, {city.state}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {city.popular ? 'Popular City' : 'Service Area'}
                            {city.hasBusinesses === false ? ' · Coming soon' : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* STEP 3: BUSINESS LISTING */}
            {step === 'businesses' && selectedCategory && selectedCity && (
              <section className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                        <button
                          type="button"
                          onClick={() => setStep('home')}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          {selectedCategory.name}
                        </button>
                        <span>/</span>
                        <button
                          type="button"
                          onClick={() => setStep('city')}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          {selectedCity.name}, {selectedCity.state}
                        </button>
                      </div>
                      <h1 className="text-xl font-bold text-slate-900">
                        {selectedCategory.name} Providers in {selectedCity.name}
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep('city')}
                      className="min-h-[40px] px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Change City
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="search"
                        value={businessSearch}
                        onChange={(e) => setBusinessSearch(e.target.value)}
                        placeholder={`Search ${selectedCategory.name.toLowerCase()} by name or area...`}
                        className="w-full min-h-[40px] rounded-lg border border-slate-300 pl-10 pr-3 text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    {selectedCategory.slug === 'hospital' && (
                      <>
                        <select
                          value={hospitalSpecFilter}
                          onChange={(e) => setHospitalSpecFilter(e.target.value)}
                          className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
                        >
                          <option value="">All Departments</option>
                          {uniqueHospitalSpecs.map((spec) => (
                            <option key={spec} value={spec}>
                              {spec}
                            </option>
                          ))}
                        </select>
                        <select
                          value={hospitalTypeFilter}
                          onChange={(e) => setHospitalTypeFilter(e.target.value)}
                          className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
                        >
                          <option value="">All Hospital Types</option>
                          <option value="Multi-Specialty">Multi-Specialty Center</option>
                          <option value="Outpatient">Outpatient Clinic</option>
                        </select>
                      </>
                    )}
                  </div>
                </div>

                {filteredBusinesses.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                    <p className="text-base font-semibold text-slate-900">
                      No {selectedCategory.name} providers in {selectedCity.name} yet
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      Select another nearby city such as Chennai, Coimbatore, Trichy, or Thiruvarur.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep('city')}
                      className="mt-4 min-h-[44px] px-5 py-2 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
                    >
                      Choose Another City
                    </button>
                  </div>
                ) : (
                  <div className={mobilePreview ? 'space-y-4' : 'grid grid-cols-1 md:grid-cols-2 gap-5'}>
                    {filteredBusinesses.map((biz) => (
                      <div
                        key={biz.id}
                        className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[4/3] w-full bg-slate-100 overflow-hidden">
                          <ImageWithFallback
                            src={biz.imageUrl}
                            alt={biz.name}
                            categorySlug={biz.categorySlug}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h2 className="text-base font-bold text-slate-900">{biz.name}</h2>
                              {biz.rating && (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 shrink-0">
                                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                  {biz.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {biz.address} · {biz.contactNumber}
                            </p>
                            <p className="text-sm text-slate-600 mt-2.5">{biz.description}</p>
                            <p className="text-xs text-slate-500 mt-3">
                              Specialties: {biz.specialties.join(', ')}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              Facilities: {biz.facilities.join(', ')}
                            </p>
                          </div>
                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-slate-600 truncate">
                              {biz.workingHoursSummary}
                            </span>
                            <button
                              type="button"
                              onClick={() => openBusinessDetails(biz)}
                              className="min-h-[42px] px-4 py-2 rounded-lg bg-blue-700 text-xs font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                            >
                              View & Book
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* STEP 4: BUSINESS DETAILS & CATEGORY-SPECIFIC BOOKING FLOW */}
            {step === 'details' && activeBusiness && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(selectedCity ? 'businesses' : 'home')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to {selectedCity ? `${selectedCity.name} Listings` : 'Home'}</span>
                  </button>
                </div>

                {/* Business Overview Header */}
                <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className={mobilePreview ? 'flex flex-col' : 'grid grid-cols-1 lg:grid-cols-12 items-stretch'}>
                    <div className={mobilePreview ? 'aspect-[4/3]' : 'lg:col-span-5 aspect-[4/3] lg:aspect-auto'}>
                      <ImageWithFallback
                        src={activeBusiness.imageUrl}
                        alt={activeBusiness.name}
                        categorySlug={activeBusiness.categorySlug}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className={mobilePreview ? 'p-5 space-y-3' : 'lg:col-span-7 p-6 md:p-8 flex flex-col justify-between space-y-4'}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-medium text-blue-700">{activeBusiness.cityName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeBusiness.workingHoursSummary}</span>
                          {activeBusiness.rating && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                {activeBusiness.rating.toFixed(1)} ({activeBusiness.reviewCount} reviews)
                              </span>
                            </>
                          )}
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 mt-1">{activeBusiness.name}</h1>
                        <p className="text-sm text-slate-600 mt-2">{activeBusiness.description}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <span>{activeBusiness.address}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          <span>
                            {activeBusiness.contactNumber} · {activeBusiness.email}
                          </span>
                        </div>
                      </div>

                      {activeBusiness.membershipInfo && (
                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
                          <strong>Membership Info:</strong> {activeBusiness.membershipInfo}
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                <form
                  onSubmit={handleSubmitBooking}
                  className={mobilePreview ? 'space-y-5' : 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'}
                >
                  <div className={mobilePreview ? 'space-y-5' : 'lg:col-span-8 space-y-6'}>
                    {/* HOSPITAL: Step 1 - Department Selection */}
                    {activeBusiness.categorySlug === 'hospital' && (
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                        <h2 className="text-base font-semibold text-slate-900">
                          1. Select Hospital Department
                        </h2>
                        <div className={mobilePreview ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'}>
                          {departments.map((dept) => {
                            const active = selectedDepartmentId === dept.id;
                            return (
                              <button
                                key={dept.id}
                                type="button"
                                onClick={() => {
                                  setSelectedDepartmentId(dept.id);
                                  setSelectedStaffId('');
                                  setDoctorSearch('');
                                }}
                                className={`text-left rounded-xl border p-3.5 transition-colors ${
                                  active
                                    ? 'border-blue-600 bg-blue-50/50'
                                    : 'border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <p className="text-sm font-semibold text-slate-900">{dept.name}</p>
                                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{dept.description}</p>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* HOSPITAL: Step 2 - Doctor Selection + View Profile */}
                    {activeBusiness.categorySlug === 'hospital' && (
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="text-base font-semibold text-slate-900">
                              2. Select Specialist Doctor
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {departmentDoctors.length} verified specialist(s) in{' '}
                              {departments.find((d) => d.id === selectedDepartmentId)?.name}
                            </p>
                          </div>
                          <div className="relative w-full sm:w-64">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                            <input
                              type="search"
                              value={doctorSearch}
                              onChange={(e) => setDoctorSearch(e.target.value)}
                              placeholder="Search doctor or degree..."
                              className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs"
                            />
                          </div>
                        </div>

                        {departmentDoctors.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2">
                            No doctors matched your filter in this department.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {departmentDoctors.map((doc) => {
                              const active = selectedStaffId === doc.id;
                              return (
                                <div
                                  key={doc.id}
                                  className={`rounded-xl border p-4 transition-colors ${
                                    active
                                      ? 'border-blue-600 bg-blue-50/40'
                                      : 'border-slate-200 bg-white hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                                      <ImageWithFallback
                                        src={doc.imageUrl}
                                        alt={doc.name}
                                        categorySlug="hospital"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-bold text-slate-900">{doc.name}</p>
                                        <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                                          ₹{doc.consultationFee || 500}
                                        </span>
                                      </div>
                                      <p className="text-xs font-medium text-blue-700 mt-0.5">
                                        {doc.qualification}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5">
                                        <span>{doc.experienceYears} yrs experience</span>
                                        {doc.rating && (
                                          <>
                                            <span aria-hidden="true">·</span>
                                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                              {doc.rating.toFixed(1)} ({doc.reviewCount} reviews)
                                            </span>
                                          </>
                                        )}
                                        <span aria-hidden="true">·</span>
                                        <span>{doc.availableDays.join(', ')}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setProfileDoctor(doc)}
                                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      View Profile
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedStaffId(doc.id)}
                                      className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                        active
                                          ? 'bg-emerald-700 text-white'
                                          : 'bg-blue-700 text-white hover:bg-blue-800'
                                      }`}
                                    >
                                      {active ? 'Selected' : 'Select Doctor'}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}

                    {/* CAR SERVICE: Vehicle Details Form */}
                    {activeBusiness.categorySlug === 'car_service' && (
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="text-base font-semibold text-slate-900">1. Vehicle Details</h2>
                          {vehicles.length > 0 && (
                            <select
                              onChange={(e) => {
                                const v = vehicles.find((item) => item.id === e.target.value);
                                if (v) {
                                  setVehicleBrand(v.brand);
                                  setVehicleModel(v.model);
                                  setVehicleReg(v.registrationNumber);
                                  setVehicleFuel(v.fuelType);
                                  setVehicleYear(v.manufacturingYear);
                                }
                              }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
                              defaultValue=""
                            >
                              <option value="" disabled>
                                Fill from saved vehicle...
                              </option>
                              {vehicles.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.brand} {v.model} ({v.registrationNumber})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Vehicle Brand
                            </label>
                            <input
                              type="text"
                              required
                              value={vehicleBrand}
                              onChange={(e) => setVehicleBrand(e.target.value)}
                              placeholder="Hyundai"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Vehicle Model
                            </label>
                            <input
                              type="text"
                              required
                              value={vehicleModel}
                              onChange={(e) => setVehicleModel(e.target.value)}
                              placeholder="Creta SX"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Registration Number
                            </label>
                            <input
                              type="text"
                              required
                              value={vehicleReg}
                              onChange={(e) => setVehicleReg(e.target.value)}
                              placeholder="TN-01-CD-4821"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">
                                Fuel Type
                              </label>
                              <select
                                value={vehicleFuel}
                                onChange={(e) => setVehicleFuel(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                              >
                                <option value="Petrol">Petrol</option>
                                <option value="Diesel">Diesel</option>
                                <option value="Hybrid">Hybrid</option>
                                <option value="Electric">Electric</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
                              <input
                                type="text"
                                required
                                value={vehicleYear}
                                onChange={(e) => setVehicleYear(e.target.value)}
                                placeholder="2023"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* SERVICES SELECTION */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-base font-semibold text-slate-900">
                          {activeBusiness.categorySlug === 'hospital'
                            ? '3. Consultation Type'
                            : activeBusiness.categorySlug === 'car_service'
                            ? '2. Select Car Services (Multiple Allowed)'
                            : '1. Select Service'}
                        </h2>
                        {activeBusiness.categorySlug === 'car_service' && (
                          <span className="text-xs font-mono text-slate-600 tabular-nums">
                            Est. Duration: {totalSelectedDuration} min
                          </span>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {services.map((srv) => {
                          const allowMultiple =
                            activeBusiness.categorySlug === 'car_service' ||
                            activeBusiness.categorySlug === 'salon';
                          const selected = selectedServiceIds.includes(srv.id);
                          return (
                            <button
                              key={srv.id}
                              type="button"
                              onClick={() => toggleServiceSelection(srv.id, allowMultiple)}
                              className={`w-full text-left rounded-xl border p-4 transition-colors flex items-center justify-between gap-4 ${
                                selected
                                  ? 'border-blue-600 bg-blue-50/50'
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                                      selected
                                        ? 'bg-blue-700 border-blue-700 text-white'
                                        : 'border-slate-300 bg-white'
                                    }`}
                                  >
                                    {selected && <Check className="w-3 h-3" />}
                                  </span>
                                  <span className="text-sm font-semibold text-slate-900">{srv.name}</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1 ml-6">{srv.description}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                                  ₹{srv.price}
                                </p>
                                <p className="text-xs text-slate-500 tabular-nums">
                                  {srv.durationMinutes} min
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    {/* OPTIONAL STAFF SELECTION */}
                    {activeBusiness.categorySlug !== 'hospital' && staffList.length > 0 && (
                      <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                        <h2 className="text-base font-semibold text-slate-900">
                          Select{' '}
                          {activeBusiness.categorySlug === 'gym'
                            ? 'Trainer (Optional)'
                            : activeBusiness.categorySlug === 'salon'
                            ? 'Stylist / Specialist (Optional)'
                            : 'Professional (Optional)'}
                        </h2>
                        <div className={mobilePreview ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
                          <button
                            type="button"
                            onClick={() => setSelectedStaffId('')}
                            className={`text-left rounded-xl border p-3.5 transition-colors ${
                              selectedStaffId === ''
                                ? 'border-blue-600 bg-blue-50/50'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-900">Any Available Professional</p>
                            <p className="text-xs text-slate-500 mt-0.5">Fastest available time slot</p>
                          </button>
                          {staffList.map((st) => {
                            const active = selectedStaffId === st.id;
                            return (
                              <button
                                key={st.id}
                                type="button"
                                onClick={() => setSelectedStaffId(st.id)}
                                className={`text-left rounded-xl border p-3.5 transition-colors flex items-center gap-3 ${
                                  active
                                    ? 'border-blue-600 bg-blue-50/50'
                                    : 'border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                                  <ImageWithFallback
                                    src={st.imageUrl}
                                    alt={st.name}
                                    categorySlug={activeBusiness.categorySlug}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{st.name}</p>
                                  <p className="text-xs text-slate-500 truncate">
                                    {st.roleTitle} · {st.availableDays.join(', ')}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* DATE & GROUPED TIME SLOT PICKER */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-base font-semibold text-slate-900">Select Date & Time Slot</h2>
                        {availabilityConfig && (
                          <span className="text-xs text-slate-500">
                            {availabilityConfig.workingDays.join(', ')} · {availabilityConfig.openTime}–
                            {availabilityConfig.closeTime}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Appointment Date
                          </label>
                          <input
                            type="date"
                            min={getTodayDateString(0)}
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono"
                          />
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {[0, 1, 2, 3].map((offset) => {
                            const d = getTodayDateString(offset);
                            const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : d.slice(5);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setSelectedDate(d)}
                                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap ${
                                  selectedDate === d
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {slotsLoading ? (
                        <p className="text-xs text-slate-500 py-4">Checking live slot availability...</p>
                      ) : slotsClosedReason ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                          {slotsClosedReason}
                        </div>
                      ) : groupedSlots.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">No time slots available for this date.</p>
                      ) : (
                        <div className="space-y-4">
                          {groupedSlots.map((group) => (
                            <div key={group.title} className="space-y-2">
                              <p className="text-xs font-semibold text-slate-500">{group.title}</p>
                              <div
                                className={
                                  mobilePreview
                                    ? 'grid grid-cols-3 gap-2'
                                    : 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5'
                                }
                              >
                                {group.items.map((slot) => {
                                  const active = selectedTime === slot.time;
                                  return (
                                    <button
                                      key={slot.time}
                                      type="button"
                                      disabled={!slot.available}
                                      onClick={() => setSelectedTime(slot.time)}
                                      title={slot.reason || 'Available'}
                                      className={`min-h-[44px] rounded-lg border px-2.5 py-2 text-xs font-mono transition-colors tabular-nums ${
                                        !slot.available
                                          ? 'border-slate-200 bg-slate-100 text-slate-400 line-through cursor-not-allowed'
                                          : active
                                          ? 'border-blue-700 bg-blue-700 text-white font-semibold'
                                          : 'border-slate-200 bg-white text-slate-800 hover:border-blue-600'
                                      }`}
                                    >
                                      {slot.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* PATIENT DETAILS OR NOTES */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 space-y-4">
                      <h2 className="text-base font-semibold text-slate-900">
                        {activeBusiness.categorySlug === 'hospital'
                          ? 'Patient Details'
                          : 'Additional Notes'}
                      </h2>

                      {activeBusiness.categorySlug === 'hospital' && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Patient Name
                            </label>
                            <input
                              type="text"
                              required
                              value={patientName}
                              onChange={(e) => setPatientName(e.target.value)}
                              placeholder="Full patient name"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                            <input
                              type="number"
                              required
                              min={0}
                              max={120}
                              value={patientAge}
                              onChange={(e) => setPatientAge(e.target.value)}
                              placeholder="29"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                            <select
                              value={patientGender}
                              onChange={(e) => setPatientGender(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            >
                              <option value="Female">Female</option>
                              <option value="Male">Male</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Symptoms / Reason for Visit
                            </label>
                            <input
                              type="text"
                              value={patientSymptoms}
                              onChange={(e) => setPatientSymptoms(e.target.value)}
                              placeholder="Describe primary symptoms or checkup purpose"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Customer Notes (Optional)
                        </label>
                        <textarea
                          rows={2}
                          value={customerNotes}
                          onChange={(e) => setCustomerNotes(e.target.value)}
                          placeholder="Any preferences or instructions for the business..."
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </section>
                  </div>

                  {/* RIGHT SUMMARY STICKY PANEL */}
                  <aside className={mobilePreview ? '' : 'lg:col-span-4 lg:sticky lg:top-6'}>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                      <h3 className="text-base font-semibold text-slate-900">Booking Summary</h3>

                      <div className="space-y-2 text-xs text-slate-600 border-t border-b border-slate-100 py-3.5">
                        <div className="flex justify-between gap-2">
                          <span>Business</span>
                          <span className="font-medium text-slate-900 text-right">{activeBusiness.name}</span>
                        </div>
                        {selectedDepartmentId && (
                          <div className="flex justify-between gap-2">
                            <span>Department</span>
                            <span className="font-medium text-slate-900">
                              {departments.find((d) => d.id === selectedDepartmentId)?.name}
                            </span>
                          </div>
                        )}
                        {selectedStaffId && (
                          <div className="flex justify-between gap-2">
                            <span>Professional</span>
                            <span className="font-medium text-slate-900 text-right">
                              {staffList.find((s) => s.id === selectedStaffId)?.name}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between gap-2">
                          <span>Services</span>
                          <span className="font-medium text-slate-900 text-right">
                            {services
                              .filter((s) => selectedServiceIds.includes(s.id))
                              .map((s) => s.name)
                              .join(', ') || 'None selected'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Date & Time</span>
                          <span className="font-mono font-medium text-slate-900 tabular-nums">
                            {selectedDate} {selectedTime || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>Estimated Duration</span>
                          <span className="font-mono font-medium text-slate-900 tabular-nums">
                            {totalSelectedDuration} min
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">Estimated Total</span>
                        <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
                          ₹{totalSelectedPrice}
                        </span>
                      </div>

                      {bookingError && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                          {bookingError}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={bookingSubmitting}
                        className="w-full min-h-[48px] rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
                      >
                        {bookingSubmitting
                          ? 'Submitting Request...'
                          : user
                          ? 'Submit Appointment Request'
                          : 'Sign In to Confirm Booking'}
                      </button>
                      <p className="text-[11px] text-slate-500 text-center inline-flex items-center justify-center gap-1 w-full">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Slot conflict protection verified on submission</span>
                      </p>
                    </div>
                  </aside>
                </form>
              </div>
            )}

            {/* STEP 5: CONFIRMATION */}
            {step === 'confirmation' && confirmedAppointment && (
              <section className="max-w-xl mx-auto rounded-2xl border border-slate-200 bg-white p-6 md:p-8 text-center space-y-5">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-xs font-mono font-semibold text-blue-700">
                    Booking Reference: {confirmedAppointment.id}
                  </p>
                  <h1 className="text-2xl font-bold text-slate-900 mt-1">
                    Appointment Request Submitted
                  </h1>
                  <p className="text-sm text-slate-600 mt-2">
                    Your request has been sent to {confirmedAppointment.businessName}. It is currently{' '}
                    <strong>Pending</strong> admin review and is reserved against duplicate bookings.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Service(s)</span>
                    <span className="font-medium text-slate-900">
                      {confirmedAppointment.serviceNames.join(', ')}
                    </span>
                  </div>
                  {confirmedAppointment.staffName && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Professional</span>
                      <span className="font-medium text-slate-900">{confirmedAppointment.staffName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scheduled For</span>
                    <span className="font-mono font-medium text-slate-900">
                      {confirmedAppointment.date} at {confirmedAppointment.time}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Fee</span>
                    <span className="font-mono font-semibold text-slate-900">
                      ₹{confirmedAppointment.totalPrice}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('bookings')}
                    className="flex-1 min-h-[44px] rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800"
                  >
                    View in My Bookings
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('home')}
                    className="flex-1 min-h-[44px] rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Back to Home
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {/* MY BOOKINGS TAB */}
        {activeTab === 'bookings' && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">My Bookings</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Track status updates, view history, reschedule, or cancel appointments
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {(['Upcoming', 'Pending', 'Completed', 'Cancelled'] as BookingsTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBookingsTab(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                      bookingsTab === t
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t} ({categorizedBookings[t].length})
                  </button>
                ))}
              </div>
            </div>

            {actionMsg && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 flex items-center justify-between">
                <span>{actionMsg}</span>
                <button type="button" onClick={() => setActionMsg(null)} className="font-medium underline">
                  Dismiss
                </button>
              </div>
            )}

            {!user ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
                <p className="text-base font-semibold text-slate-900">Sign in to view your bookings</p>
                <p className="text-sm text-slate-500">
                  Manage upcoming appointments, reschedule requests, and booking history.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenAuth('customer_login')}
                  className="min-h-[44px] px-5 py-2.5 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
                >
                  Sign In or Activate Demo Customer
                </button>
              </div>
            ) : categorizedBookings[bookingsTab].length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  No {bookingsTab.toLowerCase()} appointments
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('discover');
                    setStep('home');
                  }}
                  className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium text-blue-700 hover:bg-slate-50"
                >
                  Book an Appointment
                </button>
              </div>
            ) : (
              <div className={mobilePreview ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
                {categorizedBookings[bookingsTab].map((apt) => (
                  <div
                    key={apt.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-slate-500">{apt.id}</span>
                        <StatusText status={apt.status} />
                      </div>
                      <h2 className="text-base font-bold text-slate-900 mt-2">{apt.businessName}</h2>
                      <p className="text-xs text-slate-600 mt-1">
                        {apt.serviceNames.join(', ')}
                        {apt.staffName ? ` · ${apt.staffName}` : ''}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-3 font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {apt.date}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {apt.time} ({apt.durationMinutes}m)
                        </span>
                        <span className="font-semibold text-slate-900">₹{apt.totalPrice}</span>
                      </div>
                      {apt.rejectionReason && (
                        <p className="text-xs text-red-700 mt-2">Reason: {apt.rejectionReason}</p>
                      )}
                      {apt.requestedDate && apt.status === 'Reschedule Requested' && (
                        <p className="text-xs text-amber-700 mt-2">
                          Requested move to {apt.requestedDate} at {apt.requestedTime}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailAppointment(apt)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        View Details
                      </button>
                      {['Pending', 'Approved', 'Rescheduled'].includes(apt.status) && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRescheduleTarget(apt);
                              setRescheduleDate(apt.date);
                            }}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Reschedule Request
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelBooking(apt.id)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Cancel Request
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Notifications</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Status alerts for approvals, rejections, rescheduling, and reminders
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            {!user ? (
              <p className="text-sm text-slate-500 py-4">Sign in to view your appointment alerts.</p>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No notifications yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`py-3.5 flex items-start justify-between gap-4 ${
                      n.read ? 'opacity-70' : ''
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium text-blue-700">{n.event}</p>
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">{n.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                    </div>
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className="text-xs font-medium text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 shrink-0"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* PROFILE & VEHICLES TAB */}
        {activeTab === 'profile' && (
          <section className={mobilePreview ? 'space-y-5' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'}>
            <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
              <h1 className="text-lg font-bold text-slate-900">Customer Profile</h1>
              {!user ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Sign in or register to manage your contact details and saved vehicles.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('customer_register')}
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-blue-700 text-sm font-medium text-white"
                  >
                    Register / Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number</label>
                    <input
                      type="tel"
                      value={profMobile}
                      onChange={(e) => setProfMobile(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={profEmail}
                      onChange={(e) => setProfEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  {profMsg && <p className="text-xs text-emerald-700">{profMsg}</p>}
                  <button
                    type="submit"
                    disabled={profSaving}
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800"
                  >
                    {profSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                </form>
              )}
            </div>

            {user && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-900">Saved Vehicles (Car Service)</h2>
                <div className="space-y-2">
                  {vehicles.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-slate-200 p-3.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Car className="w-4 h-4 text-slate-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {v.brand} {v.model} ({v.manufacturingYear})
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {v.registrationNumber} · {v.fuelType}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddVehicle} className="pt-3 border-t border-slate-100 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Add Vehicle</p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Brand (e.g. Maruti)"
                      value={newVehBrand}
                      onChange={(e) => setNewVehBrand(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Model (e.g. Baleno)"
                      value={newVehModel}
                      onChange={(e) => setNewVehModel(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Plate (TN-01-AB-1234)"
                      value={newVehReg}
                      onChange={(e) => setNewVehReg(e.target.value)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <select
                        value={newVehFuel}
                        onChange={(e) => setNewVehFuel(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"
                      >
                        <option value="Hybrid">Hybrid</option>
                        <option value="Petrol">Petrol</option>
                        <option value="Electric">Electric</option>
                        <option value="Diesel">Diesel</option>
                      </select>
                      <input
                        type="text"
                        required
                        placeholder="Year"
                        value={newVehYear}
                        onChange={(e) => setNewVehYear(e.target.value)}
                        className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save Vehicle</span>
                  </button>
                </form>
              </div>
            )}
          </section>
        )}
      </div>

      {/* BOTTOM TAB BAR */}
      <nav
        aria-label="Mobile Customer Navigation"
        className={
          mobilePreview
            ? 'shrink-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 h-16'
            : 'md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 h-16'
        }
      >
        {[
          { id: 'discover' as const, label: 'Explore', icon: Compass },
          { id: 'bookings' as const, label: 'Bookings', icon: Calendar },
          { id: 'notifications' as const, label: 'Alerts', icon: Bell },
          { id: 'profile' as const, label: 'Profile', icon: User },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center min-h-[44px] text-[11px] font-medium ${
                active ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="mt-1">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Desktop Workspace Sub-Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: 'discover' as const, label: 'Explore & Book' },
            { id: 'bookings' as const, label: `My Bookings (${bookings.length})` },
            { id: 'notifications' as const, label: `Notifications${unreadCount ? ` (${unreadCount})` : ''}` },
            { id: 'profile' as const, label: 'Profile & Vehicles' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <button
            type="button"
            onClick={() => {
              setOnboardingSlide(0);
              setShowOnboarding(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-700" />
            <span>App Walkthrough</span>
          </button>
          <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMobilePreview(false)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                !mobilePreview ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Responsive Web</span>
            </button>
            <button
              type="button"
              onClick={() => setMobilePreview(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                mobilePreview ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile Frame (390px)</span>
            </button>
          </div>
        </div>
      </div>

      {mobilePreview ? (
        <div className="flex justify-center py-2">
          <div className="w-[390px] h-[760px] rounded-[36px] border-[8px] border-slate-900 bg-slate-50 shadow-2xl overflow-hidden relative flex flex-col">
            {appContent}
          </div>
        </div>
      ) : (
        appContent
      )}

      {/* Dedicated Doctor Profile Modal */}
      {profileDoctor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Doctor Profile"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <span className="text-sm font-semibold text-slate-900">Doctor Profile</span>
              <button
                type="button"
                onClick={() => setProfileDoctor(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-100 shrink-0">
                  <ImageWithFallback
                    src={profileDoctor.imageUrl}
                    alt={profileDoctor.name}
                    categorySlug="hospital"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{profileDoctor.name}</h3>
                  <p className="text-xs font-semibold text-blue-700 mt-0.5">{profileDoctor.roleTitle}</p>
                  <p className="text-xs text-slate-600 mt-1">{profileDoctor.qualification}</p>
                  {profileDoctor.rating && (
                    <p className="text-xs text-amber-700 font-semibold mt-1 inline-flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      {profileDoctor.rating.toFixed(1)} · {profileDoctor.reviewCount} verified reviews
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-center">
                <div>
                  <p className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                    {profileDoctor.experienceYears} yrs
                  </p>
                  <p className="text-[11px] text-slate-500">Experience</p>
                </div>
                <div>
                  <p className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                    ₹{profileDoctor.consultationFee || 500}
                  </p>
                  <p className="text-[11px] text-slate-500">Consultation Fee</p>
                </div>
                <div>
                  <p className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                    {profileDoctor.workingStart}–{profileDoctor.workingEnd}
                  </p>
                  <p className="text-[11px] text-slate-500">Clinic Hours</p>
                </div>
              </div>

              {profileDoctor.about && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-1">About Specialist</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">{profileDoctor.about}</p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Available Consulting Days</h4>
                <div className="flex flex-wrap gap-2">
                  {profileDoctor.availableDays.map((day) => (
                    <span
                      key={day}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1 bg-white"
                    >
                      <Award className="w-3.5 h-3.5 text-blue-700" />
                      {day}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedStaffId(profileDoctor.id);
                  setProfileDoctor(null);
                }}
                className="w-full min-h-[46px] rounded-xl bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
              >
                Book Consultation with {profileDoctor.name} · ₹{profileDoctor.consultationFee || 500}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Details + History Modal */}
      {detailAppointment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <p className="font-mono text-xs text-slate-500">{detailAppointment.id}</p>
                <h3 className="text-base font-bold text-slate-900">{detailAppointment.businessName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailAppointment(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <StatusText status={detailAppointment.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs border-t border-b border-slate-100 py-3">
                <div>
                  <span className="text-slate-500 block">Date & Time</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {detailAppointment.date} · {detailAppointment.time}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Duration & Total</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {detailAppointment.durationMinutes} min · ₹{detailAppointment.totalPrice}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500 block">Services</span>
                  <span className="font-medium text-slate-900">
                    {detailAppointment.serviceNames.join(', ')}
                  </span>
                </div>
                {detailAppointment.patientDetails && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Patient</span>
                    <span className="font-medium text-slate-900">
                      {detailAppointment.patientDetails.patientName} ({detailAppointment.patientDetails.age},{' '}
                      {detailAppointment.patientDetails.gender}) — {detailAppointment.patientDetails.symptoms}
                    </span>
                  </div>
                )}
                {detailAppointment.vehicleDetails && (
                  <div className="col-span-2">
                    <span className="text-slate-500 block">Vehicle</span>
                    <span className="font-medium text-slate-900">
                      {detailAppointment.vehicleDetails.brand} {detailAppointment.vehicleDetails.model} (
                      {detailAppointment.vehicleDetails.registrationNumber},{' '}
                      {detailAppointment.vehicleDetails.fuelType},{' '}
                      {detailAppointment.vehicleDetails.manufacturingYear})
                    </span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2">
                  <History className="w-3.5 h-3.5" />
                  <span>Appointment History</span>
                </div>
                <div className="space-y-2">
                  {bookingHistory
                    .filter((h) => h.appointmentId === detailAppointment.id)
                    .map((entry) => (
                      <div key={entry.id} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">
                            {entry.previousStatus} → {entry.newStatus}
                          </span>
                          <span className="text-slate-500 font-mono">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-0.5">{entry.note}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Request Modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmitReschedule}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Reschedule {rescheduleTarget.id}
              </h3>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">New Date</label>
              <input
                type="date"
                min={getTodayDateString(0)}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Available Slots</label>
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
                        : 'bg-white text-slate-800 border-slate-200 hover:border-blue-600'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason (Optional)</label>
              <input
                type="text"
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                placeholder="Schedule conflict, prefer afternoon..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!rescheduleTime}
              className="w-full min-h-[44px] rounded-lg bg-blue-700 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              Submit Reschedule Request
            </button>
          </form>
        </div>
      )}

      {/* Mobile Onboarding Tour Modal */}
      {showOnboarding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 text-center space-y-5">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold text-blue-700">BookFlow</span>
              <button
                type="button"
                onClick={() => setShowOnboarding(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Skip
              </button>
            </div>
            <div className="py-4 space-y-2">
              <p className="text-xs font-mono text-slate-400">
                0{onboardingSlide + 1} / 0{onboardingSlides.length}
              </p>
              <h3 className="text-xl font-bold text-slate-900">
                {onboardingSlides[onboardingSlide].title}
              </h3>
              <p className="text-sm text-slate-600">{onboardingSlides[onboardingSlide].body}</p>
            </div>
            <div className="flex gap-2 justify-center">
              {onboardingSlides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setOnboardingSlide(idx)}
                  className={`h-2 rounded-full transition-all ${
                    onboardingSlide === idx ? 'w-6 bg-blue-700' : 'w-2 bg-slate-200'
                  }`}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (onboardingSlide < onboardingSlides.length - 1) {
                  setOnboardingSlide(onboardingSlide + 1);
                } else {
                  setShowOnboarding(false);
                }
              }}
              className="w-full min-h-[44px] rounded-xl bg-blue-700 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {onboardingSlide < onboardingSlides.length - 1 ? 'Next' : 'Start Exploring'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
