import {
  BUS_CAPACITY,
  COLOR_GROUP_CAPACITY,
  type CapacityLimits,
  type ColorGroupKey,
  type DailyVisitRecord,
  type RegistrationRecord,
  type TripSettings,
  type VisitorAnalyticsData,
} from '../types/trip';
import {
  normalizeRegistrationRecord,
  type CapacityCounts,
} from '../utils/validation';

function normalizeSettings(raw?: Partial<TripSettings> | null): TripSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    showAvailability: raw.showAvailability !== false,
    registrationClosed: Boolean(raw.registrationClosed),
  };
}

function toLimitInt(val: unknown, fallback: number): number {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.floor(num);
}

export function normalizeCapacityLimits(raw?: unknown): CapacityLimits | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const buses = (obj.buses ?? obj.busLimits) as Record<string, unknown> | undefined;
  const colors = (obj.colors ?? obj.colorLimits) as Record<string, unknown> | undefined;
  if (!buses && !colors) return undefined;

  return {
    buses: {
      bus1: toLimitInt(buses?.bus1, BUS_CAPACITY),
      bus2: toLimitInt(buses?.bus2, BUS_CAPACITY),
    },
    colors: {
      pink: toLimitInt(colors?.pink ?? colors?.red, COLOR_GROUP_CAPACITY),
      black: toLimitInt(colors?.black ?? colors?.blue, COLOR_GROUP_CAPACITY),
      yellow: toLimitInt(colors?.yellow, COLOR_GROUP_CAPACITY),
      green: toLimitInt(colors?.green, COLOR_GROUP_CAPACITY),
    },
  };
}

function normalizeAvailability(
  raw?: unknown,
  fallbackLimits?: CapacityLimits
): CapacityCounts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const buses = obj.buses as
    | Record<string, { confirmed?: number; pending?: number; remaining?: number; limit?: number; isFull?: boolean }>
    | undefined;
  const colors = obj.colors as
    | Record<string, { confirmed?: number; pending?: number; remaining?: number; limit?: number; isFull?: boolean }>
    | undefined;
  if (!buses || !colors) return undefined;

  const rawBusLimits = obj.busLimits as Record<string, unknown> | undefined;
  const rawColorLimits = obj.colorLimits as Record<string, unknown> | undefined;

  const busLimits = {
    bus1: toLimitInt(rawBusLimits?.bus1 ?? buses.bus1?.limit, fallbackLimits?.buses.bus1 ?? BUS_CAPACITY),
    bus2: toLimitInt(rawBusLimits?.bus2 ?? buses.bus2?.limit, fallbackLimits?.buses.bus2 ?? BUS_CAPACITY),
  };

  const colorLimits = {
    pink: toLimitInt(
      rawColorLimits?.pink ?? rawColorLimits?.red ?? colors.pink?.limit ?? colors.red?.limit,
      fallbackLimits?.colors.pink ?? COLOR_GROUP_CAPACITY
    ),
    black: toLimitInt(
      rawColorLimits?.black ?? rawColorLimits?.blue ?? colors.black?.limit ?? colors.blue?.limit,
      fallbackLimits?.colors.black ?? COLOR_GROUP_CAPACITY
    ),
    yellow: toLimitInt(
      rawColorLimits?.yellow ?? colors.yellow?.limit,
      fallbackLimits?.colors.yellow ?? COLOR_GROUP_CAPACITY
    ),
    green: toLimitInt(
      rawColorLimits?.green ?? colors.green?.limit,
      fallbackLimits?.colors.green ?? COLOR_GROUP_CAPACITY
    ),
  };

  const normStat = (
    stat:
      | { confirmed?: number; pending?: number; remaining?: number; limit?: number; isFull?: boolean }
      | undefined,
    cap: number
  ) => {
    const confirmed = Number(stat?.confirmed ?? 0);
    const pending = Number(stat?.pending ?? 0);
    const limit = toLimitInt(stat?.limit, cap);
    const remaining =
      typeof stat?.remaining === 'number'
        ? Math.max(0, stat.remaining)
        : Math.max(0, limit - confirmed);
    const isFull = typeof stat?.isFull === 'boolean' ? stat.isFull : confirmed >= limit;
    return { confirmed, pending, remaining, limit, isFull };
  };

  return {
    buses: {
      bus1: normStat(buses.bus1, busLimits.bus1),
      bus2: normStat(buses.bus2, busLimits.bus2),
    },
    colors: {
      pink: normStat(colors.pink ?? colors.red, colorLimits.pink),
      black: normStat(colors.black ?? colors.blue, colorLimits.black),
      yellow: normStat(colors.yellow, colorLimits.yellow),
      green: normStat(colors.green, colorLimits.green),
    },
    busLimits,
    colorLimits,
  };
}

