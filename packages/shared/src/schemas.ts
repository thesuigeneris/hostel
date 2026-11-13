import { z } from 'zod';
import { passwordProblem, PASSWORD_MAX_LENGTH } from './passwords';
import { DIETS, MEAL_PLANS, MEALS } from './pricing';
import { isValidDate } from './time';
import {
  GENDER_TYPES,
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  OWNER_PLAN_TIERS,
  POST_KINDS,
  RENT_METHODS,
  SHARING_TYPES,
  VISIT_STATUSES,
} from './types';

/** Indian mobile number: 10 digits starting 6–9. Accepts an optional +91 / 91 / 0 prefix and spaces. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'));

export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'OTP is 6 digits');

export const requestOtpSchema = z.object({ phone: phoneSchema });

/** Length only; the full policy (blocklist, phone) runs in `registerSchema` / `changePasswordSchema`. */
const rawPassword = z.string().max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

export const registerSchema = z
  .object({
    phone: phoneSchema,
    password: rawPassword,
    name: z.string().trim().min(1, 'Tell us your name').max(80),
    role: z.enum(['tenant', 'owner']).optional(),
  })
  .superRefine((v, ctx) => {
    const problem = passwordProblem(v.password, v.phone);
    if (problem) ctx.addIssue({ code: 'custom', path: ['password'], message: problem });
  });
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({ phone: phoneSchema, password: rawPassword.min(1, 'Enter your password') });
export type LoginInput = z.input<typeof loginSchema>;

export const demoLoginSchema = z.object({ phone: phoneSchema });
export type DemoLoginInput = z.input<typeof demoLoginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: rawPassword.optional(),
  newPassword: rawPassword,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type RequestOtpInput = z.input<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  /** Only used when the phone signs up for the first time. Admin is never self-assigned. */
  role: z.enum(['tenant', 'owner']).optional(),
  name: z.string().trim().max(80).optional(),
});
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().email().max(200).nullable(),
  })
  .partial();
export type UpdateMeInput = z.input<typeof updateMeSchema>;

export const handoffRedeemSchema = z.object({ code: z.string().trim().min(16).max(128) });

// ---------------------------------------------------------------------------
// Listings

const isoDate = z.string().refine(isValidDate, 'Use a YYYY-MM-DD date');
const rupees = z.coerce.number().int().min(0).max(1_000_000);
const shortText = (max: number) => z.string().trim().max(max);
const stringList = z.array(z.string().trim().min(1).max(80)).max(30);
/** Photo links must be plain web URLs; `javascript:` and `data:` links are refused. */
const webUrl = z.string().trim().max(500).url().refine((v) => /^https?:\/\//i.test(v), 'Use an http or https link');

export const hostelInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: shortText(2000).default(''),
  city: shortText(60).default('Hyderabad'),
  area: z.string().trim().min(2).max(60),
  address: shortText(300).default(''),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  genderType: z.enum(GENDER_TYPES),
  amenities: stringList.default([]),
  rules: stringList.default([]),
  contactPhone: phoneSchema,
  whatsappPhone: phoneSchema.nullable().optional(),
  foodAvailable: z.boolean().default(false),
});
export type HostelInput = z.input<typeof hostelInputSchema>;
export const hostelUpdateSchema = hostelInputSchema.partial();
export type HostelUpdateInput = z.input<typeof hostelUpdateSchema>;

const roomFields = {
  sharing: z.enum(SHARING_TYPES),
  monthlyRent: rupees,
  advanceAmount: rupees.default(0),
  totalBeds: z.coerce.number().int().min(1).max(500),
  bedsAvailable: z.coerce.number().int().min(0).max(500),
};
export const roomTypeInputSchema = z
  .object(roomFields)
  .refine((r) => r.bedsAvailable <= r.totalBeds, { message: 'Beds free cannot exceed total beds', path: ['bedsAvailable'] });
export type RoomTypeInput = z.input<typeof roomTypeInputSchema>;
export const roomTypeUpdateSchema = z.object(roomFields).partial();
export type RoomTypeUpdateInput = z.input<typeof roomTypeUpdateSchema>;

export const photoInputSchema = z.object({ url: webUrl });
export const photoOrderSchema = z.object({ photoIds: z.array(z.string()).min(1).max(30) });

const boolParam = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')
  .optional();

