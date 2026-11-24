import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import {
  createAuthMiddleware,
  extractBearerToken,
  hasEnvAdminPasscode,
  hashPassword,
  requireRoles,
  signSessionToken,
  verifyEnvAdminPasscode,
  verifyPassword,
  verifySessionToken,
} from './server/auth.ts';
import { computeAvailableTimeSlots } from './server/availability.ts';
import { db } from './server/db.ts';
import type {
  Appointment,
  AppointmentHistoryEntry,
  BookingStatus,
  NotificationEvent,
  NotificationItem,
  PublicUser,
} from './src/types.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '1mb' }));

// Simple in-memory rate limiter for auth endpoints
const authAttempts = new Map<string, { count: number; resetAt: number }>();
function rateLimitAuth(req: Request, res: Response, next: () => void): void {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = authAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(key, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }
  if (entry.count >= 40) {
    res.status(429).json({ error: 'Too many authentication attempts. Please wait a minute.' });
    return;
  }
  entry.count += 1;
  next();
}

// In-memory OTP store (keyed by normalized mobile)
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

function getPublicUserById(id: string): PublicUser | null {
  const found = db.getState().users.find((u) => u.id === id);
  return found ? db.toPublicUser(found) : null;
}

const requireAuth = createAuthMiddleware(getPublicUserById);

function createNotification(params: {
  recipientUserId?: string;
  recipientBusinessId?: string;
  recipientRole: 'customer' | 'business_admin' | 'staff' | 'super_admin';
  appointmentId?: string;
  event: NotificationEvent;
  title: string;
  message: string;
}): void {
  const state = db.getState();
  const item: NotificationItem = {
    id: `not-${crypto.randomUUID().slice(0, 8)}`,
    recipientUserId: params.recipientUserId,
    recipientBusinessId: params.recipientBusinessId,
    recipientRole: params.recipientRole,
    appointmentId: params.appointmentId,
    event: params.event,
    title: params.title,
    message: params.message,
    read: false,
    createdAt: new Date().toISOString(),
  };
  state.notifications.unshift(item);
}

function recordHistory(params: {
  appointmentId: string;
  previousStatus: BookingStatus | 'New';
  newStatus: BookingStatus;
  actorName: string;
  actorRole: 'customer' | 'business_admin' | 'staff' | 'super_admin';
  note: string;
}): void {
  const entry: AppointmentHistoryEntry = {
    id: `hist-${crypto.randomUUID().slice(0, 8)}`,
    appointmentId: params.appointmentId,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    actorName: params.actorName,
    actorRole: params.actorRole,
    note: params.note,
    timestamp: new Date().toISOString(),
  };
  db.getState().appointmentHistory.unshift(entry);
}

function generateBookingId(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(1000 + Math.random() * 9000);
  const candidate = `BK-${year}-${num}`;
  const exists = db.getState().appointments.some((a) => a.id === candidate);
  return exists ? `BK-${year}-${crypto.randomUUID().slice(0, 4).toUpperCase()}` : candidate;
}

function sanitizeString(val: unknown, maxLen = 250): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function checkAdminPasscode(passcode: string): boolean {
  if (hasEnvAdminPasscode()) {
    return verifyEnvAdminPasscode(passcode);
  }
  const storedHash = db.getState().adminPasscodeHash;
  if (!storedHash) return false;
  return verifyPassword(passcode, storedHash);
}

// ---------------------------------------------------------------------------
// AUTH & WORKSPACE ROUTES
// ---------------------------------------------------------------------------

app.get('/api/auth/workspace-status', (_req, res) => {
  const state = db.getState();
  const envConfigured = hasEnvAdminPasscode();
  const claimed = envConfigured || Boolean(state.adminPasscodeHash);
  res.json({
    adminPasscodeConfigured: claimed,
    envPasscodeActive: envConfigured,
    demoPersonas: db.getDemoPersonas(),
  });
});

app.post('/api/auth/claim-admin', rateLimitAuth, (req, res) => {
  const state = db.getState();
  if (hasEnvAdminPasscode() || state.adminPasscodeHash) {
    res.status(409).json({ error: 'Workspace passcode is already configured. Please sign in.' });
    return;
  }
  const passcode = sanitizeString(req.body?.passcode, 100);
  const personaId = sanitizeString(req.body?.personaId, 60) || 'usr-adm-hosp-1';
  if (passcode.length < 4) {
    res.status(400).json({ error: 'Please choose a passcode of at least 4 characters.' });
    return;
  }
  const targetUser = state.users.find((u) => u.id === personaId);
  if (!targetUser) {
    res.status(400).json({ error: 'Invalid workspace role selected.' });
    return;
  }

  state.adminPasscodeHash = hashPassword(passcode);
  db.persist();

  const publicUser = db.toPublicUser(targetUser);
  const token = signSessionToken(publicUser);
  res.status(201).json({ token, user: publicUser });
});

app.post('/api/auth/admin-login', rateLimitAuth, (req, res) => {
  const passcode = sanitizeString(req.body?.passcode, 100);
  const personaId = sanitizeString(req.body?.personaId, 60) || 'usr-adm-hosp-1';
  if (!passcode) {
    res.status(400).json({ error: 'Workspace passcode is required.' });
    return;
  }
  if (!checkAdminPasscode(passcode)) {
    res.status(401).json({ error: 'Incorrect workspace passcode.' });
    return;
  }
  const targetUser = db.getState().users.find((u) => u.id === personaId);
  if (!targetUser) {
    res.status(404).json({ error: 'Requested demo account was not found.' });
    return;
  }
  const publicUser = db.toPublicUser(targetUser);
  const token = signSessionToken(publicUser);
  res.json({ token, user: publicUser });
});

app.post('/api/auth/switch-demo-role', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const currentUser = authReq.authUser!;
  const personaId = sanitizeString(req.body?.personaId, 60);
  const demoIds = new Set(db.getDemoPersonas().map((p) => p.id));

  // Only users signed into the demo workspace (non-custom customer or admin/staff demo accounts) can switch demo personas
  if (currentUser.role === 'customer' && !demoIds.has(currentUser.id)) {
    res.status(403).json({ error: 'Switch role is available only within the workspace demo session.' });
    return;
  }
  const targetUser = db.getState().users.find((u) => u.id === personaId);
  if (!targetUser || !demoIds.has(targetUser.id)) {
    res.status(404).json({ error: 'Demo persona not found.' });
    return;
  }
  const publicUser = db.toPublicUser(targetUser);
  const token = signSessionToken(publicUser);
  res.json({ token, user: publicUser });
});