function normalizeAnalytics(raw?: unknown): VisitorAnalyticsData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const toNonNegInt = (val: unknown) => Math.max(0, Math.floor(Number(val) || 0));

  const trackedUnique = toNonNegInt(obj.trackedUnique);
  const trackedTotal = toNonNegInt(obj.trackedTotal);
  const baselineUnique = toNonNegInt(obj.baselineUnique);
  const baselineTotal = toNonNegInt(obj.baselineTotal);
  const grandUnique =
    typeof obj.grandUnique === 'number'
      ? toNonNegInt(obj.grandUnique)
      : trackedUnique + baselineUnique;
  const grandTotal =
    typeof obj.grandTotal === 'number'
      ? toNonNegInt(obj.grandTotal)
      : trackedTotal + baselineTotal;

  const now = new Date();
  const fallbackToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayDate =
    typeof obj.todayDate === 'string' && obj.todayDate.trim() ? obj.todayDate.trim() : fallbackToday;
  const todayUnique = toNonNegInt(obj.todayUnique);
  const todayTotal = toNonNegInt(obj.todayTotal);

  const daily: DailyVisitRecord[] = Array.isArray(obj.daily)
    ? obj.daily
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          date: String(item.date ?? '').trim(),
          unique: toNonNegInt(item.unique),
          total: toNonNegInt(item.total),
        }))
        .filter((item) => item.date !== '')
    : [];

  return {
    trackedUnique,
    trackedTotal,
    baselineUnique,
    baselineTotal,
    grandUnique,
    grandTotal,
    todayDate,
    todayUnique,
    todayTotal,
    daily,
  };
}

function normalizeApiResponse<T extends SheetsApiResponse>(data: T): T {
  const normalized: T = { ...data };
  if (Array.isArray(data.registrations)) {
    normalized.registrations = data.registrations.map(normalizeRegistrationRecord);
  }
  if (data.created) {
    normalized.created = normalizeRegistrationRecord(data.created);
  }
  if (data.data?.created) {
    normalized.data = {
      ...data.data,
      created: normalizeRegistrationRecord(data.data.created),
    };
  }
  const normalizedSettings = normalizeSettings(data.settings);
  if (normalizedSettings) {
    normalized.settings = normalizedSettings;
  }
  const normalizedCapacities = normalizeCapacityLimits(data.capacities);
  if (normalizedCapacities) {
    normalized.capacities = normalizedCapacities;
  }
  const normalizedAvailability = normalizeAvailability(data.availability, normalizedCapacities);
  if (normalizedAvailability) {
    normalized.availability = normalizedAvailability;
    if (!normalized.capacities) {
      normalized.capacities = {
        buses: normalizedAvailability.busLimits,
        colors: normalizedAvailability.colorLimits,
      };
    }
  }
  const normalizedAnalytics = normalizeAnalytics(data.analytics);
  if (normalizedAnalytics) {
    normalized.analytics = normalizedAnalytics;
  }
  if (typeof data.registrationClosed === 'boolean') {
    normalized.registrationClosed = data.registrationClosed;
  }
  return normalized;
}

function toLegacyWireColor(color?: ColorGroupKey): string | undefined {
  if (!color) return color;
  if (color === 'pink') return 'red';
  if (color === 'black') return 'blue';
  return color;
}

export interface SheetsApiResponse {
  ok: boolean;
  success?: boolean;
  retryable?: boolean;
  duplicate?: boolean;
  registrationClosed?: boolean;
  error?: string;
  seqNo?: number;
  timestamp?: string;
  deletedCount?: number;
  remainingCount?: number;
  approvedCount?: number;
  skippedCount?: number;
  settings?: TripSettings;
  capacities?: CapacityLimits;
  availability?: CapacityCounts;
  stats?: Record<string, unknown>;
  analytics?: VisitorAnalyticsData;
  registrations?: RegistrationRecord[];
  created?: RegistrationRecord;
  data?: {
    seqNo?: number;
    timestamp?: string;
    created?: RegistrationRecord;
  };
}

export interface RetryableApiResult extends SheetsApiResponse {
  retriesUsed: number;
}

export type RetryStatusCallback = (attempt: number, maxRetries: number, delayMs: number) => void;

/**
 * Generates a unique, stable idempotency ID for each registration request.
 */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Fetches all registrations (and live settings) from Google Sheets via Apps Script doGet.
 * Supports action=adminData (with secret) or action=list with cache-busting query param.
 */
