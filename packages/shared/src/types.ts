import type { Diet, Meal, MealPlan } from './pricing';
import type { ISODate } from './time';

export const ROLES = ['tenant', 'owner', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const SHARING_TYPES = ['private', '2-sharing', '3-sharing', '4-sharing'] as const;
export type SharingType = (typeof SHARING_TYPES)[number];

export const GENDER_TYPES = ['boys', 'girls', 'coliving'] as const;
export type GenderType = (typeof GENDER_TYPES)[number];

export const HOSTEL_STATUSES = ['draft', 'pending', 'live', 'rejected'] as const;
export type HostelStatus = (typeof HOSTEL_STATUSES)[number];

export const PARTNER_STATUSES = ['none', 'applied', 'verified', 'rejected'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export const VISIT_STATUSES = ['new', 'contacted', 'closed'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'cancelled', 'ended', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['due', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const MOVE_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export const PAYOUT_STATUSES = ['pending', 'paid'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const AREAS = [
  'Gachibowli',
  'Madhapur',
  'Kondapur',
  'HiTech City',
  'Financial District',
  'Ameerpet',
] as const;

export type User = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  role: Role;
  createdAt: string;
};

export type RoomType = {
  id: string;
  hostelId: string;
  sharing: SharingType;
  monthlyRent: number;
  advanceAmount: number;
  totalBeds: number;
  bedsAvailable: number;
};

export type HostelPhoto = { id: string; hostelId: string; url: string; sortOrder: number };

export type HostelSummary = {
  id: string;
  slug: string;
  name: string;
  city: string;
  area: string;
  lat: number;
  lng: number;
  genderType: GenderType;
  foodAvailable: boolean;
  isVerified: boolean;
  coverPhotoUrl: string | null;
  minRent: number | null;
  bedsAvailable: number;
  sharingTypes: SharingType[];
  /** Kilometres from the search point, when searching near a location. */
  distanceKm?: number;
};

export type Hostel = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  genderType: GenderType;
  amenities: string[];
  rules: string[];
  contactPhone: string;
  whatsappPhone: string | null;
  foodAvailable: boolean;
  status: HostelStatus;
  partnerStatus: PartnerStatus;
  platformFeePct: number;
  rejectionReason: string | null;
  createdAt: string;
};

export type HostelDetail = Hostel & {
  isVerified: boolean;
  photos: HostelPhoto[];
  roomTypes: RoomType[];
};

export type VisitRequest = {
  id: string;
  hostelId: string;
  userId: string;
  preferredDate: ISODate;
  message: string;
  status: VisitStatus;
  createdAt: string;
};

export type FoodPartner = {
  id: string;
  name: string;
  cuisine: string;
  logoUrl: string | null;
  active: boolean;
};

export type MenuItem = {
  id: string;
  menuWeekId: string;
  date: ISODate;
  meal: Meal;
  vegDish: string;
  nonVegDish: string | null;
  foodPartnerId: string | null;
};

export type MenuWeek = {
  id: string;
  hostelId: string;
  weekStart: ISODate;
  theme: string;
  items: MenuItem[];
};

export type Subscription = {
  id: string;
  userId: string;
  hostelId: string;
  roomTypeId: string;
  mealPlan: MealPlan;
  diet: Diet;
  status: SubscriptionStatus;
  startDate: ISODate;
  cancelAt: ISODate | null;
  createdAt: string;
};

export type Invoice = {
  id: string;
  subscriptionId: string;
  userId: string;
  hostelId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  rentAmount: number;
  foodAmount: number;
  creditAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate: ISODate;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  /** Derived on read. */
  isOverdue: boolean;
};

export type MealSkip = {
  id: string;
  subscriptionId: string;
  date: ISODate;
  meal: Meal;
  creditAmount: number;
  createdAt: string;
};

export type MoveRequest = {
  id: string;
  subscriptionId: string;
  fromHostelId: string;
  fromRoomTypeId: string;
  toHostelId: string;
  toRoomTypeId: string;
  moveDate: ISODate;
  status: MoveStatus;
  createdAt: string;
};

export type Payout = {
  id: string;
  ownerId: string;
  hostelId: string;
  periodMonth: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  status: PayoutStatus;
  paidAt: string | null;
};

export type AuthSession = { user: User; token: string; expiresAt: string };

export type OtpSent = { ok: true; expiresInSeconds: number; devOtp?: string };

export type Health = {
  ok: true;
  service: 'hostels-api';
  version: string;
  db: 'up' | 'down';
  razorpay: 'live' | 'stub';
  msg91: 'live' | 'stub';
  devMode: boolean;
};

export const ERROR_CODES = [
  'validation',
  'unauthorized',
  'forbidden',
  'not_found',
  'internal',
  'no_beds_available',
  'already_subscribed',
  'not_verified',
  'cutoff_passed',
  'meal_not_in_plan',
  'otp_invalid',
  'otp_rate_limited',
  'invoice_already_paid',
  'signature_invalid',
  'move_not_allowed',
  'invalid_state',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: ErrorCode;
  message: string;
  issues?: { path: string; message: string }[];
};