app.post('/api/auth/register', rateLimitAuth, (req, res) => {
  const name = sanitizeString(req.body?.name, 80);
  const mobile = sanitizeString(req.body?.mobile, 30);
  const email = sanitizeString(req.body?.email, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const acceptedTerms = Boolean(req.body?.acceptedTerms);

  if (!name || !mobile) {
    res.status(400).json({ error: 'Full name and mobile number are required.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }
  if (!acceptedTerms) {
    res.status(400).json({ error: 'You must accept the Terms and Conditions to register.' });
    return;
  }

  const state = db.getState();
  const duplicate = state.users.find(
    (u) =>
      u.mobile.replace(/\s+/g, '') === mobile.replace(/\s+/g, '') ||
      (email && u.email.toLowerCase() === email)
  );
  if (duplicate) {
    res.status(409).json({ error: 'An account with this mobile number or email already exists.' });
    return;
  }

  const newUser = {
    id: `usr-cust-${crypto.randomUUID().slice(0, 8)}`,
    name,
    mobile,
    email: email || `${mobile.replace(/\D/g, '')}@customer.bookflow`,
    role: 'customer' as const,
    verifiedOtp: false,
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
  };

  state.users.push(newUser);
  db.persist();

  const publicUser = db.toPublicUser(newUser);
  const token = signSessionToken(publicUser);
  res.status(201).json({ token, user: publicUser });
});

app.post('/api/auth/login', rateLimitAuth, (req, res) => {
  const identifier = sanitizeString(req.body?.identifier, 120).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!identifier || !password) {
    res.status(400).json({ error: 'Email/mobile and password are required.' });
    return;
  }

  const user = db.getState().users.find(
    (u) =>
      u.email.toLowerCase() === identifier ||
      u.mobile.replace(/\s+/g, '').toLowerCase() === identifier.replace(/\s+/g, '')
  );

  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid credentials. Please check your email/mobile and password.' });
    return;
  }

  const publicUser = db.toPublicUser(user);
  const token = signSessionToken(publicUser);
  res.json({ token, user: publicUser });
});

app.post('/api/auth/send-otp', rateLimitAuth, (req, res) => {
  const mobile = sanitizeString(req.body?.mobile, 30);
  if (!mobile || mobile.replace(/\D/g, '').length < 7) {
    res.status(400).json({ error: 'Enter a valid mobile number.' });
    return;
  }
  const normalized = mobile.replace(/\s+/g, '');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(normalized, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    attempts: 0,
  });

  // In client demo mode without an SMS gateway, surface the verification code cleanly for OTP testing
  res.json({
    ok: true,
    expiresInSeconds: 600,
    demoOtpHint: process.env.NODE_ENV === 'production' ? undefined : code,
  });
});

app.post('/api/auth/verify-otp', rateLimitAuth, (req, res) => {
  const mobile = sanitizeString(req.body?.mobile, 30);
  const code = sanitizeString(req.body?.code, 12);
  const normalized = mobile.replace(/\s+/g, '');

  const record = otpStore.get(normalized);
  if (!record || Date.now() > record.expiresAt) {
    res.status(400).json({ error: 'Verification code expired or not requested.' });
    return;
  }
  if (record.attempts >= 5) {
    otpStore.delete(normalized);
    res.status(429).json({ error: 'Too many incorrect OTP attempts. Request a new code.' });
    return;
  }
  if (record.code !== code) {
    record.attempts += 1;
    res.status(400).json({ error: 'Invalid 6-digit OTP code.' });
    return;
  }

  otpStore.delete(normalized);

  // If user exists with this mobile, mark verified and issue session if authenticated or matching
  const state = db.getState();
  const user = state.users.find((u) => u.mobile.replace(/\s+/g, '') === normalized);
  if (user) {
    user.verifiedOtp = true;
    db.persist();
    const tokenHeader = extractBearerToken(req);
    const payload = tokenHeader ? verifySessionToken(tokenHeader) : null;
    if (payload && payload.userId === user.id) {
      res.json({ verified: true, user: db.toPublicUser(user) });
      return;
    }
    if (user.role === 'customer') {
      const pub = db.toPublicUser(user);
      res.json({ verified: true, user: pub, token: signSessionToken(pub) });
      return;
    }
  }

  res.json({ verified: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  res.json({ user: authReq.authUser });
});

app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const state = db.getState();
  const user = state.users.find((u) => u.id === authReq.authUser!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const name = sanitizeString(req.body?.name, 80);
  const email = sanitizeString(req.body?.email, 120).toLowerCase();
  const mobile = sanitizeString(req.body?.mobile, 30);

  if (name) user.name = name;
  if (email) user.email = email;
  if (mobile) user.mobile = mobile;
  db.persist();

  res.json({ user: db.toPublicUser(user) });
});

// ---------------------------------------------------------------------------
// CUSTOMER VEHICLES
// ---------------------------------------------------------------------------

app.get('/api/vehicles', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const vehicles = db.getState().vehicles.filter((v) => v.customerId === authReq.authUser!.id);
  res.json({ vehicles });
});

app.post('/api/vehicles', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const brand = sanitizeString(req.body?.brand, 50);
  const model = sanitizeString(req.body?.model, 50);
  const registrationNumber = sanitizeString(req.body?.registrationNumber, 30).toUpperCase();
  const fuelType = sanitizeString(req.body?.fuelType, 30);
  const manufacturingYear = sanitizeString(req.body?.manufacturingYear, 10);

  if (!brand || !model || !registrationNumber || !fuelType || !manufacturingYear) {
    res.status(400).json({ error: 'All vehicle fields are required.' });
    return;
  }

  const vehicle = {
    id: `veh-${crypto.randomUUID().slice(0, 8)}`,
    customerId: authReq.authUser!.id,
    brand,
    model,
    registrationNumber,
    fuelType,
    manufacturingYear,
  };
  db.getState().vehicles.push(vehicle);
  db.persist();
  res.status(201).json({ vehicle });
});

// ---------------------------------------------------------------------------
// PUBLIC DISCOVERY ROUTES (CATEGORIES, CITIES, BUSINESSES, SPECIFIC DOMAINS)
// ---------------------------------------------------------------------------