export const SEARCH_SORTS = ['recommended', 'rent_asc', 'rent_desc', 'distance', 'rating'] as const;
export const searchSchema = z.object({
  q: shortText(80).optional(),
  area: shortText(60).optional(),
  minRent: rupees.optional(),
  maxRent: rupees.optional(),
  sharing: z.enum(SHARING_TYPES).optional(),
  gender: z.enum(GENDER_TYPES).optional(),
  food: boolParam,
  verified: boolParam,
  minRating: z.coerce.number().min(1).max(5).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(50).optional(),
  sort: z.enum(SEARCH_SORTS).default('recommended'),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchInput = z.input<typeof searchSchema>;

export const visitRequestSchema = z.object({
  preferredDate: isoDate,
  message: shortText(500).default(''),
});
export type VisitRequestInput = z.input<typeof visitRequestSchema>;
export const visitStatusSchema = z.object({ status: z.enum(VISIT_STATUSES) });

export const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export const verifyPartnerSchema = z.object({ platformFeePct: z.coerce.number().min(0).max(50).default(10) });
export const foodPartnerInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  cuisine: shortText(80).default(''),
  logoUrl: webUrl.nullable().optional(),
  active: z.boolean().default(true),
});
export const foodPartnerUpdateSchema = foodPartnerInputSchema.partial();

// ---------------------------------------------------------------------------
// Subscriptions, food and moves

export const subscribeSchema = z.object({
  roomTypeId: z.string().min(1),
  mealPlan: z.enum(MEAL_PLANS),
  diet: z.enum(DIETS).default('veg'),
});
export type SubscribeInput = z.input<typeof subscribeSchema>;

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyPaymentInput = z.input<typeof verifyPaymentSchema>;

export const menuWeekInputSchema = z.object({
  theme: shortText(80).default(''),
  items: z
    .array(
      z.object({
        date: isoDate,
        meal: z.enum(MEALS),
        vegDish: z.string().trim().min(1).max(120),
        nonVegDish: shortText(120).nullable().optional(),
        foodPartnerId: z.string().nullable().optional(),
      }),
    )
    .max(21),
});
export type MenuWeekInput = z.input<typeof menuWeekInputSchema>;

export const skipSchema = z.object({ date: isoDate, meal: z.enum(MEALS) });
export type SkipInput = z.input<typeof skipSchema>;

export const moveSchema = z.object({ toRoomTypeId: z.string().min(1), moveDate: isoDate });
export type MoveInput = z.input<typeof moveSchema>;

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
export const payoutGenerateSchema = z.object({ month: monthSchema });

// ---------------------------------------------------------------------------
// Residents, reviews, issues, community, owner plans

const rating = z.coerce.number().int().min(1).max(5);
export const reviewInputSchema = z.object({
  rating,
  cleanliness: rating,
  food: rating.nullable().optional(),
  safety: rating,
  responsiveness: rating,
  body: z.string().trim().min(20, 'Write at least 20 characters').max(2000),
});
export type ReviewInput = z.input<typeof reviewInputSchema>;
export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const ownerReplySchema = z.object({ reply: z.string().trim().min(2).max(1000) });

export const issueInputSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  title: z.string().trim().min(4).max(120),
  description: shortText(2000).default(''),
  photoUrl: webUrl.nullable().optional(),
});
export type IssueInput = z.input<typeof issueInputSchema>;
export const issueUpdateSchema = z
  .object({ status: z.enum(ISSUE_STATUSES).optional(), message: shortText(1000).optional() })
  .refine((v) => v.status || v.message, 'Send a status or a message');
export type IssueUpdateInput = z.input<typeof issueUpdateSchema>;

export const postInputSchema = z.object({
  kind: z.enum(POST_KINDS).default('general'),
  body: z.string().trim().min(1).max(1000),
  photoUrl: webUrl.nullable().optional(),
});
export type PostInput = z.input<typeof postInputSchema>;
export const commentInputSchema = z.object({ body: z.string().trim().min(1).max(500) });

export const ownerPlanChangeSchema = z.object({ plan: z.enum(OWNER_PLAN_TIERS) });
export const residentInputSchema = z.object({
  phone: phoneSchema,
  name: shortText(80).default(''),
  roomTypeId: z.string().nullable().optional(),
  monthlyRent: rupees,
  startDate: isoDate,
});
export type ResidentInput = z.input<typeof residentInputSchema>;
export const endResidencySchema = z.object({ endDate: isoDate });
export const rentRecordSchema = z.object({
  month: monthSchema,
  amountDue: rupees.optional(),
  amountPaid: rupees,
  paidOn: isoDate.nullable().optional(),
  method: z.enum(RENT_METHODS).nullable().optional(),
  note: shortText(300).default(''),
});
export type RentRecordInput = z.input<typeof rentRecordSchema>;
export const directorySchema = z.object({ directoryOptIn: z.boolean() });
