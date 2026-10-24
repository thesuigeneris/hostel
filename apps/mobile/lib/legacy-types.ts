// Types for the v0 API. The Expo app moves to the shared client and types in the mobile phase.
export type SharingType = '2-sharing' | '3-sharing' | '4-sharing' | 'private';
export type Role = 'tenant' | 'owner' | 'admin';

export type Hostel = {
  id: string;
  ownerId: string | null;
  name: string;
  area: string;
  city: string;
  imageUrl: string;
  monthlyRent: number;
  foodIncluded: boolean;
  sharingType: SharingType;
  amenities: string[];
  bedsAvailable: number;
  totalBeds: number;
  description: string;
};

export type User = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
};

export type MealPlan = 'full' | 'breakfast-only' | 'none';

export type SubscriptionStatus = 'pending' | 'active' | 'paused' | 'cancelled';

export type Subscription = {
  id: string;
  userId: string;
  hostelId: string;
  startDate: string;
  status: SubscriptionStatus;
  monthlyAmount: number;
  mealPlan: MealPlan;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
};

export type SubscribeInput = {
  hostelId: string;
  mealPlan: MealPlan;
};

export type AuthOtpRequestInput = { phone: string; role?: Role };
export type AuthOtpVerifyInput = { phone: string; otp: string };
export type AuthSession = { user: User; token: string };

export type CreateOrderInput = { hostelId: string; mealPlan: MealPlan };
export type CreateOrderResult = {
  orderId: string;
  amount: number;
  currency: 'INR';
  keyId: string;
};

export type VerifyPaymentInput = {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  hostelId: string;
  mealPlan: MealPlan;
};

export type Payout = {
  id: string;
  ownerId: string;
  hostelId: string;
  periodMonth: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  status: 'pending' | 'paid';
  paidAt: string | null;
};

export type CreateHostelInput = Omit<Hostel, 'id' | 'ownerId' | 'bedsAvailable'> & {
  bedsAvailable?: number;
};

export type UpdateHostelInput = Partial<Omit<Hostel, 'id' | 'ownerId'>>;

export type Subscriber = {
  subscription: Subscription;
  user: Pick<User, 'id' | 'name' | 'phone' | 'email'>;
};