app.get('/api/categories', (_req, res) => {
  const categories = db
    .getState()
    .categories.filter((c) => c.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  res.json({ categories });
});

app.get('/api/cities', (req, res) => {
  const categorySlug = sanitizeString(req.query.category as string, 40);
  const state = db.getState();
  let cities = state.cities.filter((c) => c.active);

  if (categorySlug) {
    const cityIdsWithBusinesses = new Set(
      state.businesses
        .filter((b) => b.status === 'Approved' && b.categorySlug === categorySlug)
        .map((b) => b.cityId)
    );
    cities = cities.map((c) => ({
      ...c,
      hasBusinesses: cityIdsWithBusinesses.has(c.id),
    }));
  }

  res.json({ cities });
});

app.get('/api/businesses', (req, res) => {
  const categorySlug = sanitizeString(req.query.category as string, 40);
  const cityId = sanitizeString(req.query.cityId as string, 40);
  const search = sanitizeString(req.query.q as string, 100).toLowerCase();
  const specialization = sanitizeString(req.query.specialization as string, 60).toLowerCase();
  const hospitalType = sanitizeString(req.query.hospitalType as string, 60).toLowerCase();
  const popularOnly = req.query.popular === 'true';

  const state = db.getState();
  let list = state.businesses.filter((b) => b.status === 'Approved');

  if (categorySlug) list = list.filter((b) => b.categorySlug === categorySlug);
  if (cityId) list = list.filter((b) => b.cityId === cityId);
  if (popularOnly) list = list.filter((b) => b.popular);
  if (specialization) {
    list = list.filter((b) => b.specialties.some((s) => s.toLowerCase().includes(specialization)));
  }
  if (hospitalType) {
    list = list.filter((b) => (b.hospitalType || '').toLowerCase().includes(hospitalType));
  }
  if (search) {
    list = list.filter(
      (b) =>
        b.name.toLowerCase().includes(search) ||
        b.address.toLowerCase().includes(search) ||
        b.cityName.toLowerCase().includes(search) ||
        b.specialties.some((s) => s.toLowerCase().includes(search))
    );
  }

  res.json({ businesses: list });
});

app.get('/api/businesses/:id', (req, res) => {
  const state = db.getState();
  const business = state.businesses.find((b) => b.id === req.params.id && b.status === 'Approved');
  if (!business) {
    res.status(404).json({ error: 'Business not found.' });
    return;
  }
  const departments = state.departments.filter((d) => d.businessId === business.id && d.active);
  const services = state.services.filter((s) => s.businessId === business.id && s.active);
  const staff = state.staff.filter((st) => st.businessId === business.id && st.active);
  const availability = state.availability.find((a) => a.businessId === business.id) || null;
  res.json({ business, departments, services, staff, availability });
});

// Category-specific REST endpoints per SRS §16
app.get('/api/hospitals', (req, res) => {
  const cityId = sanitizeString(req.query.cityId as string, 40);
  const list = db
    .getState()
    .businesses.filter(
      (b) => b.status === 'Approved' && b.categorySlug === 'hospital' && (!cityId || b.cityId === cityId)
    );
  res.json({ hospitals: list });
});

app.get('/api/hospitals/:id', (req, res) => {
  const state = db.getState();
  const hospital = state.businesses.find(
    (b) => b.id === req.params.id && b.categorySlug === 'hospital' && b.status === 'Approved'
  );
  if (!hospital) {
    res.status(404).json({ error: 'Hospital not found.' });
    return;
  }
  const departments = state.departments.filter((d) => d.businessId === hospital.id && d.active);
  const doctors = state.staff.filter((s) => s.businessId === hospital.id && s.active);
  const services = state.services.filter((s) => s.businessId === hospital.id && s.active);
  res.json({ hospital, departments, doctors, services });
});

app.get('/api/hospitals/:id/departments', (req, res) => {
  const departments = db
    .getState()
    .departments.filter((d) => d.businessId === req.params.id && d.active);
  res.json({ departments });
});

app.get('/api/departments/:id/doctors', (req, res) => {
  const doctors = db
    .getState()
    .staff.filter((s) => s.departmentId === req.params.id && s.active);
  res.json({ doctors });
});

app.get('/api/gyms', (req, res) => {
  const cityId = sanitizeString(req.query.cityId as string, 40);
  const gyms = db
    .getState()
    .businesses.filter(
      (b) => b.status === 'Approved' && b.categorySlug === 'gym' && (!cityId || b.cityId === cityId)
    );
  res.json({ gyms });
});

app.get('/api/gyms/:id/services', (req, res) => {
  const services = db.getState().services.filter((s) => s.businessId === req.params.id && s.active);
  res.json({ services });
});

app.get('/api/gyms/:id/trainers', (req, res) => {
  const trainers = db.getState().staff.filter((s) => s.businessId === req.params.id && s.active);
  res.json({ trainers });
});

app.get('/api/car-centers', (req, res) => {
  const cityId = sanitizeString(req.query.cityId as string, 40);
  const carCenters = db
    .getState()
    .businesses.filter(
      (b) => b.status === 'Approved' && b.categorySlug === 'car_service' && (!cityId || b.cityId === cityId)
    );
  res.json({ carCenters });
});

app.get('/api/car-centers/:id/services', (req, res) => {
  const services = db.getState().services.filter((s) => s.businessId === req.params.id && s.active);
  res.json({ services });
});

app.get('/api/salons', (req, res) => {
  const cityId = sanitizeString(req.query.cityId as string, 40);
  const salons = db
    .getState()
    .businesses.filter(
      (b) => b.status === 'Approved' && b.categorySlug === 'salon' && (!cityId || b.cityId === cityId)
    );
  res.json({ salons });
});

app.get('/api/salons/:id/services', (req, res) => {
  const services = db.getState().services.filter((s) => s.businessId === req.params.id && s.active);
  res.json({ services });
});

app.get('/api/salons/:id/staff', (req, res) => {
  const staff = db.getState().staff.filter((s) => s.businessId === req.params.id && s.active);
  res.json({ staff });
});

// ---------------------------------------------------------------------------
// AVAILABILITY & APPOINTMENTS
// ---------------------------------------------------------------------------

app.get('/api/availability', (req, res) => {
  const businessId = sanitizeString(req.query.businessId as string, 60);
  const date = sanitizeString(req.query.date as string, 20);
  const staffId = sanitizeString(req.query.staffId as string, 60);
  const durationMinutes = Number(req.query.durationMinutes) || 30;
  const ignoreAppointmentId = sanitizeString(req.query.ignoreAppointmentId as string, 60);

  if (!businessId || !date) {
    res.status(400).json({ error: 'businessId and date are required.' });
    return;
  }

  const state = db.getState();
  const config = state.availability.find((a) => a.businessId === businessId);
  if (!config) {
    res.status(404).json({ error: 'Availability schedule not configured for this business.' });
    return;
  }

  const staffMember = staffId
    ? state.staff.find((s) => s.id === staffId && s.businessId === businessId && s.active) || null
    : null;

  const result = computeAvailableTimeSlots({
    date,
    config,
    appointments: state.appointments,
    staff: staffMember,
    requestedDurationMinutes: durationMinutes,
    ignoreAppointmentId: ignoreAppointmentId || undefined,
  });

  res.json({
    businessId,
    date,
    staffId: staffMember?.id || null,
    ...result,
  });
});

app.post('/api/appointments', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();

  const businessId = sanitizeString(req.body?.businessId, 60);
  const departmentId = sanitizeString(req.body?.departmentId, 60) || undefined;
  const staffId = sanitizeString(req.body?.staffId, 60) || undefined;
  const date = sanitizeString(req.body?.date, 20);
  const time = sanitizeString(req.body?.time, 10);
  const customerNotes = sanitizeString(req.body?.customerNotes, 400);
  const serviceIdsRaw = Array.isArray(req.body?.serviceIds) ? req.body.serviceIds : [];
  const serviceIds = serviceIdsRaw
    .filter((id: unknown): id is string => typeof id === 'string')
    .slice(0, 10);

  const business = state.businesses.find((b) => b.id === businessId && b.status === 'Approved');
  if (!business) {
    res.status(404).json({ error: 'Selected business is unavailable.' });
    return;
  }

  if (business.categorySlug === 'hospital') {
    if (!departmentId || !staffId) {
      res.status(400).json({ error: 'Hospital bookings require both a Department and a Doctor.' });
      return;
    }
  }

  const selectedServices = state.services.filter(
    (s) => s.businessId === business.id && s.active && serviceIds.includes(s.id)
  );
  if (selectedServices.length === 0) {
    res.status(400).json({ error: 'Please select at least one valid service.' });
    return;
  }

  const department = departmentId
    ? state.departments.find((d) => d.id === departmentId && d.businessId === business.id && d.active)
    : undefined;
  if (departmentId && !department) {
    res.status(400).json({ error: 'Selected department is not active for this hospital.' });
    return;
  }

  const staffMember = staffId
    ? state.staff.find((s) => s.id === staffId && s.businessId === business.id && s.active)
    : undefined;
  if (staffId && !staffMember) {
    res.status(400).json({ error: 'Selected professional is unavailable.' });
    return;
  }

  const config = state.availability.find((a) => a.businessId === business.id);
  if (!config) {
    res.status(400).json({ error: 'Business availability schedule is not configured.' });
    return;
  }

  const totalDuration = selectedServices.reduce((sum, s) => sum + s.durationMinutes, 0);
  const baseServiceTotal = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalPrice =
    business.categorySlug === 'hospital' && staffMember?.consultationFee
      ? staffMember.consultationFee
      : baseServiceTotal;

  // Validate slot availability at submission time (prevents double booking)
  const availabilityCheck = computeAvailableTimeSlots({
    date,
    config,
    appointments: state.appointments,
    staff: staffMember || null,
    requestedDurationMinutes: totalDuration,
  });

  const matchingSlot = availabilityCheck.slots.find((slot) => slot.time === time);
  if (!matchingSlot || !matchingSlot.available) {
    res.status(409).json({
      error: matchingSlot?.reason
        ? `Selected slot is unavailable (${matchingSlot.reason}). Please choose another time.`
        : availabilityCheck.closedReason || 'Selected date or time slot is no longer available.',
    });
    return;
  }

  // Category-specific payloads
  let patientDetails = undefined;
  if (business.categorySlug === 'hospital') {
    const p = req.body?.patientDetails;
    const patientName = sanitizeString(p?.patientName, 80) || user.name;
    const age = sanitizeString(p?.age, 10);
    const gender = sanitizeString(p?.gender, 20) || 'Not specified';
    const symptoms = sanitizeString(p?.symptoms, 300);
    if (!patientName || !age) {
      res.status(400).json({ error: 'Patient name and age are required for hospital bookings.' });
      return;
    }
    patientDetails = { patientName, age, gender, symptoms };
  }

  let vehicleDetails = undefined;
  if (business.categorySlug === 'car_service') {
    const v = req.body?.vehicleDetails;
    const brand = sanitizeString(v?.brand, 50);
    const model = sanitizeString(v?.model, 50);
    const registrationNumber = sanitizeString(v?.registrationNumber, 30).toUpperCase();
    const fuelType = sanitizeString(v?.fuelType, 30);
    const manufacturingYear = sanitizeString(v?.manufacturingYear, 10);
    if (!brand || !model || !registrationNumber || !fuelType || !manufacturingYear) {
      res.status(400).json({ error: 'Complete vehicle details are required for car service bookings.' });
      return;
    }
    vehicleDetails = { brand, model, registrationNumber, fuelType, manufacturingYear };
  }

  const nowIso = new Date().toISOString();
  const appointment: Appointment = {
    id: generateBookingId(),
    customerId: user.id,
    customerName: user.name,
    customerMobile: user.mobile,
    categoryId: business.categoryId,
    categorySlug: business.categorySlug,
    businessId: business.id,
    businessName: business.name,
    departmentId: department?.id,
    departmentName: department?.name,
    serviceIds: selectedServices.map((s) => s.id),
    serviceNames: selectedServices.map((s) => s.name),
    staffId: staffMember?.id,
    staffName: staffMember?.name,
    date,
    time,
    durationMinutes: totalDuration,
    totalPrice,
    customerNotes,
    patientDetails,
    vehicleDetails,
    status: 'Pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  state.appointments.unshift(appointment);

  recordHistory({
    appointmentId: appointment.id,
    previousStatus: 'New',
    newStatus: 'Pending',
    actorName: user.name,
    actorRole: user.role,
    note: `Booking submitted for ${appointment.serviceNames.join(', ')}.`,
  });

  createNotification({
    recipientUserId: user.id,
    recipientRole: 'customer',
    appointmentId: appointment.id,
    event: 'Booking Submitted',
    title: 'Booking request submitted',
    message: `Your request ${appointment.id} at ${business.name} for ${date} at ${matchingSlot.label} is awaiting confirmation.`,
  });

  createNotification({
    recipientBusinessId: business.id,
    recipientRole: 'business_admin',
    appointmentId: appointment.id,
    event: 'Booking Submitted',
    title: 'New appointment request received',
    message: `${user.name} requested ${appointment.serviceNames.join(', ')} on ${date} at ${matchingSlot.label}.`,
  });

  db.persist();
  res.status(201).json({ appointment });
});

app.get('/api/appointments/my-bookings', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const state = db.getState();
  const bookings = state.appointments.filter((a) => a.customerId === authReq.authUser!.id);
  const bookingIds = new Set(bookings.map((b) => b.id));
  const history = state.appointmentHistory.filter((h) => bookingIds.has(h.appointmentId));
  res.json({ bookings, history });
});