export async function fetchRegistrationsFromSheets(
  scriptUrl: string,
  action: 'list' | 'adminData' = 'adminData',
  secret?: string
): Promise<SheetsApiResponse> {
  const separator = scriptUrl.includes('?') ? '&' : '?';
  const secretQuery = secret ? `&secret=${encodeURIComponent(secret)}` : '';
  const cacheBust = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const url = `${scriptUrl}${separator}action=${action}${secretQuery}&_t=${cacheBust}`;

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`فشل الاتصال بقاعدة البيانات (HTTP ${response.status})`);
  }

  const data = (await response.json()) as SheetsApiResponse;
  return normalizeApiResponse({
    ...data,
    ok: Boolean(data.ok || data.success),
    success: Boolean(data.success || data.ok),
  });
}

/**
 * Lightweight real-time polling endpoint for public registration page.
 * GET ${API_URL}?action=availability&_t=${Date.now()}
 */
export async function fetchAvailabilityFromSheets(
  scriptUrl: string
): Promise<SheetsApiResponse> {
  const separator = scriptUrl.includes('?') ? '&' : '?';
  const url = `${scriptUrl}${separator}action=availability&_t=${Date.now()}`;

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`فشل تحديث حالة الإتاحة (HTTP ${response.status})`);
  }

  const data = (await response.json()) as SheetsApiResponse;
  return normalizeApiResponse({
    ...data,
    ok: Boolean(data.ok || data.success),
    success: Boolean(data.success || data.ok),
  });
}

/**
 * High-concurrency POST with Exponential Backoff + Jitter and Idempotency support.
 * Retries automatically on network errors, HTTP 429, HTTP 5xx, temporary Apps Script
 * HTML throttle pages, or explicit `{ success: false, retryable: true }` responses.
 * Stops immediately on non-retryable business validation errors (e.g. bus/color full).
 */
export async function postWithRetry(
  scriptUrl: string,
  payload: Record<string, unknown>,
  onRetryStatus?: RetryStatusCallback,
  maxRetries = 8
): Promise<RetryableApiResult> {
  let attempt = 0;

  while (true) {
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      const isTransientHttp = response.status === 429 || response.status >= 500;
      if (isTransientHttp) {
        if (attempt < maxRetries) {
          const delayMs =
            Math.min(5000, 400 * Math.pow(1.4, attempt)) + Math.random() * 600;
          attempt += 1;
          onRetryStatus?.(attempt, maxRetries, delayMs);
          await sleep(delayMs);
          continue;
        }
        return {
          ok: false,
          success: false,
          retryable: true,
          retriesUsed: attempt,
          error: `السيرفر مزدحم حالياً (HTTP ${response.status}) — يرجى المحاولة مرة أخرى.`,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          success: false,
          retriesUsed: attempt,
          error: `تعذر حفظ البيانات في Google Sheets (HTTP ${response.status})`,
        };
      }

      let rawData: SheetsApiResponse;
      try {
        rawData = (await response.json()) as SheetsApiResponse;
      } catch {
        // Apps Script occasionally returns an HTML throttle page under extreme concurrent bursts
        if (attempt < maxRetries) {
          const delayMs =
            Math.min(5000, 400 * Math.pow(1.4, attempt)) + Math.random() * 600;
          attempt += 1;
          onRetryStatus?.(attempt, maxRetries, delayMs);
          await sleep(delayMs);
          continue;
        }
        return {
          ok: false,
          success: false,
          retryable: true,
          retriesUsed: attempt,
          error: 'استجابة غير متوقعة من السيرفر أثناء الضغط العالي — يرجى المحاولة مرة أخرى.',
        };
      }

      const isSuccess = Boolean(rawData.success || rawData.ok);
      if (isSuccess) {
        return normalizeApiResponse({
          ...rawData,
          ok: true,
          success: true,
          retriesUsed: attempt,
        });
      }

      // Server explicitly signaled retryable lock/contention error
      if (rawData.retryable) {
        if (attempt < maxRetries) {
          const delayMs =
            Math.min(5000, 400 * Math.pow(1.4, attempt)) + Math.random() * 600;
          attempt += 1;
          onRetryStatus?.(attempt, maxRetries, delayMs);
          await sleep(delayMs);
          continue;
        }
        return {
          ...rawData,
          ok: false,
          success: false,
          retryable: true,
          retriesUsed: attempt,
          error:
            rawData.error ||
            'السيرفر مزدحم جداً حالياً — يرجى الضغط على تأكيد التسجيل مرة أخرى.',
        };
      }

      // Logical non-retryable validation error (e.g. "البص اتملا" / "القروب اكتمل") -> stop immediately
      return normalizeApiResponse({
        ...rawData,
        ok: false,
        success: false,
        retryable: false,
        retriesUsed: attempt,
      });
    } catch {
      // Network error / transient disconnect -> retry automatically with backoff + jitter
      if (attempt < maxRetries) {
        const delayMs =
          Math.min(5000, 400 * Math.pow(1.4, attempt)) + Math.random() * 600;
        attempt += 1;
        onRetryStatus?.(attempt, maxRetries, delayMs);
        await sleep(delayMs);
        continue;
      }

      return {
        ok: false,
        success: false,
        retryable: true,
        retriesUsed: attempt,
        error: 'تعذر الاتصال بالإنترنت بعد عدة محاولات — يرجى التحقق من الاتصال والمحاولة مجدداً.',
      };
    }
  }
}

