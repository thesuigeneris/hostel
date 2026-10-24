import type {
  HostelInput,
  HostelUpdateInput,
  IssueInput,
  IssueUpdateInput,
  MenuWeekInput,
  MoveInput,
  PostInput,
  RentRecordInput,
  RequestOtpInput,
  ResidentInput,
  ReviewInput,
  RoomTypeInput,
  RoomTypeUpdateInput,
  SearchInput,
  SkipInput,
  SubscribeInput,
  UpdateMeInput,
  VerifyOtpInput,
  VerifyPaymentInput,
  VisitRequestInput,
} from './schemas';
import type {
  AdminStats,
  ApiErrorBody,
  Area,
  AuthSession,
  CheckoutOrder,
  CommunityPost,
  ErrorCode,
  FoodPartner,
  Headcount,
  Health,
  Hostel,
  HostelDetail,
  HostelPhoto,
  Invoice,
  IssueDetail,
  IssueStatus,
  IssueView,
  MenuWeek,
  MoveRequest,
  MyMenu,
  MyResidency,
  MySubscription,
  MyVisit,
  OtpSent,
  OwnerHostelDetail,
  OwnerInvoice,
  OwnerPayouts,
  OwnerPlanInfo,
  OwnerVisit,
  PaymentPage,
  PayoutView,
  Residency,
  RentSheet,
  Review,
  SharingType,
  RoomType,
  SearchResult,
  Subscriber,
  Subscription,
  User,
  VisitRequest,
  VisitStatus,
} from './types';
import type {
  AdminOwnerInvoice,
  AdminOwnerPlan,
  AdminPartnerApplication,
  AuditAction,
  AuditEvent,
  BrandKit,
  OwnerInsights,
  OwnerPartnerInfo,
  PartnerApplication,
  PartnerStandardId,
} from './owner-admin';
import type { Meal } from './pricing';
import type { OwnerPlanTier } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public issues?: ApiErrorBody['issues'],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenSource = () => string | null | undefined | Promise<string | null | undefined>;
type Query = Record<string, string | number | boolean | undefined | null>;

export type RequestOptions = { method?: string; body?: unknown; query?: Query; headers?: Record<string, string> };