app.get('/api/appointments/:id', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();
  const appointment = state.appointments.find((a) => a.id === req.params.id);
  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }
  const allowed =
    user.role === 'super_admin' ||
    appointment.customerId === user.id ||
    (user.role === 'business_admin' && user.businessId === appointment.businessId) ||
    (user.role === 'staff' && user.staffId === appointment.staffId);
  if (!allowed) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  const history = state.appointmentHistory.filter((h) => h.appointmentId === appointment.id);
  res.json({ appointment, history });
});

app.post('/api/appointments/:id/cancel', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();
  const appointment = state.appointments.find((a) => a.id === req.params.id);
  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }
  if (appointment.customerId !== user.id && user.role !== 'super_admin') {
    res.status(403).json({ error: 'Only the booking customer can cancel this appointment.' });
    return;
  }
  if (['Completed', 'Cancelled', 'Rejected'].includes(appointment.status)) {
    res.status(400).json({ error: `Cannot cancel an appointment in ${appointment.status} state.` });
    return;
  }

  const prevStatus = appointment.status;
  const reason = sanitizeString(req.body?.reason, 250) || 'Cancelled by customer.';
  appointment.status = 'Cancelled';
  appointment.updatedAt = new Date().toISOString();

  recordHistory({
    appointmentId: appointment.id,
    previousStatus: prevStatus,
    newStatus: 'Cancelled',
    actorName: user.name,
    actorRole: user.role,
    note: reason,
  });

  createNotification({
    recipientUserId: appointment.customerId,
    recipientRole: 'customer',
    appointmentId: appointment.id,
    event: 'Booking Cancelled',
    title: 'Booking cancelled',
    message: `Booking ${appointment.id} at ${appointment.businessName} has been cancelled.`,
  });

  createNotification({
    recipientBusinessId: appointment.businessId,
    recipientRole: 'business_admin',
    appointmentId: appointment.id,
    event: 'Booking Cancelled',
    title: 'Customer cancelled booking',
    message: `${appointment.customerName} cancelled ${appointment.id} (${appointment.date} ${appointment.time}).`,
  });

  db.persist();
  res.json({ appointment });
});

app.post('/api/appointments/:id/reschedule', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();
  const appointment = state.appointments.find((a) => a.id === req.params.id);
  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }
  if (appointment.customerId !== user.id) {
    res.status(403).json({ error: 'Only the booking customer can request rescheduling.' });
    return;
  }
  if (['Completed', 'Cancelled', 'Rejected', 'No Show'].includes(appointment.status)) {
    res.status(400).json({ error: `Cannot reschedule an appointment in ${appointment.status} state.` });
    return;
  }

  const requestedDate = sanitizeString(req.body?.date, 20);
  const requestedTime = sanitizeString(req.body?.time, 10);
  const reason = sanitizeString(req.body?.reason, 250) || 'Customer requested a new time slot.';
  if (!requestedDate || !requestedTime) {
    res.status(400).json({ error: 'New date and time slot are required.' });
    return;
  }

  const config = state.availability.find((a) => a.businessId === appointment.businessId);
  if (!config) {
    res.status(400).json({ error: 'Business schedule unavailable.' });
    return;
  }
  const staffMember = appointment.staffId
    ? state.staff.find((s) => s.id === appointment.staffId && s.active) || null
    : null;

  const check = computeAvailableTimeSlots({
    date: requestedDate,
    config,
    appointments: state.appointments,
    staff: staffMember,
    requestedDurationMinutes: appointment.durationMinutes,
    ignoreAppointmentId: appointment.id,
  });
  const slot = check.slots.find((s) => s.time === requestedTime);
  if (!slot || !slot.available) {
    res.status(409).json({ error: 'The requested reschedule time slot is unavailable.' });
    return;
  }

  const prevStatus = appointment.status;
  appointment.status = 'Reschedule Requested';
  appointment.requestedDate = requestedDate;
  appointment.requestedTime = requestedTime;
  appointment.rescheduleReason = reason;
  appointment.updatedAt = new Date().toISOString();

  recordHistory({
    appointmentId: appointment.id,
    previousStatus: prevStatus,
    newStatus: 'Reschedule Requested',
    actorName: user.name,
    actorRole: user.role,
    note: `Requested move to ${requestedDate} at ${slot.label}. Reason: ${reason}`,
  });

  createNotification({
    recipientBusinessId: appointment.businessId,
    recipientRole: 'business_admin',
    appointmentId: appointment.id,
    event: 'Appointment Rescheduled',
    title: 'Reschedule requested',
    message: `${appointment.customerName} requested to move ${appointment.id} to ${requestedDate} at ${slot.label}.`,
  });

  db.persist();
  res.json({ appointment });
});

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------

