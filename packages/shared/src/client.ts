import type {
  ChangePasswordInput,
  DeleteAccountInput,
  HostelInput,
  HostelUpdateInput,
  IssueInput,
  IssueUpdateInput,
  LoginInput,
  MenuWeekInput,
  FoodPlanChangeInput,
  MoveInput,
  PostInput,
  RegisterInput,
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
  AuthMethods,
  CommunityPost,
  EscalatedIssue,
  OwnerInsights,
  OwnerIssueSummary,
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
  DeletionStatus,
  FoodPlanChange,
  MoveRequest,
  MySignals,
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
  AdminPaymentException,
  PaymentExceptionStatus,
  PaymentMode,
  PaymentPage,
  PayoutView,
  PlatformRevenue,
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
  AdminFlaggedReview,
  AdminHiddenContent,
  AdminHiddenReview,
  AdminHostel,
  AdminOwnerInvoice,
  AdminOwnerPlan,
  AdminPartnerApplication,
  AdminReport,
  ListingChange,
  AuditAction,
  AuditEvent,
  BrandKit,
  OwnerPartnerInfo,
  PartnerApplication,
  PartnerStandardId,
} from './owner-admin';
import type { Meal } from './pricing';
import type { Suggestions } from './seeker';
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
      methods: () => request<AuthMethods>('/auth/methods'),
      register: (input: RegisterInput) => request<AuthSession>('/auth/register', { body: input }),
      login: (input: LoginInput) => request<AuthSession>('/auth/login', { body: input }),
      demo: (phone: string) => request<AuthSession>('/auth/demo', { body: { phone } }),
      requestOtp: (input: RequestOtpInput) => request<OtpSent>('/auth/otp', { body: input }),
      verifyOtp: (input: VerifyOtpInput) => request<AuthSession>('/auth/verify', { body: input }),
      logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
      handoff: () => request<{ code: string; expiresInSeconds: number }>('/auth/handoff', { method: 'POST' }),
      redeemHandoff: (code: string) => request<AuthSession>('/auth/handoff/redeem', { body: { code } }),
    },
    me: {
      get: () => request<User>('/me'),
      update: (input: UpdateMeInput) => request<User>('/me', { method: 'PATCH', body: input }),
      setPassword: (input: ChangePasswordInput) => request<{ ok: true }>('/me/password', { body: input }),
      /** Everything we hold about me, as one JSON document (DPDP Act 2023). */
      exportData: () => request<Record<string, unknown>>('/me/export'),
      deletionStatus: () => request<DeletionStatus>('/me/deletion'),
      /** Deletes the account and signs out everywhere. Cannot be undone. */
      deleteAccount: (input: DeleteAccountInput) => request<{ ok: true }>('/me/delete', { body: input }),
      subscription: () => request<MySubscription | null>('/me/subscription'),
      cancelSubscription: () => request<Subscription>('/me/subscription/cancel', { method: 'POST' }),
      invoices: () => request<Invoice[]>('/me/invoices'),
      menu: (days = 7) => request<MyMenu>('/me/menu', { query: { days } }),
      skip: (input: SkipInput) => request('/me/skips', { body: input }),
      unskip: (date: string, meal: Meal) => request<{ ok: true }>(`/me/skips/${date}/${meal}`, { method: 'DELETE' }),
      moves: () => request<MoveRequest[]>('/me/moves'),
      move: (input: MoveInput) => request<MoveRequest>('/me/moves', { body: input }),
      cancelMove: (id: string) => request<MoveRequest>(`/me/moves/${id}`, { method: 'DELETE' }),
      /** Change the food plan or diet from the next unpaid bill; replaces a change already scheduled. */
      changeFoodPlan: (input: FoodPlanChangeInput) => request<FoodPlanChange>('/me/food-plan', { body: input }),
      cancelFoodPlanChange: (id: string) => request<FoodPlanChange>(`/me/food-plan/${id}`, { method: 'DELETE' }),
      visits: () => request<MyVisit[]>('/me/visits'),
      cancelVisit: (id: string) => request<VisitRequest>(`/me/visits/${seg(id)}`, { method: 'DELETE' }),
      residencies: () => request<MyResidency[]>('/me/residencies'),
      acceptResidency: (id: string) => request<Residency>(`/me/residencies/${id}/accept`, { method: 'POST' }),
      declineResidency: (id: string) => request<Residency>(`/me/residencies/${id}/decline`, { method: 'POST' }),
      moveOut: (id: string) => request<Residency>(`/me/residencies/${id}/move-out`, { method: 'POST' }),
      setDirectory: (id: string, directoryOptIn: boolean) =>
        request<Residency>(`/me/residencies/${id}`, { method: 'PATCH', body: { directoryOptIn } }),
    },
    hostels: {
      search: (input: SearchInput = {}) => request<SearchResult>('/hostels', { query: input as Query }),
      // Slugs and ids come from URLs and form fields, so each is one encoded path segment.
      get: (slug: string) => request<HostelDetail>(`/hostels/${seg(slug)}`),
      reviews: (slug: string, page = 1) => request<Review[]>(`/hostels/${seg(slug)}/reviews`, { query: { page } }),
      menu: (slug: string, date?: string) => request<MenuWeek | null>(`/hostels/${seg(slug)}/menu`, { query: { date } }),
      /** Areas and hostel names matching what a seeker has typed so far. */
      suggest: (q: string, limit?: number) => request<Suggestions>('/suggest', { query: { q, limit } }),
      areas: () => request<Area[]>('/areas'),
      sitemap: () => request<{ hostels: { slug: string; area: string }[]; areas: Area[] }>('/sitemap-data'),
      foodPartners: () => request<FoodPartner[]>('/food-partners'),
      recordView: (slug: string) => request<{ ok: true }>(`/hostels/${seg(slug)}/view`, { method: 'POST' }),
      requestVisit: (hostelId: string, input: VisitRequestInput) => request<VisitRequest>(`/hostels/${seg(hostelId)}/visits`, { body: input }),
      subscribe: (hostelId: string, input: SubscribeInput) =>
        request<{ subscription: Subscription; invoice: Invoice }>(`/hostels/${seg(hostelId)}/subscribe`, { body: input }),
      review: (hostelId: string, input: ReviewInput) => request<Review>(`/hostels/${hostelId}/review`, { method: 'PUT', body: input }),
      flagReview: (reviewId: string, reason: string) => request<{ ok: true }>(`/reviews/${seg(reviewId)}/flag`, { body: { reason } }),
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
      like: (postId: string, on: boolean) => request<{ likes: number; likedByMe: boolean }>(`/posts/${postId}/like`, { method: on ? 'PUT' : 'DELETE' }),
      deletePost: (postId: string) => request<{ ok: true }>(`/posts/${postId}`, { method: 'DELETE' }),
      deleteComment: (id: string) => request<{ ok: true }>(`/comments/${id}`, { method: 'DELETE' }),
      moderatePost: (postId: string, patch: { hidden?: boolean; pinned?: boolean }) =>
        request(`/posts/${postId}`, { method: 'PATCH', body: patch }),
      moderateComment: (id: string, hidden: boolean) => request(`/comments/${id}`, { method: 'PATCH', body: { hidden } }),
      report: (type: 'post' | 'comment', id: string, reason: string) =>
        request<{ ok: true }>(`/${type === 'post' ? 'posts' : 'comments'}/${id}/report`, { body: { reason } }),
      directory: (hostelId: string) => request<{ name: string; sharing: SharingType | null; since: string }[]>(`/hostels/${hostelId}/directory`),
      /** Issues I reported at any hostel, newest first; read-only at hostels I've moved out of. */
      myIssues: () => request<IssueView[]>('/me/issues'),
      /** Badge counts: my issues with updates I haven't opened yet. */
      signals: () => request<MySignals>('/me/signals'),
    },
    payments: {
      page: (invoiceId: string) => request<PaymentPage>(`/payments/${invoiceId}`),
      order: (invoiceId: string) => request<CheckoutOrder>(`/payments/${invoiceId}/order`, { method: 'POST' }),
      verify: (invoiceId: string, input: VerifyPaymentInput) => request<PaymentPage>(`/payments/${invoiceId}/verify`, { body: input }),
      simulate: (invoiceId: string) => request<PaymentPage>(`/payments/${invoiceId}/simulate`, { method: 'POST' }),
    },
    owner: {
      hostels: () => request<Hostel[]>('/owner/hostels'),
      hostel: (id: string) => request<OwnerHostelDetail>(`/owner/hostels/${seg(id)}`),
      create: (input: HostelInput) => request<Hostel>('/owner/hostels', { body: input }),
      update: (id: string, input: HostelUpdateInput) => request<Hostel>(`/owner/hostels/${seg(id)}`, { method: 'PATCH', body: input }),
      submit: (id: string) => request<Hostel>(`/owner/hostels/${seg(id)}/submit`, { method: 'POST' }),
      applyPartner: (id: string) => request<Hostel>(`/owner/hostels/${seg(id)}/partner`, { method: 'POST' }),
      addRoom: (id: string, input: RoomTypeInput) => request<RoomType>(`/owner/hostels/${seg(id)}/rooms`, { body: input }),
      updateRoom: (roomId: string, input: RoomTypeUpdateInput) => request<RoomType>(`/owner/rooms/${seg(roomId)}`, { method: 'PATCH', body: input }),
      deleteRoom: (roomId: string) => request<{ ok: true }>(`/owner/rooms/${seg(roomId)}`, { method: 'DELETE' }),
      /** `photo` is the `upload` receipt from `POST /uploads` with purpose `listing`. */
      addPhoto: (id: string, photo: string) => request<HostelPhoto>(`/owner/hostels/${seg(id)}/photos`, { body: { photo } }),
      deletePhoto: (id: string, photoId: string) => request<{ ok: true }>(`/owner/hostels/${seg(id)}/photos/${seg(photoId)}`, { method: 'DELETE' }),
      reorderPhotos: (id: string, photoIds: string[]) => request<HostelPhoto[]>(`/owner/hostels/${seg(id)}/photos/order`, { method: 'PUT', body: { photoIds } }),
      visits: (status?: VisitStatus) => request<OwnerVisit[]>('/owner/visits', { query: { status } }),
      setVisit: (id: string, status: VisitStatus) => request<VisitRequest>(`/owner/visits/${seg(id)}`, { method: 'PATCH', body: { status } }),
      menu: (id: string, weekStart: string) => request<MenuWeek | null>(`/owner/hostels/${seg(id)}/menus/${seg(weekStart)}`),
      saveMenu: (id: string, weekStart: string, input: MenuWeekInput) =>
        request<MenuWeek>(`/owner/hostels/${seg(id)}/menus/${seg(weekStart)}`, { method: 'PUT', body: input }),
      copyLastWeek: (id: string, weekStart: string) => request<MenuWeek>(`/owner/hostels/${seg(id)}/menus/${seg(weekStart)}/copy-last`, { method: 'POST' }),
      headcount: (id: string, date?: string) => request<Headcount>(`/owner/hostels/${seg(id)}/headcount`, { query: { date } }),
      subscribers: (id: string) => request<Subscriber[]>(`/owner/hostels/${seg(id)}/subscribers`),
      payouts: () => request<OwnerPayouts>('/owner/payouts'),
      plan: (id: string) => request<OwnerPlanInfo>(`/owner/hostels/${seg(id)}/plan`),
      changePlan: (id: string, plan: OwnerPlanTier) => request<OwnerPlanInfo>(`/owner/hostels/${seg(id)}/plan`, { body: { plan } }),
      residents: (id: string) => request<Residency[]>(`/owner/hostels/${seg(id)}/residents`),
      addResident: (id: string, input: ResidentInput) => request<Residency>(`/owner/hostels/${seg(id)}/residents`, { body: input }),
      endResident: (id: string, rid: string, endDate: string) =>
        request<Residency>(`/owner/hostels/${seg(id)}/residents/${seg(rid)}/end`, { body: { endDate } }),
      rent: (id: string, month?: string) => request<RentSheet>(`/owner/hostels/${seg(id)}/rent`, { query: { month } }),
      recordRent: (id: string, rid: string, input: RentRecordInput) => request(`/owner/hostels/${seg(id)}/rent/${seg(rid)}`, { method: 'PUT', body: input }),
      issues: () => request<IssueView[]>('/owner/issues'),
      issueSummary: () => request<OwnerIssueSummary>('/owner/issues/summary'),
      reports: () => request<{ id: string; targetType: string; targetId: string; reason: string; hostelName: string; createdAt: string }[]>('/owner/reports'),
      /** Unreplied first, then newest; 20 a page. */
      reviews: (id: string, page = 1) => request<Review[]>(`/owner/hostels/${seg(id)}/reviews`, { query: { page } }),
      reply: (reviewId: string, reply: string) => request<Review>(`/owner/reviews/${seg(reviewId)}/reply`, { body: { reply } }),
      /** Changes a reply already posted; the review then shows it as edited. */
      editReply: (reviewId: string, reply: string) => request<Review>(`/owner/reviews/${seg(reviewId)}/reply`, { method: 'PUT', body: { reply } }),
      insights: (id: string, month?: string) => request<OwnerInsights>(`/owner/hostels/${seg(id)}/insights`, { query: { month } }),
      partnerInfo: (id: string) => request<OwnerPartnerInfo>(`/owner/hostels/${seg(id)}/partner`),
      brandKit: (id: string) => request<BrandKit>(`/owner/hostels/${seg(id)}/brand-kit`),
    },
    admin: {
      stats: () => request<AdminStats>('/admin/stats'),
      escalatedIssues: () => request<EscalatedIssue[]>('/admin/issues/escalated'),
      hostels: (filter: { status?: string; partnerStatus?: string; q?: string; recheck?: boolean; limit?: number; offset?: number } = {}) =>
        request<AdminHostel[]>('/admin/hostels', { query: filter }),
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
      listingChanges: (filter: { recheck?: boolean; hostelId?: string; before?: string; limit?: number } = {}) =>
        request<ListingChange[]>('/admin/listing-changes', { query: filter }),
      recheckPartner: (id: string, checklist: PartnerStandardId[], note: string) =>
        request<AdminHostel>(`/admin/hostels/${seg(id)}/partner/recheck`, { body: { checklist, note } }),
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
      ownerInvoices: (filter: { status?: string; mode?: PaymentMode; overdue?: boolean; q?: string } = {}) =>
        request<AdminOwnerInvoice[]>('/admin/owner-invoices', { query: filter }),
      ownerPlans: (filter: { plan?: OwnerPlanTier; suspended?: boolean; q?: string } = {}) =>
        request<AdminOwnerPlan[]>('/admin/owner-plans', { query: filter }),
      voidOwnerInvoice: (id: string, reason: string) => request<OwnerInvoice>(`/admin/owner-invoices/${id}/void`, { body: { reason } }),
      revenue: (month?: string) => request<PlatformRevenue>('/admin/revenue', { query: { month } }),
      paymentExceptions: (status?: PaymentExceptionStatus) =>
        request<AdminPaymentException[]>('/admin/payment-exceptions', { query: { status } }),
      markRefunded: (id: string, note: string) => request<AdminPaymentException>(`/admin/payment-exceptions/${id}/refunded`, { body: { note } }),
      payouts: (month?: string) => request<PayoutView[]>('/admin/payouts', { query: { month } }),
      generatePayouts: (month: string) => request<PayoutView[]>('/admin/payouts/generate', { body: { month } }),
      markPayoutPaid: (id: string) => request('/admin/payouts/' + id + '/paid', { method: 'POST' }),
      flaggedReviews: () => request<AdminFlaggedReview[]>('/admin/reviews/flagged'),
      hiddenReviews: () => request<AdminHiddenReview[]>('/admin/reviews/hidden'),
      hideReview: (id: string, reason: string) => request(`/admin/reviews/${seg(id)}/hide`, { body: { reason } }),
      unhideReview: (id: string) => request(`/admin/reviews/${seg(id)}/unhide`, { method: 'POST' }),
      /** Keeps a flagged review up and dismisses its flags, with the reason. */
      keepReview: (id: string, reason: string) => request<{ id: string; dismissed: number }>(`/admin/reviews/${seg(id)}/keep`, { body: { reason } }),
      reports: () => request<AdminReport[]>('/admin/reports'),
      hiddenContent: () => request<AdminHiddenContent[]>('/admin/content/hidden'),
      /** Hide (with a reason), show again, or keep (dismiss the reports, with a reason) a post or comment. */
      moderateContent: (type: 'post' | 'comment', id: string, action: 'hide' | 'unhide' | 'keep', reason?: string) =>
        request<{ hostelId: string; resolved: number }>(`/admin/content/${type}/${seg(id)}/${action}`, {
          method: 'POST',
          body: action === 'unhide' ? undefined : { reason },
        }),
      runJobs: () => request<Record<string, number>>('/admin/jobs/run', { method: 'POST' }),
      audit: (filter: { action?: AuditAction; targetId?: string; q?: string; before?: string; limit?: number } = {}) =>
        request<AuditEvent[]>('/admin/audit', { query: filter }),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * One path segment, so `../me` can't climb out of the route it was meant for. A bare `.` or `..` would still be
 * read as a dot segment, and is never a real id or slug, so it becomes `...`, which matches nothing.
 */
const seg = (value: string) => (value === '.' || value === '..' ? '...' : encodeURIComponent(value));

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
