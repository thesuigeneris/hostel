import type * as T from './types';
import type { HostelStatus, IssueStatus, Meal, OwnerPlan, PartnerStatus, ReviewStatus, SubscriptionStatus } from './enums';

/** Thrown for any non-2xx response. `code` is the API's error code (see ERROR_CODES). */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export type ApiClientOptions = {
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
};

/**
 * Typed client for every API route. Both the website and the mobile app use this,
 * so it is the API contract: the API must implement exactly these paths and shapes.
 */
export function createApiClient(baseUrl: string, opts: ApiClientOptions = {}) {
  const base = baseUrl.replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;

  async function request<R>(method: string, path: string, body?: unknown, query?: Query): Promise<R> {
    const token = await opts.getToken?.();
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await doFetch(`${base}${path}${qs(query)}`, { method, headers, body: payload, cache: 'no-store' } as RequestInit);
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiRequestError(res.status, data?.error ?? 'internal', data?.message ?? res.statusText, data?.issues);
    }
    return data as R;
  }
  const get = <R>(p: string, q?: Query) => request<R>('GET', p, undefined, q);
  const post = <R>(p: string, b?: unknown, q?: Query) => request<R>('POST', p, b ?? {}, q);
  const patch = <R>(p: string, b: unknown) => request<R>('PATCH', p, b);
  const put = <R>(p: string, b: unknown, q?: Query) => request<R>('PUT', p, b, q);
  const del = <R>(p: string) => request<R>('DELETE', p);
  const e = encodeURIComponent;
  type Ok = { ok: true };

  return {
    health: () => get<T.Health>('/health'),

    auth: {
      requestOtp: (input: T.OtpRequestInput) => post<T.OtpRequestResult>('/auth/otp', input),
      verify: (input: T.OtpVerifyInput) => post<T.AuthSession>('/auth/verify', input),
      logout: () => post<Ok>('/auth/logout'),
    },

    me: {
      get: () => get<T.User>('/me'),
      update: (input: T.UpdateMeInput) => patch<T.User>('/me', input),
    },

    // ---- public (seekers) ----
    hostels: {
      search: (query: T.HostelSearchQuery = {}) => get<T.Paginated<T.HostelSummary>>('/hostels', query as Query),
      get: (slug: string) => get<T.HostelDetail>(`/hostels/${e(slug)}`),
      menu: (slug: string, week?: string) => get<T.MenuWeek | null>(`/hostels/${e(slug)}/menu`, { week }),
      reviews: (slug: string, page?: number) => get<T.Paginated<T.Review>>(`/hostels/${e(slug)}/reviews`, { page }),
      publicIssues: (slug: string, page?: number) => get<T.Paginated<T.Issue>>(`/hostels/${e(slug)}/issues`, { page }),
      recordView: (slug: string) => post<Ok>(`/hostels/${e(slug)}/view`),
      requestVisit: (hostelId: string, input: T.VisitRequestInput) => post<T.VisitRequest>(`/hostels/${e(hostelId)}/visits`, input),
    },
    areas: () => get<T.AreaSummary[]>('/areas'),
    foodPartners: () => get<T.FoodPartner[]>('/food-partners'),

    // ---- tenant: subscription, bills, food, moves ----
    tenant: {
      visits: () => get<T.VisitRequestWithPeople[]>('/me/visits'),
      subscribe: (input: T.SubscribeInput) => post<T.SubscribeResult>('/subscriptions', input),
      stay: () => get<T.MyStay>('/me/stay'),
      invoices: () => get<T.Invoice[]>('/me/invoices'),
      menu: () => get<T.WeekMenuForTenant>('/me/menu'),
      skip: (input: T.SkipInput) => post<T.MealSkip>('/me/skips', input),
      unskip: (date: string, meal: Meal) => del<Ok>(`/me/skips/${e(date)}/${e(meal)}`),
      move: (input: T.MoveInput) => post<T.MoveRequest>('/me/moves', input),
      cancelMove: (id: string) => del<T.MoveRequest>(`/me/moves/${e(id)}`),
      cancelSubscription: () => post<T.Subscription>('/me/subscription/cancel'),
    },

    /** Works for tenant invoices (`inv_…`) and owner software invoices (`sin_…`). */
    payments: {
      checkout: (invoiceId: string) => get<T.Checkout>(`/payments/${e(invoiceId)}/checkout`),
      verify: (invoiceId: string, input: T.PaymentVerifyInput) => post<T.Checkout>(`/payments/${e(invoiceId)}/verify`, input),
      /** Stub mode only (no Razorpay keys). */
      simulate: (invoiceId: string) => post<T.Checkout>(`/payments/${e(invoiceId)}/simulate`),
    },

    // ---- residents: community, reviews, issues ----
    community: {
      mine: () => get<T.MyCommunity>('/me/residencies'),
      claim: (input: T.ClaimResidencyInput) => post<T.Residency>('/me/residencies', input),
      residents: (hostelId: string) => get<(T.PublicUser & { since: string; roomLabel: string | null })[]>(`/community/${e(hostelId)}/residents`),

      posts: (hostelId: string, page?: number) => get<T.Paginated<T.Post>>(`/community/${e(hostelId)}/posts`, { page }),
      createPost: (hostelId: string, input: T.PostInput) => post<T.Post>(`/community/${e(hostelId)}/posts`, input),
      post: (postId: string) => get<T.PostDetail>(`/posts/${e(postId)}`),
      deletePost: (postId: string) => del<Ok>(`/posts/${e(postId)}`),
      comment: (postId: string, input: T.PostCommentInput) => post<T.PostComment>(`/posts/${e(postId)}/comments`, input),
      toggleLike: (postId: string) => post<{ liked: boolean; likes: number }>(`/posts/${e(postId)}/like`),

      issues: (hostelId: string, query: T.IssueListQuery = {}) => get<T.Paginated<T.Issue>>(`/community/${e(hostelId)}/issues`, query as Query),
      reportIssue: (hostelId: string, input: T.IssueInput) => post<T.Issue>(`/community/${e(hostelId)}/issues`, input),
      issue: (issueId: string) => get<T.IssueDetail>(`/issues/${e(issueId)}`),
      commentIssue: (issueId: string, input: T.IssueCommentInput) => post<T.IssueComment>(`/issues/${e(issueId)}/comments`, input),
      setIssueStatus: (issueId: string, input: T.IssueStatusInput) => post<T.Issue>(`/issues/${e(issueId)}/status`, input),
      toggleUpvote: (issueId: string) => post<{ upvoted: boolean; upvotes: number }>(`/issues/${e(issueId)}/upvote`),

      writeReview: (hostelId: string, input: T.ReviewInput) => post<T.Review>(`/hostels/${e(hostelId)}/reviews`, input),
      editReview: (reviewId: string, input: T.ReviewInput) => patch<T.Review>(`/reviews/${e(reviewId)}`, input),
      myReviews: () => get<T.Review[]>('/me/reviews'),
    },

    upload: (file: Blob, filename = 'photo.jpg') => {
      const fd = new FormData();
      fd.append('file', file, filename);
      return post<T.UploadResult>('/uploads', fd);
    },

    // ---- owners ----
    owner: {
      dashboard: () => get<T.OwnerDashboard>('/owner/dashboard'),
      hostels: () => get<T.Hostel[]>('/owner/hostels'),
      createHostel: (input: T.HostelInput) => post<T.Hostel>('/owner/hostels', input),
      hostel: (id: string) => get<T.HostelDetail>(`/owner/hostels/${e(id)}`),
      updateHostel: (id: string, input: T.HostelUpdateInput) => patch<T.Hostel>(`/owner/hostels/${e(id)}`, input),
      submit: (id: string) => post<T.Hostel>(`/owner/hostels/${e(id)}/submit`),
      applyPartner: (id: string) => post<T.Hostel>(`/owner/hostels/${e(id)}/apply-partner`),
      changePlan: (id: string, input: T.ChangePlanInput) => post<{ hostel: T.Hostel; invoice: T.SaasInvoice | null }>(`/owner/hostels/${e(id)}/plan`, input),
      saasInvoices: () => get<T.SaasInvoice[]>('/owner/saas-invoices'),

      addRoom: (hostelId: string, input: T.RoomTypeInput) => post<T.RoomType>(`/owner/hostels/${e(hostelId)}/rooms`, input),
      updateRoom: (roomId: string, input: T.RoomTypeUpdateInput) => patch<T.RoomType>(`/owner/rooms/${e(roomId)}`, input),
      deleteRoom: (roomId: string) => del<Ok>(`/owner/rooms/${e(roomId)}`),

      addPhoto: (hostelId: string, input: T.AddPhotoInput) => post<T.HostelPhoto>(`/owner/hostels/${e(hostelId)}/photos`, input),
      deletePhoto: (photoId: string) => del<Ok>(`/owner/photos/${e(photoId)}`),
      reorderPhotos: (hostelId: string, input: T.ReorderPhotosInput) => put<T.HostelPhoto[]>(`/owner/hostels/${e(hostelId)}/photos/order`, input),

      visits: (hostelId?: string) => get<T.VisitRequestWithPeople[]>('/owner/visits', { hostelId }),
      setVisitStatus: (visitId: string, input: T.VisitStatusInput) => patch<T.VisitRequest>(`/owner/visits/${e(visitId)}`, input),

      menu: (hostelId: string, week: string) => get<T.MenuWeek | null>(`/owner/hostels/${e(hostelId)}/menu`, { week }),
      saveMenu: (hostelId: string, week: string, input: T.MenuWeekInput) => put<T.MenuWeek>(`/owner/hostels/${e(hostelId)}/menu`, input, { week }),
      copyLastWeek: (hostelId: string, week: string) => post<T.MenuWeek>(`/owner/hostels/${e(hostelId)}/menu/copy-last`, {}, { week }),
      headcount: (hostelId: string, date: string) => get<T.Headcount>(`/owner/hostels/${e(hostelId)}/headcount`, { date }),
      subscribers: (hostelId: string) => get<T.AdminSubscriptionRow[]>(`/owner/hostels/${e(hostelId)}/subscribers`),
      payouts: () => get<T.Payout[]>('/owner/payouts'),

      residents: (hostelId: string) => get<T.ResidencyWithPeople[]>(`/owner/hostels/${e(hostelId)}/residents`),
      addResident: (hostelId: string, input: T.OwnerAddResidentInput) => post<T.ResidencyWithPeople>(`/owner/hostels/${e(hostelId)}/residents`, input),
      decideResidency: (residencyId: string, input: T.ResidencyDecisionInput) => patch<T.Residency>(`/owner/residencies/${e(residencyId)}`, input),
      rentLedger: (residencyId: string) => get<T.RentPayment[]>(`/owner/residencies/${e(residencyId)}/rent`),
      recordRent: (residencyId: string, input: T.RentPaymentInput) => post<T.RentPayment>(`/owner/residencies/${e(residencyId)}/rent`, input),

      issues: (hostelId: string, query: T.IssueListQuery = {}) => get<T.Paginated<T.Issue>>(`/owner/hostels/${e(hostelId)}/issues`, query as Query),
      reviews: (hostelId: string) => get<T.Review[]>(`/owner/hostels/${e(hostelId)}/reviews`),
      replyReview: (reviewId: string, input: T.ReviewReplyInput) => post<T.Review>(`/owner/reviews/${e(reviewId)}/reply`, input),
      announce: (hostelId: string, input: T.PostInput) => post<T.Post>(`/owner/hostels/${e(hostelId)}/announcements`, input),
      togglePin: (postId: string) => post<T.Post>(`/owner/posts/${e(postId)}/pin`),
    },

    // ---- admin ----
    admin: {
      overview: () => get<T.AdminOverview>('/admin/overview'),
      hostels: (query: { status?: HostelStatus; partnerStatus?: PartnerStatus; ownerPlan?: OwnerPlan; q?: string; page?: number } = {}) =>
        get<T.Paginated<T.Hostel>>('/admin/hostels', query),
      approve: (id: string) => post<T.Hostel>(`/admin/hostels/${e(id)}/approve`),
      reject: (id: string, input: T.AdminRejectInput) => post<T.Hostel>(`/admin/hostels/${e(id)}/reject`, input),
      verifyPartner: (id: string, input: T.AdminVerifyPartnerInput) => post<T.Hostel>(`/admin/hostels/${e(id)}/verify-partner`, input),
      rejectPartner: (id: string, input: T.AdminRejectInput) => post<T.Hostel>(`/admin/hostels/${e(id)}/reject-partner`, input),

      foodPartners: () => get<T.FoodPartner[]>('/admin/food-partners'),
      createFoodPartner: (input: T.FoodPartnerInput) => post<T.FoodPartner>('/admin/food-partners', input),
      updateFoodPartner: (id: string, input: Partial<T.FoodPartnerInput>) => patch<T.FoodPartner>(`/admin/food-partners/${e(id)}`, input),

      subscriptions: (query: { status?: SubscriptionStatus; page?: number } = {}) => get<T.Paginated<T.AdminSubscriptionRow>>('/admin/subscriptions', query),
      moves: () => get<T.MoveRequest[]>('/admin/moves'),
      overdueInvoices: () => get<T.Invoice[]>('/admin/invoices/overdue'),

      payouts: (periodMonth?: string) => get<T.Payout[]>('/admin/payouts', { periodMonth }),
      generatePayouts: (input: T.GeneratePayoutsInput) => post<T.Payout[]>('/admin/payouts/generate', input),
      markPayoutPaid: (id: string) => post<T.Payout>(`/admin/payouts/${e(id)}/mark-paid`),

      reviews: (query: { status?: ReviewStatus; page?: number } = {}) => get<T.Paginated<T.Review & { hostel: { id: string; name: string; slug: string } }>>('/admin/reviews', query),
      moderateReview: (id: string, input: T.ReviewModerationInput) => patch<T.Review>(`/admin/reviews/${e(id)}`, input),
      issues: (query: { status?: IssueStatus; escalated?: boolean; page?: number } = {}) => get<T.Paginated<T.Issue & { hostel: { id: string; name: string; slug: string } }>>('/admin/issues', query),
      saasInvoices: () => get<T.SaasInvoice[]>('/admin/saas-invoices'),
      runJobs: () => post<Record<string, number>>('/admin/jobs/run'),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