app.get('/api/notifications', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const items = db.getState().notifications.filter((n) => {
    if (user.role === 'customer') return n.recipientUserId === user.id;
    if (user.role === 'business_admin') {
      return n.recipientBusinessId === user.businessId || n.recipientUserId === user.id;
    }
    if (user.role === 'staff') {
      return n.recipientUserId === user.id || n.recipientBusinessId === user.businessId;
    }
    return true; // super_admin sees platform notifications
  });
  res.json({ notifications: items });
});

app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();
  const item = state.notifications.find((n) => n.id === req.params.id);
  if (!item) {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }
  const canRead =
    user.role === 'super_admin' ||
    item.recipientUserId === user.id ||
    (user.businessId && item.recipientBusinessId === user.businessId);
  if (!canRead) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  item.read = true;
  db.persist();
  res.json({ notification: item });
});

app.post('/api/notifications/mark-all-read', requireAuth, (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();
  for (const item of state.notifications) {
    const canRead =
      user.role === 'super_admin' ||
      item.recipientUserId === user.id ||
      (user.businessId && item.recipientBusinessId === user.businessId);
    if (canRead) item.read = true;
  }
  db.persist();
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// BUSINESS ADMIN ROUTES (STRICT BUSINESS ISOLATION)
// ---------------------------------------------------------------------------

function resolveScopedBusinessId(user: PublicUser, queryBusinessId?: string): string | null {
  if (user.role === 'business_admin') {
    return user.businessId || null;
  }
  if (user.role === 'super_admin') {
    return queryBusinessId || db.getState().businesses[0]?.id || null;
  }
  return null;
}

app.get('/api/admin/dashboard', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();

  if (user.role === 'super_admin' && req.query.scope === 'platform') {
    const totalBusinesses = state.businesses.length;
    const totalCustomers = state.users.filter((u) => u.role === 'customer').length;
    const totalAppointments = state.appointments.length;
    const pendingAppointments = state.appointments.filter(
      (a) => a.status === 'Pending' || a.status === 'Reschedule Requested'
    ).length;
    const approvedAppointments = state.appointments.filter(
      (a) => a.status === 'Approved' || a.status === 'Rescheduled'
    ).length;
    const cancelledAppointments = state.appointments.filter(
      (a) => a.status === 'Cancelled' || a.status === 'Rejected'
    ).length;

    const categoryBreakdown = state.categories.map((c) => ({
      categoryId: c.id,
      name: c.name,
      businesses: state.businesses.filter((b) => b.categoryId === c.id).length,
      appointments: state.appointments.filter((a) => a.categoryId === c.id).length,
    }));

    const cityBreakdown = state.cities.map((c) => ({
      cityId: c.id,
      name: `${c.name}, ${c.state}`,
      businesses: state.businesses.filter((b) => b.cityId === c.id).length,
      appointments: state.appointments.filter((a) => {
        const biz = state.businesses.find((b) => b.id === a.businessId);
        return biz?.cityId === c.id;
      }).length,
    }));

    res.json({
      scope: 'platform',
      metrics: {
        totalBusinesses,
        totalCustomers,
        totalAppointments,
        pendingAppointments,
        approvedAppointments,
        cancelledAppointments,
      },
      categoryBreakdown,
      cityBreakdown,
    });
    return;
  }

  const businessId = resolveScopedBusinessId(user, sanitizeString(req.query.businessId as string, 60));
  if (!businessId) {
    res.status(403).json({ error: 'No business assigned to this admin account.' });
    return;
  }

  const business = state.businesses.find((b) => b.id === businessId);
  if (!business) {
    res.status(404).json({ error: 'Business not found.' });
    return;
  }

  const scopedAppointments = state.appointments.filter((a) => a.businessId === businessId);
  const uniqueCustomers = new Set(scopedAppointments.map((a) => a.customerId)).size;
  const totalRevenue = scopedAppointments
    .filter((a) => ['Approved', 'Rescheduled', 'Completed'].includes(a.status))
    .reduce((sum, a) => sum + a.totalPrice, 0);

  res.json({
    scope: 'business',
    business,
    metrics: {
      totalBusinesses: 1,
      totalCustomers: uniqueCustomers,
      totalAppointments: scopedAppointments.length,
      pendingAppointments: scopedAppointments.filter(
        (a) => a.status === 'Pending' || a.status === 'Reschedule Requested'
      ).length,
      approvedAppointments: scopedAppointments.filter(
        (a) => a.status === 'Approved' || a.status === 'Rescheduled'
      ).length,
      cancelledAppointments: scopedAppointments.filter(
        (a) => a.status === 'Cancelled' || a.status === 'Rejected'
      ).length,
      completedAppointments: scopedAppointments.filter((a) => a.status === 'Completed').length,
      estimatedRevenue: totalRevenue,
    },
    departments: state.departments.filter((d) => d.businessId === businessId),
    services: state.services.filter((s) => s.businessId === businessId),
    staff: state.staff.filter((s) => s.businessId === businessId),
    availability: state.availability.find((a) => a.businessId === businessId) || null,
  });
});

app.get('/api/admin/appointments', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();

  const statusFilter = sanitizeString(req.query.status as string, 40);
  let appointments = state.appointments;

  if (user.role === 'business_admin') {
    appointments = appointments.filter((a) => a.businessId === user.businessId);
  } else if (req.query.businessId) {
    const bizId = sanitizeString(req.query.businessId as string, 60);
    appointments = appointments.filter((a) => a.businessId === bizId);
  }

  if (statusFilter && statusFilter !== 'All') {
    appointments = appointments.filter((a) => a.status === statusFilter);
  }

  const ids = new Set(appointments.map((a) => a.id));
  const history = state.appointmentHistory.filter((h) => ids.has(h.appointmentId));
  res.json({ appointments, history });
});

app.patch(
  '/api/admin/appointments/:id/status',
  requireAuth,
  requireRoles('business_admin', 'super_admin'),
  (req, res) => {
    const authReq = req as express.Request & { authUser?: PublicUser };
    const user = authReq.authUser!;
    const state = db.getState();
    const appointment = state.appointments.find((a) => a.id === req.params.id);

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    if (user.role === 'business_admin' && appointment.businessId !== user.businessId) {
      res.status(403).json({ error: 'Business isolation policy: cannot modify another business record.' });
      return;
    }

    const nextStatus = sanitizeString(req.body?.status, 40) as BookingStatus;
    const reason = sanitizeString(req.body?.reason, 300);
    const assignStaffId = sanitizeString(req.body?.staffId, 60);

    const allowedStatuses: BookingStatus[] = [
      'Approved',
      'Rejected',
      'Cancelled',
      'Completed',
      'No Show',
    ];
    if (!allowedStatuses.includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid status transition.' });
      return;
    }
    if (nextStatus === 'Rejected' && !reason) {
      res.status(400).json({ error: 'A rejection reason is required.' });
      return;
    }

    if (assignStaffId) {
      const staffMember = state.staff.find(
        (s) => s.id === assignStaffId && s.businessId === appointment.businessId && s.active
      );
      if (!staffMember) {
        res.status(400).json({ error: 'Assigned staff member does not belong to this business.' });
        return;
      }
      appointment.staffId = staffMember.id;
      appointment.staffName = staffMember.name;
    }

    const prevStatus = appointment.status;
    appointment.status = nextStatus;
    if (nextStatus === 'Rejected') appointment.rejectionReason = reason;
    appointment.updatedAt = new Date().toISOString();

    recordHistory({
      appointmentId: appointment.id,
      previousStatus: prevStatus,
      newStatus: nextStatus,
      actorName: user.name,
      actorRole: user.role,
      note: reason || `Status updated to ${nextStatus}.`,
    });

    const eventMap: Record<string, NotificationEvent> = {
      Approved: 'Booking Approved',
      Rejected: 'Booking Rejected',
      Cancelled: 'Booking Cancelled',
      Completed: 'Appointment Completed',
      'No Show': 'Booking Cancelled',
    };

    createNotification({
      recipientUserId: appointment.customerId,
      recipientRole: 'customer',
      appointmentId: appointment.id,
      event: eventMap[nextStatus] || 'Booking Approved',
      title: `Booking ${nextStatus}`,
      message:
        nextStatus === 'Rejected'
          ? `${appointment.businessName} declined ${appointment.id}: ${reason}`
          : `${appointment.businessName} marked booking ${appointment.id} (${appointment.date} ${appointment.time}) as ${nextStatus}.`,
    });

    db.persist();
    res.json({ appointment });
  }
);