export async function createRegistrationInSheets(
  scriptUrl: string,
  record: RegistrationRecord,
  requestId: string,
  onRetryStatus?: RetryStatusCallback,
  extra?: { isTest?: boolean; secret?: string }
): Promise<RetryableApiResult> {
  const result = await postWithRetry(
    scriptUrl,
    {
      action: 'register',
      requestId,
      isTest: Boolean(extra?.isTest ?? record.isTest),
      secret: extra?.secret ?? '',
      registration: {
        ...record,
        requestId,
        isTest: Boolean(extra?.isTest ?? record.isTest),
      },
    },
    onRetryStatus,
    8
  );

  // Seamless compatibility if the deployed Apps Script has not yet been redeployed with pink/black keys
  if (
    !result.ok &&
    typeof result.error === 'string' &&
    result.error.includes('اختيار القروب اللوني غير صحيح')
  ) {
    const legacyRecord = {
      ...record,
      colorGroup: toLegacyWireColor(record.colorGroup),
      members: record.members.map((m) => ({
        ...m,
        colorGroup: toLegacyWireColor(m.colorGroup ?? record.colorGroup),
      })),
    };
    return postWithRetry(
      scriptUrl,
      {
        action: 'register',
        requestId,
        isTest: Boolean(extra?.isTest ?? record.isTest),
        secret: extra?.secret ?? '',
        registration: {
          ...legacyRecord,
          requestId,
          isTest: Boolean(extra?.isTest ?? record.isTest),
        },
      },
      onRetryStatus,
      8
    );
  }

  return result;
}

export async function toggleMemberPaidInSheets(
  scriptUrl: string,
  regId: number,
  memberId: string
): Promise<RetryableApiResult> {
  return postWithRetry(scriptUrl, { action: 'togglePaid', regId, memberId }, undefined, 4);
}

export async function toggleMemberCancelledInSheets(
  scriptUrl: string,
  regId: number,
  memberId: string
): Promise<RetryableApiResult> {
  return postWithRetry(scriptUrl, { action: 'toggleCancelled', regId, memberId }, undefined, 4);
}

export async function approveAllInSheets(
  scriptUrl: string,
  regId: number
): Promise<RetryableApiResult> {
  return postWithRetry(scriptUrl, { action: 'approveAll', regId }, undefined, 4);
}

export async function cancelAllInSheets(
  scriptUrl: string,
  regId: number
): Promise<RetryableApiResult> {
  return postWithRetry(scriptUrl, { action: 'cancelAll', regId }, undefined, 4);
}

export async function deleteMemberInSheets(
  scriptUrl: string,
  secret: string,
  memberId: string
): Promise<RetryableApiResult> {
  return postWithRetry(
    scriptUrl,
    {
      action: 'deleteMember',
      secret,
      memberId,
    },
    undefined,
    4
  );
}

export async function deleteRegistrationInSheets(
  scriptUrl: string,
  secret: string,
  regId: number
): Promise<RetryableApiResult> {
  const result = await postWithRetry(
    scriptUrl,
    {
      action: 'deleteAll',
      secret,
      regId,
    },
    undefined,
    4
  );

  // Seamless fallback if deployed Apps Script has not yet been redeployed with deleteAll
  if (
    !result.ok &&
    typeof result.error === 'string' &&
    result.error.includes('عملية غير معروفة: deleteAll')
  ) {
    return postWithRetry(scriptUrl, { action: 'deleteReg', secret, regId }, undefined, 4);
  }

  return result;
}

export async function clearTestDataInSheets(
  scriptUrl: string,
  secret: string
): Promise<RetryableApiResult> {
  return postWithRetry(scriptUrl, { action: 'clearTestData', secret }, undefined, 5);
}

