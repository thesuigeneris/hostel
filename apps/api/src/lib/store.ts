import type { Hostel, Subscription, User, Payout, Role, MealPlan } from '@hostels/shared';
import { eq, and, desc } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hostels as seedHostels } from '../data';

const memUsers = new Map<string, User>();
const memHostels = new Map<string, Hostel>(seedHostels.map((h) => [h.id, { ...h }]));
const memSubscriptions = new Map<string, Subscription>();
const memOtp = new Map<string, { code: string; expiresAt: number }>();
const memSessions = new Map<string, string>();
const memPayouts = new Map<string, Payout>();

const PLATFORM_FEE_PCT = 0.10;

export const store = {
  async findUserByPhone(phone: string): Promise<User | null> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
      const r = rows[0];
      return r ? { id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role } : null;
    }
    return [...memUsers.values()].find((u) => u.phone === phone) ?? null;
  },

  async getUser(id: string): Promise<User | null> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
      const r = rows[0];
      return r ? { id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role } : null;
    }
    return memUsers.get(id) ?? null;
  },

  async createUser(input: { phone: string; role: Role }): Promise<User> {
    const id = `usr_${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const user: User = { id, name: '', phone: input.phone, email: null, role: input.role };
    const db = getDb();
    if (db) {
      await db.insert(schema.users).values({
        id,
        name: '',
        phone: input.phone,
        email: null,
        role: input.role,
      });
    } else {
      memUsers.set(id, user);
    }
    return user;
  },

  async updateUser(id: string, patch: Partial<Pick<User, 'name' | 'email' | 'role'>>): Promise<User> {
    const db = getDb();
    if (db) {
      await db.update(schema.users).set(patch).where(eq(schema.users.id, id));
      const u = await this.getUser(id);
      if (!u) throw new Error('user not found');
      return u;
    }
    const u = memUsers.get(id);
    if (!u) throw new Error('user not found');
    Object.assign(u, patch);
    memUsers.set(id, u);
    return u;
  },

  async setOtp(phone: string, code: string, ttlSeconds: number) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const db = getDb();
    if (db) {
      await db
        .insert(schema.otpCodes)
        .values({ phone, code, expiresAt: new Date(expiresAt) })
        .onConflictDoUpdate({
          target: schema.otpCodes.phone,
          set: { code, expiresAt: new Date(expiresAt) },
        });
    } else {
      memOtp.set(phone, { code, expiresAt });
    }
  },

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone)).limit(1);
      const r = rows[0];
      if (!r) return false;
      if (r.expiresAt.getTime() < Date.now()) return false;
      if (r.code !== code) return false;
      await db.delete(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
      return true;
    }
    const r = memOtp.get(phone);
    if (!r) return false;
    if (r.expiresAt < Date.now()) return false;
    if (r.code !== code) return false;
    memOtp.delete(phone);
    return true;
  },

  async createSession(userId: string): Promise<string> {
    const token = `tok_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const db = getDb();
    if (db) {
      await db.insert(schema.sessions).values({ token, userId });
    } else {
      memSessions.set(token, userId);
    }
    return token;
  },

  async getSessionUser(token: string): Promise<User | null> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).limit(1);
      const r = rows[0];
      if (!r) return null;
      return this.getUser(r.userId);
    }
    const userId = memSessions.get(token);
    if (!userId) return null;
    return this.getUser(userId);
  },

  async listHostels(filters?: { area?: string; maxRent?: number; ownerId?: string }): Promise<Hostel[]> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.hostels);
      const result: Hostel[] = rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        area: r.area,
        city: r.city,
        imageUrl: r.imageUrl,
        monthlyRent: r.monthlyRent,
        foodIncluded: r.foodIncluded,
        sharingType: r.sharingType,
        amenities: r.amenities,
        bedsAvailable: r.bedsAvailable,
        totalBeds: r.totalBeds,
        description: r.description,
      }));
      return applyHostelFilters(result, filters);
    }
    return applyHostelFilters([...memHostels.values()], filters);
  },

  async getHostel(id: string): Promise<Hostel | null> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.hostels).where(eq(schema.hostels.id, id)).limit(1);
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id,
        ownerId: r.ownerId,
        name: r.name,
        area: r.area,
        city: r.city,
        imageUrl: r.imageUrl,
        monthlyRent: r.monthlyRent,
        foodIncluded: r.foodIncluded,
        sharingType: r.sharingType,
        amenities: r.amenities,
        bedsAvailable: r.bedsAvailable,
        totalBeds: r.totalBeds,
        description: r.description,
      };
    }
    return memHostels.get(id) ?? null;
  },

  async createHostel(input: Omit<Hostel, 'id'>): Promise<Hostel> {
    const id = `hst_${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const hostel: Hostel = { ...input, id };
    const db = getDb();
    if (db) {
      await db.insert(schema.hostels).values({ ...hostel });
    } else {
      memHostels.set(id, hostel);
    }
    return hostel;
  },

  async updateHostel(id: string, patch: Partial<Hostel>): Promise<Hostel> {
    const db = getDb();
    if (db) {
      await db.update(schema.hostels).set(patch).where(eq(schema.hostels.id, id));
      const h = await this.getHostel(id);
      if (!h) throw new Error('hostel not found');
      return h;
    }
    const h = memHostels.get(id);
    if (!h) throw new Error('hostel not found');
    Object.assign(h, patch);
    memHostels.set(id, h);
    return h;
  },

  async incrementBeds(hostelId: string, delta: number) {
    const h = await this.getHostel(hostelId);
    if (!h) return;
    await this.updateHostel(hostelId, { bedsAvailable: Math.max(0, h.bedsAvailable + delta) });
  },

  async createPendingSubscription(input: {
    userId: string;
    hostelId: string;
    monthlyAmount: number;
    mealPlan: MealPlan;
    razorpayOrderId: string;
  }): Promise<Subscription> {
    const id = `sub_${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const sub: Subscription = {
      id,
      userId: input.userId,
      hostelId: input.hostelId,
      startDate: new Date().toISOString().slice(0, 10),
      status: 'pending',
      monthlyAmount: input.monthlyAmount,
      mealPlan: input.mealPlan,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: null,
    };
    const db = getDb();
    if (db) {
      await db.insert(schema.subscriptions).values({ ...sub });
    } else {
      memSubscriptions.set(id, sub);
    }
    return sub;
  },

  async activateSubscriptionByOrder(orderId: string, paymentId: string): Promise<Subscription | null> {
    const db = getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.razorpayOrderId, orderId))
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      await db
        .update(schema.subscriptions)
        .set({ status: 'active', razorpayPaymentId: paymentId })
        .where(eq(schema.subscriptions.id, r.id));
      return { ...subRowToShared(r), status: 'active', razorpayPaymentId: paymentId };
    }
    const sub = [...memSubscriptions.values()].find((s) => s.razorpayOrderId === orderId);
    if (!sub) return null;
    sub.status = 'active';
    sub.razorpayPaymentId = paymentId;
    return sub;
  },

  async getActiveSubscriptionFor(userId: string): Promise<Subscription | null> {
    const db = getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.subscriptions)
        .where(and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, 'active')))
        .limit(1);
      const r = rows[0];
      return r ? subRowToShared(r) : null;
    }
    return [...memSubscriptions.values()].find((s) => s.userId === userId && s.status === 'active') ?? null;
  },

  async getSubscription(id: string): Promise<Subscription | null> {
    const db = getDb();
    if (db) {
      const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.id, id)).limit(1);
      const r = rows[0];
      return r ? subRowToShared(r) : null;
    }
    return memSubscriptions.get(id) ?? null;
  },

  async cancelSubscription(id: string): Promise<Subscription | null> {
    const db = getDb();
    if (db) {
      await db
        .update(schema.subscriptions)
        .set({ status: 'cancelled' })
        .where(eq(schema.subscriptions.id, id));
      return this.getSubscription(id);
    }
    const sub = memSubscriptions.get(id);
    if (!sub) return null;
    sub.status = 'cancelled';
    return sub;
  },

  async listSubscribersForOwner(ownerId: string): Promise<Array<{ subscription: Subscription; user: User; hostel: Hostel }>> {
    const allHostels = await this.listHostels({ ownerId });
    const ownerHostelIds = new Set(allHostels.map((h) => h.id));
    const db = getDb();
    if (db) {
      const subs = await db.select().from(schema.subscriptions);
      const result = [];
      for (const s of subs) {
        if (!ownerHostelIds.has(s.hostelId)) continue;
        const user = await this.getUser(s.userId);
        const hostel = allHostels.find((h) => h.id === s.hostelId);
        if (user && hostel) result.push({ subscription: subRowToShared(s), user, hostel });
      }
      return result;
    }
    const result = [];
    for (const s of memSubscriptions.values()) {
      if (!ownerHostelIds.has(s.hostelId)) continue;
      const user = await this.getUser(s.userId);
      const hostel = allHostels.find((h) => h.id === s.hostelId);
      if (user && hostel) result.push({ subscription: s, user, hostel });
    }
    return result;
  },

  async listPayouts(ownerId: string): Promise<Payout[]> {
    const db = getDb();
    if (db) {
      const rows = await db
        .select()
        .from(schema.payouts)
        .where(eq(schema.payouts.ownerId, ownerId))
        .orderBy(desc(schema.payouts.periodMonth));
      return rows.map((r) => ({
        id: r.id,
        ownerId: r.ownerId,
        hostelId: r.hostelId,
        periodMonth: r.periodMonth,
        grossAmount: r.grossAmount,
        platformFee: r.platformFee,
        netAmount: r.netAmount,
        status: r.status,
        paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      }));
    }
    return [...memPayouts.values()].filter((p) => p.ownerId === ownerId);
  },

  async computePayoutPreview(ownerId: string): Promise<{ gross: number; fee: number; net: number; activeSubscribers: number }> {
    const subs = await this.listSubscribersForOwner(ownerId);
    const active = subs.filter((s) => s.subscription.status === 'active');
    const gross = active.reduce((sum, s) => sum + s.subscription.monthlyAmount, 0);
    const fee = Math.round(gross * PLATFORM_FEE_PCT);
    return { gross, fee, net: gross - fee, activeSubscribers: active.length };
  },
};

function applyHostelFilters(result: Hostel[], filters?: { area?: string; maxRent?: number; ownerId?: string }): Hostel[] {
  if (!filters) return result;
  let r = result;
  if (filters.area) r = r.filter((h) => h.area.toLowerCase() === filters.area!.toLowerCase());
  if (filters.maxRent) r = r.filter((h) => h.monthlyRent <= filters.maxRent!);
  if (filters.ownerId) r = r.filter((h) => h.ownerId === filters.ownerId);
  return r;
}

function subRowToShared(r: typeof schema.subscriptions.$inferSelect): Subscription {
  return {
    id: r.id,
    userId: r.userId,
    hostelId: r.hostelId,
    startDate: typeof r.startDate === 'string' ? r.startDate : new Date(r.startDate as any).toISOString().slice(0, 10),
    status: r.status,
    monthlyAmount: r.monthlyAmount,
    mealPlan: r.mealPlan,
    razorpayOrderId: r.razorpayOrderId,
    razorpayPaymentId: r.razorpayPaymentId,
  };
}