app.patch(
  '/api/admin/appointments/:id/reschedule',
  requireAuth,
  requireRoles('business_admin', 'super_admin'),
  (req, res) => {
    const authReq = req as express.Request & { authUser?: PublicUser };
    const user = authReq.authUser!;
    const state = db.getState();
    const appointment = state.appointments.find((a) => a.id === req.params.id);

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    if (user.role === 'business_admin' && appointment.businessId !== user.businessId) {
      res.status(403).json({ error: 'Business isolation policy: cannot modify another business record.' });
      return;
    }

    const newDate = sanitizeString(req.body?.date, 20) || appointment.requestedDate || appointment.date;
    const newTime = sanitizeString(req.body?.time, 10) || appointment.requestedTime || appointment.time;
    const note = sanitizeString(req.body?.note, 300) || 'Rescheduled by business administrator.';

    const config = state.availability.find((a) => a.businessId === appointment.businessId);
    if (!config) {
      res.status(400).json({ error: 'Business availability schedule not configured.' });
      return;
    }
    const staffMember = appointment.staffId
      ? state.staff.find((s) => s.id === appointment.staffId && s.active) || null
      : null;

    const check = computeAvailableTimeSlots({
      date: newDate,
      config,
      appointments: state.appointments,
      staff: staffMember,
      requestedDurationMinutes: appointment.durationMinutes,
      ignoreAppointmentId: appointment.id,
    });
    const slot = check.slots.find((s) => s.time === newTime);
    if (!slot || !slot.available) {
      res.status(409).json({ error: 'Chosen reschedule slot is unavailable or conflicts with another booking.' });
      return;
    }

    const prevStatus = appointment.status;
    appointment.date = newDate;
    appointment.time = newTime;
    appointment.requestedDate = undefined;
    appointment.requestedTime = undefined;
    appointment.status = 'Rescheduled';
    appointment.updatedAt = new Date().toISOString();

    recordHistory({
      appointmentId: appointment.id,
      previousStatus: prevStatus,
      newStatus: 'Rescheduled',
      actorName: user.name,
      actorRole: user.role,
      note: `Rescheduled to ${newDate} at ${slot.label}. ${note}`,
    });

    createNotification({
      recipientUserId: appointment.customerId,
      recipientRole: 'customer',
      appointmentId: appointment.id,
      event: 'Appointment Rescheduled',
      title: 'Appointment rescheduled',
      message: `${appointment.businessName} rescheduled ${appointment.id} to ${newDate} at ${slot.label}.`,
    });

    db.persist();
    res.json({ appointment });
  }
);

// Business Profile, Departments, Services, Staff, Availability Management (Business Admin)
app.patch('/api/admin/business', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const businessId = resolveScopedBusinessId(user, sanitizeString(req.body?.businessId, 60));
  const business = db.getState().businesses.find((b) => b.id === businessId);
  if (!business) {
    res.status(404).json({ error: 'Business not found.' });
    return;
  }

  const name = sanitizeString(req.body?.name, 100);
  const description = sanitizeString(req.body?.description, 500);
  const address = sanitizeString(req.body?.address, 200);
  const contactNumber = sanitizeString(req.body?.contactNumber, 40);
  const email = sanitizeString(req.body?.email, 120);
  const workingHoursSummary = sanitizeString(req.body?.workingHoursSummary, 100);

  if (name) business.name = name;
  if (description) business.description = description;
  if (address) business.address = address;
  if (contactNumber) business.contactNumber = contactNumber;
  if (email) business.email = email;
  if (workingHoursSummary) business.workingHoursSummary = workingHoursSummary;

  db.persist();
  res.json({ business });
});

app.post('/api/admin/departments', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const businessId = resolveScopedBusinessId(user, sanitizeString(req.body?.businessId, 60));
  if (!businessId) {
    res.status(403).json({ error: 'Missing business scope.' });
    return;
  }
  const name = sanitizeString(req.body?.name, 80);
  const description = sanitizeString(req.body?.description, 250);
  if (!name) {
    res.status(400).json({ error: 'Department name is required.' });
    return;
  }
  const dept = {
    id: `dep-${crypto.randomUUID().slice(0, 8)}`,
    businessId,
    name,
    description: description || `${name} clinical department.`,
    active: true,
  };
  db.getState().departments.push(dept);
  db.persist();
  res.status(201).json({ department: dept });
});

app.patch('/api/admin/departments/:id', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const dept = db.getState().departments.find((d) => d.id === req.params.id);
  if (!dept) {
    res.status(404).json({ error: 'Department not found.' });
    return;
  }
  if (user.role === 'business_admin' && dept.businessId !== user.businessId) {
    res.status(403).json({ error: 'Business isolation policy violation.' });
    return;
  }
  if (typeof req.body?.active === 'boolean') dept.active = req.body.active;
  const name = sanitizeString(req.body?.name, 80);
  const description = sanitizeString(req.body?.description, 250);
  if (name) dept.name = name;
  if (description) dept.description = description;
  db.persist();
  res.json({ department: dept });
});

app.post('/api/admin/services', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const businessId = resolveScopedBusinessId(user, sanitizeString(req.body?.businessId, 60));
  const business = db.getState().businesses.find((b) => b.id === businessId);
  if (!business) {
    res.status(404).json({ error: 'Business not found.' });
    return;
  }

  const name = sanitizeString(req.body?.name, 100);
  const description = sanitizeString(req.body?.description, 300);
  const price = Math.max(0, Number(req.body?.price) || 0);
  const durationMinutes = Math.max(15, Math.min(240, Number(req.body?.durationMinutes) || 30));
  const requiresStaff = Boolean(req.body?.requiresStaff);

  if (!name) {
    res.status(400).json({ error: 'Service name is required.' });
    return;
  }

  const srv = {
    id: `srv-${crypto.randomUUID().slice(0, 8)}`,
    businessId: business.id,
    categoryId: business.categoryId,
    name,
    description: description || `${name} appointment service.`,
    price,
    durationMinutes,
    requiresStaff,
    active: true,
  };
  db.getState().services.push(srv);
  db.persist();
  res.status(201).json({ service: srv });
});

app.patch('/api/admin/services/:id', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const srv = db.getState().services.find((s) => s.id === req.params.id);
  if (!srv) {
    res.status(404).json({ error: 'Service not found.' });
    return;
  }
  if (user.role === 'business_admin' && srv.businessId !== user.businessId) {
    res.status(403).json({ error: 'Business isolation policy violation.' });
    return;
  }
  if (typeof req.body?.active === 'boolean') srv.active = req.body.active;
  if (req.body?.price !== undefined) srv.price = Math.max(0, Number(req.body.price) || 0);
  if (req.body?.durationMinutes !== undefined) {
    srv.durationMinutes = Math.max(15, Math.min(240, Number(req.body.durationMinutes) || 30));
  }
  const name = sanitizeString(req.body?.name, 100);
  if (name) srv.name = name;
  db.persist();
  res.json({ service: srv });
});