export async function approveAllTestInSheets(
  scriptUrl: string,
  secret: string
): Promise<RetryableApiResult> {
  return postWithRetry(scriptUrl, { action: 'approveAllTest', secret }, undefined, 5);
}

/**
 * Updates live registration page controls (showAvailability & registrationClosed) immediately.
 * Sends POST with text/plain;charset=utf-8 header and JSON body.
 */
export async function updateSettingsInSheets(
  scriptUrl: string,
  secret: string,
  settings: TripSettings
): Promise<RetryableApiResult> {
  return postWithRetry(
    scriptUrl,
    {
      action: 'updateSettings',
      secret,
      showAvailability: settings.showAvailability,
      registrationClosed: settings.registrationClosed,
    },
    undefined,
    4
  );
}

/**
 * Silent fire-and-forget visit tracking for public visitors (never called on admin or polling).
 * GET ${API_URL}?action=trackVisit&unique=${isUnique}&isAdmin=0&_t=${Date.now()}
 */
export function trackVisitInSheets(scriptUrl: string, isUnique: '1' | '0'): void {
  const separator = scriptUrl.includes('?') ? '&' : '?';
  const url = `${scriptUrl}${separator}action=trackVisit&unique=${isUnique}&isAdmin=0&_t=${Date.now()}`;
  fetch(url, {
    keepalive: true,
    redirect: 'follow',
    cache: 'no-store',
  }).catch(() => {});
}

/**
 * Fetches visitor analytics directly for the Admin Analytics Popup Modal.
 * GET ${API_URL}?action=analytics&secret=${ADMIN_SECRET}
 */
export async function fetchAnalyticsFromSheets(
  scriptUrl: string,
  secret: string
): Promise<SheetsApiResponse> {
  const separator = scriptUrl.includes('?') ? '&' : '?';
  const url = `${scriptUrl}${separator}action=analytics&secret=${encodeURIComponent(secret)}&_t=${Date.now()}`;

  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`تعذر جلب إحصائيات الزوار (HTTP ${response.status})`);
  }

  const data = (await response.json()) as SheetsApiResponse;
  return normalizeApiResponse({
    ...data,
    ok: Boolean(data.ok || data.success),
    success: Boolean(data.success || data.ok),
  });
}

/**
 * Updates historical baseline visits (e.g. from Cloudflare) via POST.
 * { action: "updateBaselineVisits", secret: ADMIN_SECRET, baselineUnique, baselineTotal }
 */
export async function updateBaselineVisitsInSheets(
  scriptUrl: string,
  secret: string,
  baselineUnique: number,
  baselineTotal: number
): Promise<RetryableApiResult> {
  return postWithRetry(
    scriptUrl,
    {
      action: 'updateBaselineVisits',
      secret,
      baselineUnique: Math.max(0, Math.floor(baselineUnique)),
      baselineTotal: Math.max(0, Math.floor(baselineTotal)),
    },
    undefined,
    4
  );
}

/**
 * Updates an individual member's name directly in Google Sheets from the Admin Panel.
 * { action: "updateMemberName", secret: ADMIN_SECRET, memberId, newName }
 */
export async function updateMemberNameInSheets(
  scriptUrl: string,
  secret: string,
  memberId: string,
  newName: string
): Promise<RetryableApiResult> {
  return postWithRetry(
    scriptUrl,
    {
      action: 'updateMemberName',
      secret,
      memberId,
      newName,
    },
    undefined,
    4
  );
}

/**
 * Updates dynamic bus & color group capacities in Google Sheets from the Admin Panel.
 * Sends both canonical (pink/black) and compatibility alias (red/blue) keys.
 */
export async function updateCapacitiesInSheets(
  scriptUrl: string,
  secret: string,
  limits: CapacityLimits
): Promise<RetryableApiResult> {
  return postWithRetry(
    scriptUrl,
    {
      action: 'updateCapacities',
      secret,
      buses: {
        bus1: Math.max(0, Math.floor(limits.buses.bus1)),
        bus2: Math.max(0, Math.floor(limits.buses.bus2)),
      },
      colors: {
        pink: Math.max(0, Math.floor(limits.colors.pink)),
        black: Math.max(0, Math.floor(limits.colors.black)),
        red: Math.max(0, Math.floor(limits.colors.pink)),
        blue: Math.max(0, Math.floor(limits.colors.black)),
        yellow: Math.max(0, Math.floor(limits.colors.yellow)),
        green: Math.max(0, Math.floor(limits.colors.green)),
      },
    },
    undefined,
    4
  );
}