/** Typed API client shared by the website and the mobile app. */
export function createApiClient(baseUrl: string, getToken: TokenSource = () => null, fetchImpl: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetchImpl(url.toString(), {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const body = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, body.error ?? 'internal', body.message ?? `Request failed (${res.status})`, body.issues);
    }
    return data as T;
  }

  return {
    request,
    health: () => request<Health>('/'),
    auth: {
      requestOtp: (input: RequestOtpInput) => request<OtpSent>('/auth/otp', { body: input }),
      verifyOtp: (input: VerifyOtpInput) => request<AuthSession>('/auth/verify', { body: input }),
      logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
      handoff: () => request<{ code: string; expiresInSeconds: number }>('/auth/handoff', { method: 'POST' }),
      redeemHandoff: (code: string) => request<AuthSession>('/auth/handoff/redeem', { body: { code } }),
    },
    me: {
      get: () => request<User>('/me'),
      update: (input: UpdateMeInput) => request<User>('/me', { method: 'PATCH', body: input }),
      subscription: () => request<MySubscription | null>('/me/subscription'),
      cancelSubscription: () => request<Subscription>('/me/subscription/cancel', { method: 'POST' }),
      invoices: () => request<Invoice[]>('/me/invoices'),
      menu: (days = 7) => request<MyMenu>('/me/menu', { query: { days } }),
      skip: (input: SkipInput) => request('/me/skips', { body: input }),
      unskip: (date: string, meal: Meal) => request<{ ok: true }>(`/me/skips/${date}/${meal}`, { method: 'DELETE' }),
      moves: () => request<MoveRequest[]>('/me/moves'),
      move: (input: MoveInput) => request<MoveRequest>('/me/moves', { body: input }),
      cancelMove: (id: string) => request<MoveRequest>(`/me/moves/${id}`, { method: 'DELETE' }),
      visits: () => request<MyVisit[]>('/me/visits'),
      cancelVisit: (id: string) => request<VisitRequest>(`/me/visits/${id}`, { method: 'DELETE' }),
      residencies: () => request<MyResidency[]>('/me/residencies'),
      acceptResidency: (id: string) => request<Residency>(`/me/residencies/${id}/accept`, { method: 'POST' }),
      declineResidency: (id: string) => request<Residency>(`/me/residencies/${id}/decline`, { method: 'POST' }),
      moveOut: (id: string) => request<Residency>(`/me/residencies/${id}/move-out`, { method: 'POST' }),
      setDirectory: (id: string, directoryOptIn: boolean) =>
        request<Residency>(`/me/residencies/${id}`, { method: 'PATCH', body: { directoryOptIn } }),
    },
    hostels: {
      search: (input: SearchInput = {}) => request<SearchResult>('/hostels', { query: input as Query }),
      get: (slug: string) => request<HostelDetail>(`/hostels/${slug}`),
      reviews: (slug: string, page = 1) => request<Review[]>(`/hostels/${slug}/reviews`, { query: { page } }),
      menu: (slug: string, date?: string) => request<MenuWeek | null>(`/hostels/${slug}/menu`, { query: { date } }),
      areas: () => request<Area[]>('/areas'),
      sitemap: () => request<{ hostels: { slug: string; area: string }[]; areas: Area[] }>('/sitemap-data'),
      foodPartners: () => request<FoodPartner[]>('/food-partners'),
      requestVisit: (hostelId: string, input: VisitRequestInput) => request<VisitRequest>(`/hostels/${hostelId}/visits`, { body: input }),
      subscribe: (hostelId: string, input: SubscribeInput) =>
        request<{ subscription: Subscription; invoice: Invoice }>(`/hostels/${hostelId}/subscribe`, { body: input }),
      review: (hostelId: string, input: ReviewInput) => request<Review>(`/hostels/${hostelId}/review`, { method: 'PUT', body: input }),
      flagReview: (reviewId: string, reason: string) => request<{ ok: true }>(`/reviews/${reviewId}/flag`, { body: { reason } }),
    },
    resident: {
      issues: (hostelId: string, status?: IssueStatus) => request<IssueView[]>(`/hostels/${hostelId}/issues`, { query: { status } }),
      reportIssue: (hostelId: string, input: IssueInput) => request<IssueView>(`/hostels/${hostelId}/issues`, { body: input }),
      issue: (id: string) => request<IssueDetail>(`/issues/${id}`),
      updateIssue: (id: string, input: IssueUpdateInput) => request<IssueDetail>(`/issues/${id}/updates`, { body: input }),
      upvote: (id: string, on: boolean) => request<IssueDetail>(`/issues/${id}/upvote`, { method: on ? 'PUT' : 'DELETE' }),
      feed: (hostelId: string) => request<CommunityPost[]>(`/hostels/${hostelId}/community`),
      post: (hostelId: string, input: PostInput) => request(`/hostels/${hostelId}/community`, { body: input }),
      comment: (postId: string, body: string) => request(`/posts/${postId}/comments`, { body: { body } }),
      deletePost: (postId: string) => request<{ ok: true }>(`/posts/${postId}`, { method: 'DELETE' }),
      deleteComment: (id: string) => request<{ ok: true }>(`/comments/${id}`, { method: 'DELETE' }),
      moderatePost: (postId: string, patch: { hidden?: boolean; pinned?: boolean }) =>
        request(`/posts/${postId}`, { method: 'PATCH', body: patch }),
      moderateComment: (id: string, hidden: boolean) => request(`/comments/${id}`, { method: 'PATCH', body: { hidden } }),
      report: (type: 'post' | 'comment', id: string, reason: string) =>
        request<{ ok: true }>(`/${type === 'post' ? 'posts' : 'comments'}/${id}/report`, { body: { reason } }),
      directory: (hostelId: string) => request<{ name: string; sharing: SharingType | null; since: string }[]>(`/hostels/${hostelId}/directory`),
    },
    payments: {
      page: (invoiceId: string) => request<PaymentPage>(`/payments/${invoiceId}`),
      order: (invoiceId: string) => request<CheckoutOrder>(`/payments/${invoiceId}/order`, { method: 'POST' }),
      verify: (invoiceId: string, input: VerifyPaymentInput) => request<PaymentPage>(`/payments/${invoiceId}/verify`, { body: input }),
      simulate: (invoiceId: string) => request<PaymentPage>(`/payments/${invoiceId}/simulate`, { method: 'POST' }),
    },
    owner: {
      hostels: () => request<Hostel[]>('/owner/hostels'),
      hostel: (id: string) => request<OwnerHostelDetail>(`/owner/hostels/${id}`),
      create: (input: HostelInput) => request<Hostel>('/owner/hostels', { body: input }),
      update: (id: string, input: HostelUpdateInput) => request<Hostel>(`/owner/hostels/${id}`, { method: 'PATCH', body: input }),
      submit: (id: string) => request<Hostel>(`/owner/hostels/${id}/submit`, { method: 'POST' }),
      applyPartner: (id: string) => request<Hostel>(`/owner/hostels/${id}/partner`, { method: 'POST' }),
      addRoom: (id: string, input: RoomTypeInput) => request<RoomType>(`/owner/hostels/${id}/rooms`, { body: input }),
      updateRoom: (roomId: string, input: RoomTypeUpdateInput) => request<RoomType>(`/owner/rooms/${roomId}`, { method: 'PATCH', body: input }),
      deleteRoom: (roomId: string) => request<{ ok: true }>(`/owner/rooms/${roomId}`, { method: 'DELETE' }),
      addPhoto: (id: string, url: string) => request<HostelPhoto>(`/owner/hostels/${id}/photos`, { body: { url } }),
      deletePhoto: (id: string, photoId: string) => request<{ ok: true }>(`/owner/hostels/${id}/photos/${photoId}`, { method: 'DELETE' }),
      reorderPhotos: (id: string, photoIds: string[]) => request<HostelPhoto[]>(`/owner/hostels/${id}/photos/order`, { method: 'PUT', body: { photoIds } }),
      visits: (status?: VisitStatus) => request<OwnerVisit[]>('/owner/visits', { query: { status } }),
      setVisit: (id: string, status: VisitStatus) => request<VisitRequest>(`/owner/visits/${id}`, { method: 'PATCH', body: { status } }),
      menu: (id: string, weekStart: string) => request<MenuWeek | null>(`/owner/hostels/${id}/menus/${weekStart}`),
      saveMenu: (id: string, weekStart: string, input: MenuWeekInput) =>
        request<MenuWeek>(`/owner/hostels/${id}/menus/${weekStart}`, { method: 'PUT', body: input }),
      copyLastWeek: (id: string, weekStart: string) => request<MenuWeek>(`/owner/hostels/${id}/menus/${weekStart}/copy-last`, { method: 'POST' }),
      headcount: (id: string, date?: string) => request<Headcount>(`/owner/hostels/${id}/headcount`, { query: { date } }),
      subscribers: (id: string) => request<Subscriber[]>(`/owner/hostels/${id}/subscribers`),
      payouts: () => request<OwnerPayouts>('/owner/payouts'),
      plan: (id: string) => request<OwnerPlanInfo>(`/owner/hostels/${id}/plan`),
      changePlan: (id: string, plan: OwnerPlanTier) => request<OwnerPlanInfo>(`/owner/hostels/${id}/plan`, { body: { plan } }),
      residents: (id: string) => request<Residency[]>(`/owner/hostels/${id}/residents`),
      addResident: (id: string, input: ResidentInput) => request<Residency>(`/owner/hostels/${id}/residents`, { body: input }),
      endResident: (id: string, rid: string, endDate: string) =>
        request<Residency>(`/owner/hostels/${id}/residents/${rid}/end`, { body: { endDate } }),
      rent: (id: string, month?: string) => request<RentSheet>(`/owner/hostels/${id}/rent`, { query: { month } }),
      recordRent: (id: string, rid: string, input: RentRecordInput) => request(`/owner/hostels/${id}/rent/${rid}`, { method: 'PUT', body: input }),
      issues: () => request<IssueView[]>('/owner/issues'),
      reports: () => request<{ id: string; targetType: string; targetId: string; reason: string; hostelName: string; createdAt: string }[]>('/owner/reports'),
      reviews: (id: string) => request<Review[]>(`/owner/hostels/${id}/reviews`),
      reply: (reviewId: string, reply: string) => request<Review>(`/owner/reviews/${reviewId}/reply`, { body: { reply } }),
      insights: (id: string, month?: string) => request<OwnerInsights>(`/owner/hostels/${id}/insights`, { query: { month } }),
      partnerInfo: (id: string) => request<OwnerPartnerInfo>(`/owner/hostels/${id}/partner`),
      brandKit: (id: string) => request<BrandKit>(`/owner/hostels/${id}/brand-kit`),
    },
    admin: {
      stats: () => request<AdminStats>('/admin/stats'),
      hostels: (filter: { status?: string; partnerStatus?: string; q?: string } = {}) => request<Hostel[]>('/admin/hostels', { query: filter }),
      hostel: (id: string) => request<HostelDetail>(`/admin/hostels/${id}`),
      approve: (id: string) => request<Hostel>(`/admin/hostels/${id}/approve`, { method: 'POST' }),
      reject: (id: string, reason: string) => request<Hostel>(`/admin/hostels/${id}/reject`, { body: { reason } }),
      verifyPartner: (id: string, platformFeePct: number, inspection?: { checklist: PartnerStandardId[]; note?: string }) =>
        request<Hostel>(`/admin/hostels/${id}/partner/verify`, { body: { platformFeePct, ...inspection } }),
      partnerApplications: (status?: 'applied' | 'verified' | 'rejected') =>
        request<AdminPartnerApplication[]>('/admin/partner-applications', { query: { status } }),
      saveChecklist: (id: string, checklist: PartnerStandardId[], note = '') =>
        request<PartnerApplication>(`/admin/hostels/${id}/partner/checklist`, { method: 'PUT', body: { checklist, note } }),
      rejectPartner: (id: string, reason: string) => request<Hostel>(`/admin/hostels/${id}/partner/reject`, { body: { reason } }),
      setFee: (id: string, platformFeePct: number) => request<Hostel>(`/admin/hostels/${id}/fee`, { method: 'PATCH', body: { platformFeePct } }),
      foodPartners: () => request<FoodPartner[]>('/admin/food-partners'),
      addFoodPartner: (input: { name: string; cuisine?: string; logoUrl?: string | null; active?: boolean }) =>
        request<FoodPartner>('/admin/food-partners', { body: input }),
      updateFoodPartner: (id: string, input: Partial<{ name: string; cuisine: string; logoUrl: string | null; active: boolean }>) =>
        request<FoodPartner>(`/admin/food-partners/${id}`, { method: 'PATCH', body: input }),
      subscriptions: (status?: string) =>
        request<{ subscription: Subscription; user: { id: string; name: string; phone: string }; hostelName: string }[]>('/admin/subscriptions', { query: { status } }),
      moves: () => request<MoveRequest[]>('/admin/moves'),
      overdue: () => request<{ invoice: Invoice; userName: string; phone: string; hostelName: string }[]>('/admin/invoices/overdue'),
      ownerInvoices: (filter: { status?: string; overdue?: boolean; q?: string } = {}) =>
        request<AdminOwnerInvoice[]>('/admin/owner-invoices', { query: filter }),
      ownerPlans: (filter: { plan?: OwnerPlanTier; suspended?: boolean; q?: string } = {}) =>
        request<AdminOwnerPlan[]>('/admin/owner-plans', { query: filter }),
      voidOwnerInvoice: (id: string, reason: string) => request<OwnerInvoice>(`/admin/owner-invoices/${id}/void`, { body: { reason } }),
      payouts: (month?: string) => request<PayoutView[]>('/admin/payouts', { query: { month } }),
      generatePayouts: (month: string) => request<PayoutView[]>('/admin/payouts/generate', { body: { month } }),
      markPayoutPaid: (id: string) => request('/admin/payouts/' + id + '/paid', { method: 'POST' }),
      flaggedReviews: () =>
        request<{ review: Review & { userId: string }; hostelName: string; flags: number; reasons: string[] }[]>('/admin/reviews/flagged'),
      hideReview: (id: string, reason: string) => request(`/admin/reviews/${id}/hide`, { body: { reason } }),
      unhideReview: (id: string) => request(`/admin/reviews/${id}/unhide`, { method: 'POST' }),
      reports: () => request<{ id: string; targetType: string; targetId: string; reason: string; hostelName: string; hostelId: string; createdAt: string }[]>('/admin/reports'),
      runJobs: () => request<Record<string, number>>('/admin/jobs/run', { method: 'POST' }),
      audit: (filter: { action?: AuditAction; targetId?: string; q?: string; before?: string; limit?: number } = {}) =>
        request<AuditEvent[]>('/admin/audit', { query: filter }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