app.post('/api/admin/staff', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const businessId = resolveScopedBusinessId(user, sanitizeString(req.body?.businessId, 60));
  const business = db.getState().businesses.find((b) => b.id === businessId);
  if (!business) {
    res.status(404).json({ error: 'Business not found.' });
    return;
  }

  const name = sanitizeString(req.body?.name, 80);
  const roleTitle = sanitizeString(req.body?.roleTitle, 80);
  const qualification = sanitizeString(req.body?.qualification, 100);
  const specialization = sanitizeString(req.body?.specialization, 120);
  const departmentId = sanitizeString(req.body?.departmentId, 60) || undefined;
  const experienceYears = Math.max(0, Number(req.body?.experienceYears) || 1);
  const consultationFee = req.body?.consultationFee ? Math.max(0, Number(req.body.consultationFee)) : undefined;
  const workingStart = sanitizeString(req.body?.workingStart, 10) || '09:00';
  const workingEnd = sanitizeString(req.body?.workingEnd, 10) || '17:00';
  const availableDays = Array.isArray(req.body?.availableDays)
    ? req.body.availableDays.filter((d: unknown): d is string => typeof d === 'string')
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  if (!name || !roleTitle) {
    res.status(400).json({ error: 'Staff name and role title are required.' });
    return;
  }

  const imageMap: Record<string, string> = {
    hospital: '/src/assets/images/doctor_portrait_1795499553974.jpg',
    gym: '/src/assets/images/gym_studio_1795499554638.jpg',
    salon: '/src/assets/images/salon_interior_1795499554536.jpg',
    car_service: '/src/assets/images/car_service_bay_1795499554401.jpg',
    other: '/src/assets/images/doctor_portrait_1795499553974.jpg',
  };

  const member = {
    id: `stf-${crypto.randomUUID().slice(0, 8)}`,
    businessId: business.id,
    departmentId,
    name,
    imageUrl: imageMap[business.categorySlug] || '/src/assets/images/doctor_portrait_1795499553974.jpg',
    roleTitle,
    qualification: qualification || roleTitle,
    specialization: specialization || 'General Specialist',
    experienceYears,
    consultationFee,
    assignedServiceIds: db
      .getState()
      .services.filter((s) => s.businessId === business.id && s.active)
      .map((s) => s.id),
    workingStart,
    workingEnd,
    availableDays,
    active: true,
  };

  db.getState().staff.push(member);
  db.persist();
  res.status(201).json({ staffMember: member });
});

app.patch('/api/admin/staff/:id', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const member = db.getState().staff.find((s) => s.id === req.params.id);
  if (!member) {
    res.status(404).json({ error: 'Staff member not found.' });
    return;
  }
  if (user.role === 'business_admin' && member.businessId !== user.businessId) {
    res.status(403).json({ error: 'Business isolation policy violation.' });
    return;
  }
  if (typeof req.body?.active === 'boolean') member.active = req.body.active;
  if (Array.isArray(req.body?.availableDays)) {
    member.availableDays = req.body.availableDays.filter((d: unknown): d is string => typeof d === 'string');
  }
  if (typeof req.body?.workingStart === 'string') member.workingStart = sanitizeString(req.body.workingStart, 10);
  if (typeof req.body?.workingEnd === 'string') member.workingEnd = sanitizeString(req.body.workingEnd, 10);
  db.persist();
  res.json({ staffMember: member });
});

app.patch('/api/admin/availability', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const businessId = resolveScopedBusinessId(user, sanitizeString(req.body?.businessId, 60));
  const state = db.getState();
  const config = state.availability.find((a) => a.businessId === businessId);
  if (!config) {
    res.status(404).json({ error: 'Availability record not found.' });
    return;
  }

  if (Array.isArray(req.body?.workingDays)) {
    config.workingDays = req.body.workingDays.filter((d: unknown): d is string => typeof d === 'string');
  }
  if (typeof req.body?.openTime === 'string') config.openTime = sanitizeString(req.body.openTime, 10);
  if (typeof req.body?.closeTime === 'string') config.closeTime = sanitizeString(req.body.closeTime, 10);
  if (typeof req.body?.breakStart === 'string') config.breakStart = sanitizeString(req.body.breakStart, 10) || undefined;
  if (typeof req.body?.breakEnd === 'string') config.breakEnd = sanitizeString(req.body.breakEnd, 10) || undefined;
  if (req.body?.slotDurationMinutes !== undefined) {
    config.slotDurationMinutes = Math.max(15, Math.min(120, Number(req.body.slotDurationMinutes) || 30));
  }
  if (req.body?.maxBookingsPerSlot !== undefined) {
    config.maxBookingsPerSlot = Math.max(1, Math.min(20, Number(req.body.maxBookingsPerSlot) || 1));
  }
  if (Array.isArray(req.body?.holidays)) {
    config.holidays = req.body.holidays.filter((h: unknown): h is string => typeof h === 'string');
  }

  db.persist();
  res.json({ availability: config });
});

app.get('/api/admin/customers', requireAuth, requireRoles('business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();

  const businessId =
    user.role === 'business_admin'
      ? user.businessId
      : sanitizeString(req.query.businessId as string, 60) || undefined;

  const relevantAppointments = businessId
    ? state.appointments.filter((a) => a.businessId === businessId)
    : state.appointments;

  const customerMap = new Map<
    string,
    { id: string; name: string; mobile: string; totalBookings: number; lastDate: string }
  >();

  for (const apt of relevantAppointments) {
    const existing = customerMap.get(apt.customerId);
    if (!existing) {
      customerMap.set(apt.customerId, {
        id: apt.customerId,
        name: apt.customerName,
        mobile: apt.customerMobile,
        totalBookings: 1,
        lastDate: apt.date,
      });
    } else {
      existing.totalBookings += 1;
      if (apt.date > existing.lastDate) existing.lastDate = apt.date;
    }
  }

  res.json({ customers: Array.from(customerMap.values()) });
});

// ---------------------------------------------------------------------------
// STAFF / PROFESSIONAL SCHEDULE ROUTES
// ---------------------------------------------------------------------------

app.get('/api/staff/appointments', requireAuth, requireRoles('staff', 'business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();

  const staffId = user.staffId || sanitizeString(req.query.staffId as string, 60);
  if (!staffId) {
    res.status(400).json({ error: 'Staff profile ID is required.' });
    return;
  }

  const staffProfile = state.staff.find((s) => s.id === staffId);
  if (!staffProfile) {
    res.status(404).json({ error: 'Staff profile not found.' });
    return;
  }
  if (user.role === 'business_admin' && staffProfile.businessId !== user.businessId) {
    res.status(403).json({ error: 'Business isolation policy violation.' });
    return;
  }

  const appointments = state.appointments.filter((a) => a.staffId === staffId);
  res.json({ staffProfile, appointments });
});

app.patch('/api/staff/appointments/:id/progress', requireAuth, requireRoles('staff', 'business_admin', 'super_admin'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const state = db.getState();
  const appointment = state.appointments.find((a) => a.id === req.params.id);

  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }
  if (user.role === 'staff' && appointment.staffId !== user.staffId) {
    res.status(403).json({ error: 'You can only update appointments assigned to you.' });
    return;
  }

  const nextStatus = sanitizeString(req.body?.status, 30) as BookingStatus;
  if (!['Completed', 'No Show'].includes(nextStatus)) {
    res.status(400).json({ error: 'Staff can mark appointments Completed or No Show.' });
    return;
  }

  const prevStatus = appointment.status;
  appointment.status = nextStatus;
  appointment.updatedAt = new Date().toISOString();

  recordHistory({
    appointmentId: appointment.id,
    previousStatus: prevStatus,
    newStatus: nextStatus,
    actorName: user.name,
    actorRole: user.role,
    note: sanitizeString(req.body?.note, 250) || `Marked ${nextStatus} by professional.`,
  });

  createNotification({
    recipientUserId: appointment.customerId,
    recipientRole: 'customer',
    appointmentId: appointment.id,
    event: nextStatus === 'Completed' ? 'Appointment Completed' : 'Booking Cancelled',
    title: `Appointment ${nextStatus}`,
    message: `Your visit ${appointment.id} with ${appointment.staffName || appointment.businessName} was marked ${nextStatus}.`,
  });

  db.persist();
  res.json({ appointment });
});

app.patch('/api/staff/availability', requireAuth, requireRoles('staff'), (req, res) => {
  const authReq = req as express.Request & { authUser?: PublicUser };
  const user = authReq.authUser!;
  const member = db.getState().staff.find((s) => s.id === user.staffId);
  if (!member) {
    res.status(404).json({ error: 'Staff record not found.' });
    return;
  }
  if (Array.isArray(req.body?.availableDays)) {
    member.availableDays = req.body.availableDays.filter((d: unknown): d is string => typeof d === 'string');
  }
  if (typeof req.body?.workingStart === 'string') member.workingStart = sanitizeString(req.body.workingStart, 10);
  if (typeof req.body?.workingEnd === 'string') member.workingEnd = sanitizeString(req.body.workingEnd, 10);
  db.persist();
  res.json({ staffProfile: member });
});

// ---------------------------------------------------------------------------
// PLATFORM SUPER ADMIN ROUTES
// ---------------------------------------------------------------------------

app.get('/api/super/businesses', requireAuth, requireRoles('super_admin'), (_req, res) => {
  res.json({ businesses: db.getState().businesses });
});

app.patch('/api/super/businesses/:id/status', requireAuth, requireRoles('super_admin'), (req, res) => {
  const biz = db.getState().businesses.find((b) => b.id === req.params.id);
  if (!biz) {
    res.status(404).json({ error: 'Business not found.' });
    return;
  }
  const status = sanitizeString(req.body?.status, 30);
  if (status !== 'Approved' && status !== 'Pending Approval' && status !== 'Suspended') {
    res.status(400).json({ error: 'Invalid business status.' });
    return;
  }
  biz.status = status;
  db.persist();
  res.json({ business: biz });
});

app.post('/api/super/businesses', requireAuth, requireRoles('super_admin'), (req, res) => {
  const state = db.getState();
  const name = sanitizeString(req.body?.name, 100);
  const categoryId = sanitizeString(req.body?.categoryId, 40);
  const cityId = sanitizeString(req.body?.cityId, 40);
  const address = sanitizeString(req.body?.address, 200);
  const contactNumber = sanitizeString(req.body?.contactNumber, 40);
  const email = sanitizeString(req.body?.email, 120);
  const description = sanitizeString(req.body?.description, 400);

  const category = state.categories.find((c) => c.id === categoryId);
  const city = state.cities.find((c) => c.id === cityId);
  if (!name || !category || !city || !address) {
    res.status(400).json({ error: 'Business name, category, city, and address are required.' });
    return;
  }

  const imageMap: Record<string, string> = {
    hospital: '/src/assets/images/hospital_facility_1795499554297.jpg',
    gym: '/src/assets/images/gym_studio_1795499554638.jpg',
    car_service: '/src/assets/images/car_service_bay_1795499554401.jpg',
    salon: '/src/assets/images/salon_interior_1795499554536.jpg',
    other: '/src/assets/images/hospital_facility_1795499554297.jpg',
  };

  const bizId = `biz-${crypto.randomUUID().slice(0, 8)}`;
  const newBiz = {
    id: bizId,
    name,
    categoryId: category.id,
    categorySlug: category.slug,
    cityId: city.id,
    cityName: city.name,
    description: description || `${name} in ${city.name}.`,
    address,
    mapCoordinates: { lat: 37.7749, lng: -122.4194 },
    contactNumber: contactNumber || '+1 (415) 555-0199',
    email: email || `contact@${bizId}.demo`,
    imageUrl: imageMap[category.slug] || '/src/assets/images/hospital_facility_1795499554297.jpg',
    workingHoursSummary: 'Mon - Sat · 09:00 AM - 06:00 PM',
    specialties: [category.name],
    facilities: ['Online Booking', 'Reception Desk'],
    status: 'Approved' as const,
    popular: false,
    createdAt: new Date().toISOString(),
  };

  state.businesses.push(newBiz);
  state.availability.push({
    businessId: bizId,
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    openTime: '09:00',
    closeTime: '18:00',
    slotDurationMinutes: 30,
    maxBookingsPerSlot: 2,
    holidays: [],
  });
  state.services.push({
    id: `srv-${crypto.randomUUID().slice(0, 8)}`,
    businessId: bizId,
    categoryId: category.id,
    name: `Standard ${category.name} Consultation`,
    description: `Initial ${category.name.toLowerCase()} appointment.`,
    price: 75,
    durationMinutes: 30,
    requiresStaff: false,
    active: true,
  });

  db.persist();
  res.status(201).json({ business: newBiz });
});

app.get('/api/super/categories', requireAuth, requireRoles('super_admin'), (_req, res) => {
  res.json({ categories: db.getState().categories });
});

app.post('/api/super/categories', requireAuth, requireRoles('super_admin'), (req, res) => {
  const name = sanitizeString(req.body?.name, 60);
  const description = sanitizeString(req.body?.description, 200);
  if (!name) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const cat = {
    id: `cat-${crypto.randomUUID().slice(0, 6)}`,
    slug: 'other' as const,
    name,
    description: description || `${name} appointment services.`,
    active: true,
    sortOrder: db.getState().categories.length + 1,
  };
  db.getState().categories.push(cat);
  db.persist();
  res.status(201).json({ category: cat });
});

app.patch('/api/super/categories/:id', requireAuth, requireRoles('super_admin'), (req, res) => {
  const cat = db.getState().categories.find((c) => c.id === req.params.id);
  if (!cat) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }
  if (typeof req.body?.active === 'boolean') cat.active = req.body.active;
  db.persist();
  res.json({ category: cat });
});

app.get('/api/super/cities', requireAuth, requireRoles('super_admin'), (_req, res) => {
  res.json({ cities: db.getState().cities });
});

app.post('/api/super/cities', requireAuth, requireRoles('super_admin'), (req, res) => {
  const name = sanitizeString(req.body?.name, 60);
  const stateCode = sanitizeString(req.body?.state, 20).toUpperCase();
  const popular = Boolean(req.body?.popular);
  if (!name || !stateCode) {
    res.status(400).json({ error: 'City name and state are required.' });
    return;
  }
  const city = {
    id: `city-${crypto.randomUUID().slice(0, 6)}`,
    name,
    state: stateCode,
    popular,
    active: true,
  };
  db.getState().cities.push(city);
  db.persist();
  res.status(201).json({ city });
});

app.patch('/api/super/cities/:id', requireAuth, requireRoles('super_admin'), (req, res) => {
  const city = db.getState().cities.find((c) => c.id === req.params.id);
  if (!city) {
    res.status(404).json({ error: 'City not found.' });
    return;
  }
  if (typeof req.body?.active === 'boolean') city.active = req.body.active;
  if (typeof req.body?.popular === 'boolean') city.popular = req.body.popular;
  db.persist();
  res.json({ city });
});

// ---------------------------------------------------------------------------
// VITE / STATIC SERVING
// ---------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BookFlow server running on http://localhost:${PORT}`);
  });
}

startServer();
