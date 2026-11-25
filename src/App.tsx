import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMIN_SESSION_KEY,
  ADMIN_STRESS_SECRET,
  ANALYTICS_STORAGE_KEY,
  BUS_LIST,
  CAPACITY_LIMITS_STORAGE_KEY,
  COLOR_GROUP_LIST,
  createEmptyVisitorAnalytics,
  DEFAULT_CAPACITY_LIMITS,
  DEFAULT_TRIP_SETTINGS,
  DEFAULT_WHATSAPP_NUMBERS,
  LABELS,
  SETTINGS_STORAGE_KEY,
  STORAGE_KEY,
  VISITOR_COUNTED_STORAGE_KEY,
  WHATSAPP_STORAGE_KEY,
  type CapacityLimits,
  type ColorGroupKey,
  type RecipientKey,
  type RegistrationRecord,
  type TripSettings,
  type VisitorAnalyticsData,
  type WhatsAppConfig,
} from './types/trip';
import {
  getCapacityCounts,
  getMemberBus,
  getMemberColor,
  migrateLegacyRegistrations,
  normalizeArabicText,
  normalizeRegistrationRecord,
  validateAdminMemberName,
  type CapacityCounts,
} from './utils/validation';
import {
  getActiveGoogleScriptUrl,
  isValidGoogleScriptUrl,
  saveGoogleScriptUrl,
} from './config/sheets';
import {
  approveAllInSheets,
  cancelAllInSheets,
  createRegistrationInSheets,
  deleteMemberInSheets,
  deleteRegistrationInSheets,
  fetchAnalyticsFromSheets,
  fetchAvailabilityFromSheets,
  fetchRegistrationsFromSheets,
  normalizeCapacityLimits,
  toggleMemberCancelledInSheets,
  toggleMemberPaidInSheets,
  trackVisitInSheets,
  updateBaselineVisitsInSheets,
  updateCapacitiesInSheets,
  updateMemberNameInSheets,
  updateSettingsInSheets,
  type RetryStatusCallback,
  type SheetsApiResponse,
} from './services/sheetsApi';
import { RegistrationView, type SubmitBookingResult } from './components/RegistrationView';
import { AdminAuthGate } from './components/AdminAuthGate';
import { AdminPanelView } from './components/AdminPanelView';

type ActiveView = 'public' | 'admin';

function loadInitialRegistrations(): RegistrationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return migrateLegacyRegistrations(parsed);
  } catch {
    return [];
  }
}

function loadInitialWhatsAppConfig(): WhatsAppConfig {
  try {
    const raw = localStorage.getItem(WHATSAPP_STORAGE_KEY);
    if (!raw) return DEFAULT_WHATSAPP_NUMBERS;
    const parsed = JSON.parse(raw);
    return {
      mekhail: { ...DEFAULT_WHATSAPP_NUMBERS.mekhail, ...(parsed?.mekhail ?? {}) },
      fayez: { ...DEFAULT_WHATSAPP_NUMBERS.fayez, ...(parsed?.fayez ?? {}) },
    };
  } catch {
    return DEFAULT_WHATSAPP_NUMBERS;
  }
}

function isAdminUrlPresent(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('admin') === 'true' || window.location.hash === '#admin';
}

function loadAdminSession(): RecipientKey | null {
  try {
    const val = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (val === 'mekhail' || val === 'fayez') return val;
  } catch {
    // ignore
  }
  return null;
}

function loadInitialTripSettings(): TripSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_TRIP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TripSettings>;
    return {
      showAvailability: parsed.showAvailability !== false,
      registrationClosed: Boolean(parsed.registrationClosed),
    };
  } catch {
    return DEFAULT_TRIP_SETTINGS;
  }
}

function loadInitialVisitorAnalytics(): VisitorAnalyticsData {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return createEmptyVisitorAnalytics();
    const parsed = JSON.parse(raw) as Partial<VisitorAnalyticsData>;
    const base = createEmptyVisitorAnalytics(parsed.todayDate);
    return {
      ...base,
      ...parsed,
      daily: Array.isArray(parsed.daily) ? parsed.daily : [],
    };
  } catch {
    return createEmptyVisitorAnalytics();
  }
}

function loadInitialCapacityLimits(): CapacityLimits {
  try {
    const raw = localStorage.getItem(CAPACITY_LIMITS_STORAGE_KEY);
    if (!raw) return DEFAULT_CAPACITY_LIMITS;
    const parsed = JSON.parse(raw);
    return normalizeCapacityLimits(parsed) ?? DEFAULT_CAPACITY_LIMITS;
  } catch {
    return DEFAULT_CAPACITY_LIMITS;
  }
}

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>(() =>
    isAdminUrlPresent() ? 'admin' : 'public'
  );
  const [authenticatedOrganizer, setAuthenticatedOrganizer] = useState<RecipientKey | null>(
    loadAdminSession
  );
  const [registrations, setRegistrations] = useState<RegistrationRecord[]>(loadInitialRegistrations);
  const [tripSettings, setTripSettings] = useState<TripSettings>(loadInitialTripSettings);
  const [capacityLimits, setCapacityLimits] = useState<CapacityLimits>(loadInitialCapacityLimits);
  const [visitorAnalytics, setVisitorAnalytics] = useState<VisitorAnalyticsData>(
    loadInitialVisitorAnalytics
  );
  const [isRefreshingAnalytics, setIsRefreshingAnalytics] = useState(false);
  const [liveAvailability, setLiveAvailability] = useState<CapacityCounts | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSavedPulse, setSettingsSavedPulse] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [whatsappNumbers, setWhatsAppNumbers] = useState<WhatsAppConfig>(loadInitialWhatsAppConfig);
  const [googleScriptUrl, setGoogleScriptUrl] = useState<string>(getActiveGoogleScriptUrl);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [pendingSavesCount, setPendingSavesCount] = useState(0);
  const [cloudNotice, setCloudNotice] = useState<string>('');

  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutationSeqRef = useRef<number>(0);
  const fetchSeqRef = useRef<number>(0);
  const pendingSavesRef = useRef<number>(0);
  const stressTestBusyRef = useRef<boolean>(false);
  const silentSyncInFlightRef = useRef<boolean>(false);
  const remoteMutationLockUntilRef = useRef<number>(0);
  const lastRegistrationsJsonRef = useRef<string>('');
  const registrationsSourceRef = useRef<'init' | 'local' | 'cloud' | 'remote'>('init');
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  const settingsSeqRef = useRef<number>(0);
  const isSavingSettingsRef = useRef<boolean>(false);
  const settingsLockUntilRef = useRef<number>(0);
  const settingsSavedTimerRef = useRef<number | null>(null);
  const capacitiesSeqRef = useRef<number>(0);
  const isSavingCapacitiesRef = useRef<boolean>(false);
  const capacitiesLockUntilRef = useRef<number>(0);
  const isPublicSubmittingRef = useRef<boolean>(false);
  const isAvailabilityPollingRef = useRef<boolean>(false);
  const visitTrackedRef = useRef<boolean>(false);

  const isCloudConnected = isValidGoogleScriptUrl(googleScriptUrl);

  const postSyncMessage = useCallback((payload: Record<string, unknown>) => {
    try {
      syncChannelRef.current?.postMessage(payload);
    } catch {
      // ignore BroadcastChannel errors
    }
  }, []);

  const persistAndApplyTripSettings = useCallback(
    (next: TripSettings, broadcast = true) => {
      const normalized: TripSettings = {
        showAvailability: next.showAvailability !== false,
        registrationClosed: Boolean(next.registrationClosed),
      };
      setTripSettings((prev) => {
        if (
          prev.showAvailability === normalized.showAvailability &&
          prev.registrationClosed === normalized.registrationClosed
        ) {
          return prev;
        }
        return normalized;
      });
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore storage errors
      }
      if (broadcast) {
        postSyncMessage({
          type: 'SETTINGS_UPDATED',
          settings: normalized,
          ts: Date.now(),
        });
      }
    },
    [postSyncMessage]
  );

  const persistAndApplyCapacityLimits = useCallback(
    (next: CapacityLimits, broadcast = true) => {
      const normalized = normalizeCapacityLimits(next) ?? DEFAULT_CAPACITY_LIMITS;
      setCapacityLimits((prev) => {
        if (
          prev.buses.bus1 === normalized.buses.bus1 &&
          prev.buses.bus2 === normalized.buses.bus2 &&
          prev.colors.pink === normalized.colors.pink &&
          prev.colors.black === normalized.colors.black &&
          prev.colors.yellow === normalized.colors.yellow &&
          prev.colors.green === normalized.colors.green
        ) {
          return prev;
        }
        return normalized;
      });
      try {
        localStorage.setItem(CAPACITY_LIMITS_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // ignore storage errors
      }
      if (broadcast) {
        postSyncMessage({
          type: 'CAPACITIES_UPDATED',
          capacities: normalized,
          ts: Date.now(),
        });
      }
    },
    [postSyncMessage]
  );

  const applyRegistrationsIfChanged = useCallback(
    (next: RegistrationRecord[], source: 'local' | 'cloud' | 'remote') => {
      const normalizedNext = next.map(normalizeRegistrationRecord);
      const serialized = JSON.stringify(normalizedNext);
      if (serialized === lastRegistrationsJsonRef.current) {
        if (source === 'local') {
          postSyncMessage({
            type: 'REGISTRATIONS_UPDATED',
            registrations: normalizedNext,
            confirmed: true,
            ts: Date.now(),
          });
        }
        return;
      }
      registrationsSourceRef.current = source;
      lastRegistrationsJsonRef.current = serialized;
      setRegistrations(normalizedNext);
    },
    [postSyncMessage]
  );

  const commitLocalRegistrations = useCallback(
    (updater: (prev: RegistrationRecord[]) => RegistrationRecord[]) => {
      registrationsSourceRef.current = 'local';
      setRegistrations(updater);
    },
    []
  );

  const syncFromSheets = useCallback(
    async (
      urlOverride?: string,
      silent = false,
      action: 'adminData' | 'list' = 'adminData'
    ): Promise<string | null> => {
      const targetUrl = (urlOverride ?? googleScriptUrl).trim();
      if (!isValidGoogleScriptUrl(targetUrl)) return null;

      if (silent) {
        if (
          silentSyncInFlightRef.current ||
          pendingSavesRef.current > 0 ||
          stressTestBusyRef.current ||
          Date.now() < remoteMutationLockUntilRef.current
        ) {
          return null;
        }
        silentSyncInFlightRef.current = true;
      } else {
        setIsSyncingSheets(true);
      }

      const startMutationSeq = mutationSeqRef.current;
      const startSettingsSeq = settingsSeqRef.current;
      const startCapacitiesSeq = capacitiesSeqRef.current;
      const myFetchSeq = ++fetchSeqRef.current;

      try {
        const res = await fetchRegistrationsFromSheets(
          targetUrl,
          action,
          action === 'adminData' ? ADMIN_STRESS_SECRET : undefined
        );
        if (!res.ok) {
          return res.error || 'تعذر قراءة البيانات من Google Sheets.';
        }
        if (
          res.settings &&
          !isSavingSettingsRef.current &&
          startSettingsSeq === settingsSeqRef.current &&
          Date.now() >= settingsLockUntilRef.current
        ) {
          persistAndApplyTripSettings(res.settings, true);
        }
        const incomingLimits =
          res.capacities ??
          (res.availability
            ? {
                buses: res.availability.busLimits,
                colors: res.availability.colorLimits,
              }
            : undefined);
        if (
          incomingLimits &&
          !isSavingCapacitiesRef.current &&
          startCapacitiesSeq === capacitiesSeqRef.current &&
          Date.now() >= capacitiesLockUntilRef.current
        ) {
          persistAndApplyCapacityLimits(incomingLimits, true);
        }
        if (res.availability) {
          setLiveAvailability(res.availability);
        }
        if (res.analytics) {
          setVisitorAnalytics(res.analytics);
          try {
            localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(res.analytics));
          } catch {
            // ignore storage errors
          }
        }
        if (Array.isArray(res.registrations)) {
          const stillLatestFetch = myFetchSeq === fetchSeqRef.current;
          const noNewLocalMutation = startMutationSeq === mutationSeqRef.current;
          const noInFlightWrites =
            pendingSavesRef.current === 0 &&
            !stressTestBusyRef.current &&
            (!silent || Date.now() >= remoteMutationLockUntilRef.current);

          if (stillLatestFetch && noNewLocalMutation && noInFlightWrites) {
            applyRegistrationsIfChanged(res.registrations, 'cloud');
          }
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'تعذر الاتصال بـ Google Sheets.';
      } finally {
        if (silent) {
          silentSyncInFlightRef.current = false;
        } else {
          setIsSyncingSheets(false);
        }
      }
    },
    [
      googleScriptUrl,
      applyRegistrationsIfChanged,
      persistAndApplyTripSettings,
      persistAndApplyCapacityLimits,
    ]
  );

  const pollPublicAvailability = useCallback(async () => {
    const targetUrl = googleScriptUrl.trim();
    if (!isValidGoogleScriptUrl(targetUrl)) return;
    if (document.visibilityState !== 'visible') return;
    if (isPublicSubmittingRef.current) return;
    if (isAvailabilityPollingRef.current) return;

    isAvailabilityPollingRef.current = true;
    const startSettingsSeq = settingsSeqRef.current;
    const startCapacitiesSeq = capacitiesSeqRef.current;

    try {
      const res = await fetchAvailabilityFromSheets(targetUrl);
      if (!res.ok) return;

      if (
        res.settings &&
        !isSavingSettingsRef.current &&
        startSettingsSeq === settingsSeqRef.current &&
        Date.now() >= settingsLockUntilRef.current
      ) {
        persistAndApplyTripSettings(res.settings, false);
      }

      const incomingLimits =
        res.capacities ??
        (res.availability
          ? {
              buses: res.availability.busLimits,
              colors: res.availability.colorLimits,
            }
          : undefined);
      if (
        incomingLimits &&
        !isSavingCapacitiesRef.current &&
        startCapacitiesSeq === capacitiesSeqRef.current &&
        Date.now() >= capacitiesLockUntilRef.current
      ) {
        persistAndApplyCapacityLimits(incomingLimits, false);
      }

      if (res.availability) {
        setLiveAvailability(res.availability);
      } else if (Array.isArray(res.registrations)) {
        // Backward compatibility if older Apps Script returns full registrations
        applyRegistrationsIfChanged(res.registrations, 'cloud');
        setLiveAvailability(null);
      }
    } catch {
      // Silent background poll — do not disturb visitor while typing
    } finally {
      isAvailabilityPollingRef.current = false;
    }
  }, [
    googleScriptUrl,
    persistAndApplyTripSettings,
    persistAndApplyCapacityLimits,
    applyRegistrationsIfChanged,
  ]);

  /**
   * Queues a Google Sheets write strictly in order behind an instant optimistic UI update.
   * Keeps the UI 0ms responsive while guaranteeing sequential consistency with Google Sheets
   * and instant cross-tab / cross-device synchronization.
   */
  const enqueueCloudMutation = useCallback(
    (task: () => Promise<SheetsApiResponse>, fallbackError: string) => {
      const mySeq = ++mutationSeqRef.current;
      pendingSavesRef.current += 1;
      setPendingSavesCount((c) => c + 1);
      postSyncMessage({ type: 'MUTATION_IN_FLIGHT', ts: Date.now() });

      mutationQueueRef.current = mutationQueueRef.current
        .then(async () => {
          try {
            const res = await task();
            if (!res.ok) {
              const rawErr = res.error || fallbackError;
              const friendlyErr = rawErr.includes('عملية غير معروفة: delete')
                ? 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل الحذف النهائي من الشيت.'
                : rawErr;
              setCloudNotice(friendlyErr);
              if (Array.isArray(res.registrations)) {
                applyRegistrationsIfChanged(res.registrations, 'local');
              } else {
                void syncFromSheets();
              }
              return;
            }

            if (mySeq === mutationSeqRef.current && Array.isArray(res.registrations)) {
              applyRegistrationsIfChanged(res.registrations, 'local');
            }
          } catch (err) {
            setCloudNotice(
              err instanceof Error ? err.message : 'تعذر الاتصال بـ Google Sheets لحفظ التغيير.'
            );
            void syncFromSheets();
          } finally {
            pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
            setPendingSavesCount((c) => Math.max(0, c - 1));
            if (pendingSavesRef.current === 0) {
              postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
            }
          }
        })
        .catch(() => {
          pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
          setPendingSavesCount((c) => Math.max(0, c - 1));
          if (pendingSavesRef.current === 0) {
            postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
          }
        });
    },
    [syncFromSheets, applyRegistrationsIfChanged, postSyncMessage]
  );

  // Silent One-Time Public Visitor Tracking (runs strictly once on initial page open, NEVER on ?admin=true or inside 3s polling)
  useEffect(() => {
    if (visitTrackedRef.current) return;
    visitTrackedRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') || window.location.hash === '#admin') {
      return;
    }

    let isUnique: '1' | '0' = '0';
    try {
      if (!localStorage.getItem(VISITOR_COUNTED_STORAGE_KEY)) {
        isUnique = '1';
        localStorage.setItem(VISITOR_COUNTED_STORAGE_KEY, '1');
      }
    } catch {
      isUnique = '1';
    }

    const targetUrl = getActiveGoogleScriptUrl().trim();
    if (isValidGoogleScriptUrl(targetUrl)) {
      trackVisitInSheets(targetUrl, isUnique);
    } else {
      // Local-only fallback when Google Sheets URL is not connected
      setVisitorAnalytics((prev) => {
        const now = new Date();
        const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const incUnique = isUnique === '1' ? 1 : 0;
        const existingIdx = prev.daily.findIndex((d) => d.date === todayDate);
        const nextDaily = [...prev.daily];
        if (existingIdx >= 0) {
          nextDaily[existingIdx] = {
            ...nextDaily[existingIdx],
            unique: nextDaily[existingIdx].unique + incUnique,
            total: nextDaily[existingIdx].total + 1,
          };
        } else {
          nextDaily.unshift({ date: todayDate, unique: incUnique, total: 1 });
        }
        const todayRow = nextDaily.find((d) => d.date === todayDate);
        const nextTrackedUnique = prev.trackedUnique + incUnique;
        const nextTrackedTotal = prev.trackedTotal + 1;
        const nextAnalytics: VisitorAnalyticsData = {
          ...prev,
          trackedUnique: nextTrackedUnique,
          trackedTotal: nextTrackedTotal,
          grandUnique: nextTrackedUnique + prev.baselineUnique,
          grandTotal: nextTrackedTotal + prev.baselineTotal,
          todayDate,
          todayUnique: todayRow?.unique ?? incUnique,
          todayTotal: todayRow?.total ?? 1,
          daily: nextDaily,
        };
        try {
          localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(nextAnalytics));
        } catch {
          // ignore
        }
        return nextAnalytics;
      });
    }
  }, []);

  // Real-Time Live Sync:
  // - Public Registration Page: lightweight GET ?action=availability&_t=... every 3000ms
  //   (paused when tab hidden or while submitting, guarded against overlap by isAvailabilityPollingRef)
  // - Admin Panel: GET ?action=adminData&secret=... every 2.5s (reads registrations + settings)
  useEffect(() => {
    if (!isCloudConnected) return;

    if (activeView === 'public') {
      // Initial sync on open: fetch live availability/settings immediately + initial registrations for duplicate check
      void pollPublicAvailability();
      void syncFromSheets(undefined, true, 'list');

      const intervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible' && !isPublicSubmittingRef.current) {
          void pollPublicAvailability();
        }
      }, 3000);

      const handleResumePublic = () => {
        if (document.visibilityState === 'visible' && !isPublicSubmittingRef.current) {
          void pollPublicAvailability();
        }
      };

      window.addEventListener('focus', handleResumePublic);
      window.addEventListener('online', handleResumePublic);
      document.addEventListener('visibilitychange', handleResumePublic);

      return () => {
        window.clearInterval(intervalId);
        window.removeEventListener('focus', handleResumePublic);
        window.removeEventListener('online', handleResumePublic);
        document.removeEventListener('visibilitychange', handleResumePublic);
      };
    }

    // Admin View Polling
    let cancelled = false;
    let timerId: number | null = null;

    const scheduleNext = () => {
      if (cancelled) return;
      timerId = window.setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === 'visible') {
          await syncFromSheets(undefined, true, 'adminData');
        }
        scheduleNext();
      }, 2500);
    };

    void syncFromSheets(undefined, false, 'adminData').finally(() => {
      scheduleNext();
    });

    const handleResumeAdmin = () => {
      if (document.visibilityState === 'visible') {
        void syncFromSheets(undefined, true, 'adminData');
      }
    };

    window.addEventListener('focus', handleResumeAdmin);
    window.addEventListener('online', handleResumeAdmin);
    document.addEventListener('visibilitychange', handleResumeAdmin);

    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
      window.removeEventListener('focus', handleResumeAdmin);
      window.removeEventListener('online', handleResumeAdmin);
      document.removeEventListener('visibilitychange', handleResumeAdmin);
    };
  }, [activeView, isCloudConnected, pollPublicAvailability, syncFromSheets]);

  // Instant Cross-Tab Live Sync (BroadcastChannel + localStorage event)
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('trip_registrations_live_sync_v1');
        syncChannelRef.current = channel;
        channel.onmessage = (event) => {
          const data = event.data;
          if (!data) return;

          if (data.type === 'MUTATION_IN_FLIGHT') {
            // Pause this tab's silent poll briefly while the sibling tab writes to Sheets
            remoteMutationLockUntilRef.current = Date.now() + 8000;
            return;
          }

          if (data.type === 'MUTATION_IDLE') {
            remoteMutationLockUntilRef.current = 0;
            return;
          }

          if (data.type === 'SETTINGS_UPDATED' && data.settings) {
            if (!isSavingSettingsRef.current) {
              persistAndApplyTripSettings(data.settings as TripSettings, false);
            }
            return;
          }

          if (data.type === 'CAPACITIES_UPDATED' && data.capacities) {
            if (!isSavingCapacitiesRef.current) {
              persistAndApplyCapacityLimits(data.capacities as CapacityLimits, false);
              setLiveAvailability(null);
            }
            return;
          }

          if (data.type === 'REGISTRATIONS_UPDATED' && Array.isArray(data.registrations)) {
            if (data.confirmed) {
              remoteMutationLockUntilRef.current = 0;
            }
            if (pendingSavesRef.current === 0 && !stressTestBusyRef.current) {
              applyRegistrationsIfChanged(data.registrations, 'remote');
              setLiveAvailability(null);
            }
          }
        };
      } catch {
        channel = null;
      }
    }

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === SETTINGS_STORAGE_KEY && e.newValue && !isSavingSettingsRef.current) {
        try {
          const parsed = JSON.parse(e.newValue) as Partial<TripSettings>;
          persistAndApplyTripSettings(
            {
              showAvailability: parsed.showAvailability !== false,
              registrationClosed: Boolean(parsed.registrationClosed),
            },
            false
          );
        } catch {
          // ignore invalid JSON
        }
        return;
      }

      if (e.key === CAPACITY_LIMITS_STORAGE_KEY && e.newValue && !isSavingCapacitiesRef.current) {
        try {
          const parsed = normalizeCapacityLimits(JSON.parse(e.newValue));
          if (parsed) {
            persistAndApplyCapacityLimits(parsed, false);
            setLiveAvailability(null);
          }
        } catch {
          // ignore invalid JSON
        }
        return;
      }

      if (
        e.key === STORAGE_KEY &&
        e.newValue &&
        pendingSavesRef.current === 0 &&
        !stressTestBusyRef.current
      ) {
        try {
          const parsed = migrateLegacyRegistrations(JSON.parse(e.newValue));
          applyRegistrationsIfChanged(parsed, 'remote');
          setLiveAvailability(null);
        } catch {
          // ignore invalid JSON
        }
      }
    };

    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener('storage', handleStorageEvent);
      syncChannelRef.current = null;
      channel?.close();
    };
  }, [applyRegistrationsIfChanged, persistAndApplyTripSettings, persistAndApplyCapacityLimits]);

  useEffect(() => {
    const handleLocationChange = () => {
      if (isAdminUrlPresent()) {
        setActiveView('admin');
      } else {
        setActiveView('public');
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    const source = registrationsSourceRef.current;
    registrationsSourceRef.current = 'init';

    try {
      const serialized = JSON.stringify(registrations);
      lastRegistrationsJsonRef.current = serialized;
      if (source !== 'remote') {
        localStorage.setItem(STORAGE_KEY, serialized);
        if (source === 'local' || source === 'cloud') {
          postSyncMessage({
            type: 'REGISTRATIONS_UPDATED',
            registrations,
            confirmed: pendingSavesRef.current === 0,
            ts: Date.now(),
          });
        }
      }
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [registrations, postSyncMessage]);

  useEffect(() => {
    try {
      localStorage.setItem(WHATSAPP_STORAGE_KEY, JSON.stringify(whatsappNumbers));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [whatsappNumbers]);

  const computedCapacities = useMemo(
    () => getCapacityCounts(registrations, capacityLimits),
    [registrations, capacityLimits]
  );
  const capacities = activeView === 'public' && liveAvailability ? liveAvailability : computedCapacities;

  const handleUpdateTripSettings = useCallback(
    async (nextSettings: TripSettings) => {
      const previousSettings = tripSettings;
      const mySeq = ++settingsSeqRef.current;
      isSavingSettingsRef.current = true;
      settingsLockUntilRef.current = Date.now() + 5000;
      setIsSavingSettings(true);
      setSettingsSaveError('');
      setSettingsSavedPulse(false);
      if (settingsSavedTimerRef.current !== null) {
        window.clearTimeout(settingsSavedTimerRef.current);
      }

      // Instant optimistic update + cross-tab broadcast
      persistAndApplyTripSettings(nextSettings, true);

      if (!isCloudConnected) {
        isSavingSettingsRef.current = false;
        setIsSavingSettings(false);
        setSettingsSavedPulse(true);
        settingsSavedTimerRef.current = window.setTimeout(() => setSettingsSavedPulse(false), 2200);
        return;
      }

      try {
        const res = await updateSettingsInSheets(
          googleScriptUrl,
          ADMIN_STRESS_SECRET,
          nextSettings
        );
        if (!res.ok) {
          const rawErr = res.error || 'تعذر حفظ إعدادات صفحة التسجيل في Google Sheets.';
          const friendlyErr = rawErr.includes('عملية غير معروفة: updateSettings')
            ? 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل مزامنة المفاتيح اللحظية عبر الأجهزة.'
            : rawErr;
          setSettingsSaveError(friendlyErr);
          if (mySeq === settingsSeqRef.current) {
            persistAndApplyTripSettings(previousSettings, true);
          }
          return;
        }

        if (mySeq === settingsSeqRef.current) {
          if (res.settings) {
            persistAndApplyTripSettings(res.settings, true);
          }
          setSettingsSavedPulse(true);
          settingsSavedTimerRef.current = window.setTimeout(
            () => setSettingsSavedPulse(false),
            2200
          );
        }
      } catch (err) {
        setSettingsSaveError(
          err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لحفظ الإعدادات.'
        );
        if (mySeq === settingsSeqRef.current) {
          persistAndApplyTripSettings(previousSettings, true);
        }
      } finally {
        if (mySeq === settingsSeqRef.current) {
          isSavingSettingsRef.current = false;
          setIsSavingSettings(false);
        }
      }
    },
    [tripSettings, isCloudConnected, googleScriptUrl, persistAndApplyTripSettings]
  );

  const handleToggleShowAvailability = useCallback(() => {
    void handleUpdateTripSettings({
      ...tripSettings,
      showAvailability: !tripSettings.showAvailability,
    });
  }, [tripSettings, handleUpdateTripSettings]);

  const handleToggleRegistrationClosed = useCallback(() => {
    void handleUpdateTripSettings({
      ...tripSettings,
      registrationClosed: !tripSettings.registrationClosed,
    });
  }, [tripSettings, handleUpdateTripSettings]);

  const handlePublicSubmittingChange = useCallback((submitting: boolean) => {
    isPublicSubmittingRef.current = submitting;
  }, []);

  const handleRegistrationClosedDetected = useCallback(() => {
    persistAndApplyTripSettings(
      {
        ...tripSettings,
        registrationClosed: true,
      },
      true
    );
  }, [tripSettings, persistAndApplyTripSettings]);

  const handleRefreshAnalytics = useCallback(async (): Promise<string | null> => {
    const targetUrl = googleScriptUrl.trim();
    if (!isValidGoogleScriptUrl(targetUrl)) {
      return null;
    }

    setIsRefreshingAnalytics(true);
    try {
      const res = await fetchAnalyticsFromSheets(targetUrl, ADMIN_STRESS_SECRET);
      if (!res.ok) {
        return res.error || 'تعذر تحديث إحصائيات الزوار من السيرفر.';
      }
      if (res.analytics) {
        setVisitorAnalytics(res.analytics);
        try {
          localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(res.analytics));
        } catch {
          // ignore
        }
        return null;
      }
      return 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل إحصائيات الزوار.';
    } catch (err) {
      return err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لتحديث الإحصائيات.';
    } finally {
      setIsRefreshingAnalytics(false);
    }
  }, [googleScriptUrl]);

  const handleUpdateBaselineVisits = useCallback(
    async (baselineUnique: number, baselineTotal: number): Promise<string | null> => {
      const cleanUnique = Math.max(0, Math.floor(baselineUnique));
      const cleanTotal = Math.max(0, Math.floor(baselineTotal));

      if (!isCloudConnected) {
        setVisitorAnalytics((prev) => {
          const updated: VisitorAnalyticsData = {
            ...prev,
            baselineUnique: cleanUnique,
            baselineTotal: cleanTotal,
            grandUnique: prev.trackedUnique + cleanUnique,
            grandTotal: prev.trackedTotal + cleanTotal,
          };
          try {
            localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(updated));
          } catch {
            // ignore
          }
          return updated;
        });
        return null;
      }

      try {
        const res = await updateBaselineVisitsInSheets(
          googleScriptUrl,
          ADMIN_STRESS_SECRET,
          cleanUnique,
          cleanTotal
        );
        if (!res.ok) {
          const rawErr = res.error || 'تعذر حفظ رصيد الزيارات السابقة.';
          if (rawErr.includes('عملية غير معروفة: updateBaselineVisits')) {
            return 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل حفظ رصيد الزيارات السابقة.';
          }
          return rawErr;
        }
        if (res.analytics) {
          setVisitorAnalytics(res.analytics);
          try {
            localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(res.analytics));
          } catch {
            // ignore
          }
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لحفظ الرصيد السابق.';
      }
    },
    [isCloudConnected, googleScriptUrl]
  );

  const handleUpdateMemberName = useCallback(
    async (regId: number, memberId: string, newName: string): Promise<string | null> => {
      const trimmed = newName.trim().replace(/\s+/g, ' ');
      const check = validateAdminMemberName(trimmed);
      if (!check.valid) return check.message;

      if (!isCloudConnected) {
        const targetKey = normalizeArabicText(trimmed);
        const duplicateExists = registrations.some((reg) =>
          reg.members.some(
            (m) =>
              m.id !== memberId &&
              !m.cancelled &&
              normalizeArabicText(m.name) === targetKey
          )
        );
        if (duplicateExists) {
          return `الاسم الجديد مسجل بالفعل لشخص آخر: ${trimmed}`;
        }

        commitLocalRegistrations((prev) =>
          prev.map((reg) =>
            reg.id !== regId
              ? reg
              : {
                  ...reg,
                  members: reg.members.map((m) =>
                    m.id === memberId ? { ...m, name: trimmed } : m
                  ),
                }
          )
        );
        return null;
      }

      mutationSeqRef.current += 1;
      remoteMutationLockUntilRef.current = Date.now() + 8000;
      postSyncMessage({ type: 'MUTATION_IN_FLIGHT', ts: Date.now() });

      try {
        const res = await updateMemberNameInSheets(
          googleScriptUrl,
          ADMIN_STRESS_SECRET,
          memberId,
          trimmed
        );
        if (!res.ok) {
          const rawErr = res.error || 'تعذر تعديل الاسم في قاعدة البيانات.';
          if (rawErr.includes('عملية غير معروفة: updateMemberName')) {
            return 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل تعديل الأسماء.';
          }
          return rawErr;
        }

        if (Array.isArray(res.registrations)) {
          applyRegistrationsIfChanged(res.registrations, 'local');
        } else {
          commitLocalRegistrations((prev) =>
            prev.map((reg) =>
              reg.id !== regId
                ? reg
                : {
                    ...reg,
                    members: reg.members.map((m) =>
                      m.id === memberId ? { ...m, name: trimmed } : m
                    ),
                  }
            )
          );
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لتعديل الاسم.';
      } finally {
        remoteMutationLockUntilRef.current = 0;
        postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
      }
    },
    [
      isCloudConnected,
      registrations,
      googleScriptUrl,
      commitLocalRegistrations,
      applyRegistrationsIfChanged,
      postSyncMessage,
    ]
  );

  const handleSaveCapacities = useCallback(
    async (nextLimits: CapacityLimits): Promise<string | null> => {
      const cleanLimits: CapacityLimits = {
        buses: {
          bus1: Math.max(0, Math.floor(Number(nextLimits.buses.bus1) || 0)),
          bus2: Math.max(0, Math.floor(Number(nextLimits.buses.bus2) || 0)),
        },
        colors: {
          pink: Math.max(0, Math.floor(Number(nextLimits.colors.pink) || 0)),
          black: Math.max(0, Math.floor(Number(nextLimits.colors.black) || 0)),
          yellow: Math.max(0, Math.floor(Number(nextLimits.colors.yellow) || 0)),
          green: Math.max(0, Math.floor(Number(nextLimits.colors.green) || 0)),
        },
      };

      if (!isCloudConnected) {
        for (const b of BUS_LIST) {
          const confirmed = computedCapacities.buses[b.key].confirmed;
          if (cleanLimits.buses[b.key] < confirmed) {
            return `لا يمكن تقليل سعة ${b.label} إلى ${cleanLimits.buses[b.key]} لأن عدد المؤكد دفعهم حالياً هو ${confirmed} فرد.`;
          }
        }
        for (const c of COLOR_GROUP_LIST) {
          const confirmed = computedCapacities.colors[c.key].confirmed;
          if (cleanLimits.colors[c.key] < confirmed) {
            return `لا يمكن تقليل سعة قروب ${LABELS.colors[c.key]} إلى ${cleanLimits.colors[c.key]} لأن عدد المؤكد دفعهم حالياً هو ${confirmed} فرد.`;
          }
        }
        persistAndApplyCapacityLimits(cleanLimits, true);
        setLiveAvailability(null);
        return null;
      }

      const mySeq = ++capacitiesSeqRef.current;
      isSavingCapacitiesRef.current = true;
      capacitiesLockUntilRef.current = Date.now() + 6000;

      try {
        const res = await updateCapacitiesInSheets(
          googleScriptUrl,
          ADMIN_STRESS_SECRET,
          cleanLimits
        );
        if (!res.ok) {
          const rawErr = res.error || 'تعذر حفظ السعات الجديدة في قاعدة البيانات.';
          if (rawErr.includes('عملية غير معروفة: updateCapacities')) {
            return 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل التحكم في السعات.';
          }
          return rawErr;
        }

        if (mySeq === capacitiesSeqRef.current) {
          const savedLimits = res.capacities ?? cleanLimits;
          persistAndApplyCapacityLimits(savedLimits, true);
          if (res.availability) {
            setLiveAvailability(res.availability);
          } else {
            setLiveAvailability(null);
          }
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لحفظ السعات الجديدة.';
      } finally {
        if (mySeq === capacitiesSeqRef.current) {
          isSavingCapacitiesRef.current = false;
        }
      }
    },
    [isCloudConnected, computedCapacities, googleScriptUrl, persistAndApplyCapacityLimits]
  );

  const clearAdminUrlParams = () => {
    try {
      if (isAdminUrlPresent()) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      // ignore
    }
  };

  const goToPublic = (scrollToForm = false) => {
    clearAdminUrlParams();
    setActiveView('public');
    if (scrollToForm) {
      setTimeout(() => {
        document
          .getElementById('registration-form')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOrganizerLogin = (organizer: RecipientKey) => {
    setAuthenticatedOrganizer(organizer);
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, organizer);
    } catch {
      // ignore
    }
    if (isCloudConnected) {
      void syncFromSheets();
    }
  };

  const handleOrganizerLogout = () => {
    setAuthenticatedOrganizer(null);
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // ignore
    }
    goToPublic(false);
  };

  const handleUpdateGoogleScriptUrl = async (nextUrl: string): Promise<string | null> => {
    const clean = nextUrl.trim();
    if (!clean) {
      saveGoogleScriptUrl('');
      setGoogleScriptUrl('');
      return null;
    }

    if (!isValidGoogleScriptUrl(clean)) {
      return 'الرابط غير صحيح — يجب أن يبدأ بـ https://script.google.com/macros/s/ وينتهي بـ /exec';
    }

    const err = await syncFromSheets(clean);
    if (err) return err;

    saveGoogleScriptUrl(clean);
    setGoogleScriptUrl(clean);
    return null;
  };

  const handleAddRegistration = async (
    record: RegistrationRecord,
    requestId: string,
    onRetryStatus?: RetryStatusCallback
  ): Promise<SubmitBookingResult> => {
    if (tripSettings.registrationClosed) {
      return {
        ok: false,
        registrationClosed: true,
        error: 'التسجيل انتهى !! منتظرينكم في الرحلة',
      };
    }

    if (isCloudConnected) {
      mutationSeqRef.current += 1;
      postSyncMessage({ type: 'MUTATION_IN_FLIGHT', ts: Date.now() });
      try {
        const res = await createRegistrationInSheets(
          googleScriptUrl,
          record,
          requestId,
          onRetryStatus
        );
        if (!res.ok && !res.success) {
          if (res.registrationClosed) {
            persistAndApplyTripSettings(
              {
                ...tripSettings,
                registrationClosed: true,
              },
              true
            );
            return {
              ok: false,
              registrationClosed: true,
              error: res.error || 'التسجيل انتهى !! منتظرينكم في الرحلة',
            };
          }
          if (Array.isArray(res.registrations)) {
            applyRegistrationsIfChanged(res.registrations, 'local');
            setLiveAvailability(null);
          } else {
            void pollPublicAvailability();
          }
          return {
            ok: false,
            error: res.error || 'تعذر حفظ التسجيل في Google Sheets، يرجى المحاولة مرة أخرى.',
          };
        }

        const seqNo = res.seqNo ?? res.data?.seqNo ?? res.created?.seqNo;
        const timestamp = res.timestamp ?? res.data?.timestamp ?? res.created?.timestamp ?? record.timestamp;
        const createdRecord: RegistrationRecord = {
          ...(res.created ?? res.data?.created ?? record),
          requestId,
          seqNo,
          timestamp,
        };

        if (Array.isArray(res.registrations)) {
          applyRegistrationsIfChanged(res.registrations, 'local');
          setLiveAvailability(null);
        } else {
          commitLocalRegistrations((prev) => [
            createdRecord,
            ...prev.filter((r) => r.id !== createdRecord.id && (!requestId || r.requestId !== requestId)),
          ]);
        }
        return { ok: true, created: createdRecord };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'حدث خطأ في الاتصال بقاعدة البيانات، يرجى التأكد من الإنترنت والمحاولة مرة أخرى.',
        };
      } finally {
        postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
      }
    }

    const maxSeq = registrations.reduce((max, r) => Math.max(max, r.seqNo ?? 0), 0);
    const localRecord: RegistrationRecord = {
      ...record,
      requestId,
      seqNo: maxSeq + 1,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 23),
    };
    commitLocalRegistrations((prev) => [localRecord, ...prev]);
    return { ok: true, created: localRecord };
  };

  const handleToggleMemberPaid = (regId: number, memberId: string): string | null => {
    const targetReg = registrations.find((r) => r.id === regId);
    if (!targetReg) return null;
    const targetMember = targetReg.members.find((m) => m.id === memberId);
    if (!targetMember || targetMember.cancelled) return null;

    if (!targetMember.paid) {
      const mBus = getMemberBus(targetMember, targetReg);
      const mColor = getMemberColor(targetMember, targetReg);
      const busStat = capacities.buses[mBus];
      if (busStat.confirmed >= busStat.limit) {
        return `لا يمكن تأكيد الدفع: ${LABELS.buses[mBus]} — البص اتملا (${busStat.limit} فرد مؤكد).`;
      }
      const colorStat = capacities.colors[mColor];
      if (colorStat.confirmed >= colorStat.limit) {
        return `لا يمكن تأكيد الدفع: قروب ${LABELS.colors[mColor]} — القروب اكتمل (${colorStat.limit} فرد مؤكد).`;
      }
    }

    setCloudNotice('');
    commitLocalRegistrations((prev) =>
      prev.map((reg) =>
        reg.id !== regId
          ? reg
          : {
              ...reg,
              members: reg.members.map((m) =>
                m.id === memberId ? { ...m, paid: !m.paid } : m
              ),
            }
      )
    );

    if (isCloudConnected) {
      enqueueCloudMutation(
        () => toggleMemberPaidInSheets(googleScriptUrl, regId, memberId),
        'تعذر تحديث حالة الدفع في Google Sheets.'
      );
    }
    return null;
  };

  const handleToggleMemberCancelled = (regId: number, memberId: string): string | null => {
    setCloudNotice('');
    commitLocalRegistrations((prev) =>
      prev.map((reg) =>
        reg.id !== regId
          ? reg
          : {
              ...reg,
              members: reg.members.map((m) =>
                m.id === memberId
                  ? {
                      ...m,
                      cancelled: !m.cancelled,
                      paid: !m.cancelled ? false : m.paid,
                    }
                  : m
              ),
            }
      )
    );

    if (isCloudConnected) {
      enqueueCloudMutation(
        () => toggleMemberCancelledInSheets(googleScriptUrl, regId, memberId),
        'تعذر تحديث حالة الإلغاء في Google Sheets.'
      );
    }
    return null;
  };

  const handleApproveAllInReg = (regId: number): string | null => {
    const targetReg = registrations.find((r) => r.id === regId);
    if (!targetReg) return null;

    const toApproveMembers = targetReg.members.filter((m) => !m.cancelled && !m.paid);
    if (toApproveMembers.length === 0) return null;

    const neededBus: Record<'bus1' | 'bus2', number> = { bus1: 0, bus2: 0 };
    const neededColor: Record<ColorGroupKey, number> = {
      pink: 0,
      black: 0,
      yellow: 0,
      green: 0,
    };
    for (const m of toApproveMembers) {
      neededBus[getMemberBus(m, targetReg)] += 1;
      neededColor[getMemberColor(m, targetReg)] += 1;
    }

    for (const bKey of ['bus1', 'bus2'] as const) {
      const need = neededBus[bKey];
      if (need === 0) continue;
      const busStat = capacities.buses[bKey];
      if (busStat.confirmed + need > busStat.limit) {
        return busStat.remaining === 0
          ? `لا يمكن تأكيد الدفع: ${LABELS.buses[bKey]} — البص اتملا.`
          : `لا يمكن تأكيد الكل (${need} أفراد في ${LABELS.buses[bKey]}): المتبقي في ${LABELS.buses[bKey]} هو ${busStat.remaining} مقعد فقط.`;
      }
    }

    for (const cKey of ['pink', 'black', 'yellow', 'green'] as const) {
      const need = neededColor[cKey];
      if (need === 0) continue;
      const colorStat = capacities.colors[cKey];
      if (colorStat.confirmed + need > colorStat.limit) {
        return colorStat.remaining === 0
          ? `لا يمكن تأكيد الدفع: قروب ${LABELS.colors[cKey]} — القروب اكتمل.`
          : `لا يمكن تأكيد الكل (${need} أفراد في قروب ${LABELS.colors[cKey]}): المتبقي في قروب ${LABELS.colors[cKey]} هو ${colorStat.remaining} مقعد فقط.`;
      }
    }

    setCloudNotice('');
    commitLocalRegistrations((prev) =>
      prev.map((reg) =>
        reg.id !== regId
          ? reg
          : {
              ...reg,
              members: reg.members.map((m) => (m.cancelled ? m : { ...m, paid: true })),
            }
      )
    );

    if (isCloudConnected) {
      enqueueCloudMutation(
        () => approveAllInSheets(googleScriptUrl, regId),
        'تعذر تأكيد الدفع للجميع في Google Sheets.'
      );
    }
    return null;
  };

  const handleCancelAllInReg = (regId: number): string | null => {
    setCloudNotice('');
    commitLocalRegistrations((prev) =>
      prev.map((reg) => {
        if (reg.id !== regId) return reg;
        const allCancelled = reg.members.every((m) => m.cancelled);
        return {
          ...reg,
          members: reg.members.map((m) => ({
            ...m,
            cancelled: !allCancelled,
            paid: !allCancelled ? false : m.paid,
          })),
        };
      })
    );

    if (isCloudConnected) {
      enqueueCloudMutation(
        () => cancelAllInSheets(googleScriptUrl, regId),
        'تعذر تحديث حالة الحجز في Google Sheets.'
      );
    }
    return null;
  };

  const handleDeleteMember = useCallback(
    async (regId: number, memberId: string): Promise<string | null> => {
      setCloudNotice('');

      if (!isCloudConnected) {
        commitLocalRegistrations((prev) =>
          prev
            .map((reg) =>
              reg.id !== regId
                ? reg
                : {
                    ...reg,
                    members: reg.members.filter((m) => m.id !== memberId),
                  }
            )
            .filter((reg) => reg.members.length > 0)
        );
        setLiveAvailability(null);
        return null;
      }

      mutationSeqRef.current += 1;
      remoteMutationLockUntilRef.current = Date.now() + 8000;
      postSyncMessage({ type: 'MUTATION_IN_FLIGHT', ts: Date.now() });

      try {
        const res = await deleteMemberInSheets(googleScriptUrl, ADMIN_STRESS_SECRET, memberId);
        if (!res.ok) {
          const rawErr = res.error || 'تعذر مسح الفرد نهائياً من Google Sheets.';
          return rawErr.includes('عملية غير معروفة: delete')
            ? 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل المسح النهائي من الشيت.'
            : rawErr;
        }

        if (res.capacities) {
          persistAndApplyCapacityLimits(res.capacities, true);
        }
        if (res.availability) {
          setLiveAvailability(res.availability);
        } else {
          setLiveAvailability(null);
        }

        if (Array.isArray(res.registrations)) {
          applyRegistrationsIfChanged(res.registrations, 'local');
        } else {
          commitLocalRegistrations((prev) =>
            prev
              .map((reg) =>
                reg.id !== regId
                  ? reg
                  : {
                      ...reg,
                      members: reg.members.filter((m) => m.id !== memberId),
                    }
              )
              .filter((reg) => reg.members.length > 0)
          );
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لمسح الفرد نهائياً.';
      } finally {
        remoteMutationLockUntilRef.current = 0;
        postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
      }
    },
    [
      isCloudConnected,
      googleScriptUrl,
      commitLocalRegistrations,
      applyRegistrationsIfChanged,
      persistAndApplyCapacityLimits,
      postSyncMessage,
    ]
  );

  const handleDeleteRegistration = useCallback(
    async (regId: number): Promise<string | null> => {
      setCloudNotice('');

      if (!isCloudConnected) {
        commitLocalRegistrations((prev) => prev.filter((reg) => reg.id !== regId));
        setLiveAvailability(null);
        return null;
      }

      mutationSeqRef.current += 1;
      remoteMutationLockUntilRef.current = Date.now() + 8000;
      postSyncMessage({ type: 'MUTATION_IN_FLIGHT', ts: Date.now() });

      try {
        const res = await deleteRegistrationInSheets(googleScriptUrl, ADMIN_STRESS_SECRET, regId);
        if (!res.ok) {
          const rawErr = res.error || 'تعذر مسح الفاتورة نهائياً من Google Sheets.';
          return rawErr.includes('عملية غير معروفة: delete')
            ? 'يرجى تحديث كود Google Apps Script ونشر إصدار جديد (New version) لتفعيل مسح الفاتورة نهائياً من الشيت.'
            : rawErr;
        }

        if (res.capacities) {
          persistAndApplyCapacityLimits(res.capacities, true);
        }
        if (res.availability) {
          setLiveAvailability(res.availability);
        } else {
          setLiveAvailability(null);
        }

        if (Array.isArray(res.registrations)) {
          applyRegistrationsIfChanged(res.registrations, 'local');
        } else {
          commitLocalRegistrations((prev) => prev.filter((reg) => reg.id !== regId));
        }
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'تعذر الاتصال بالسيرفر لمسح الفاتورة نهائياً.';
      } finally {
        remoteMutationLockUntilRef.current = 0;
        postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
      }
    },
    [
      isCloudConnected,
      googleScriptUrl,
      commitLocalRegistrations,
      applyRegistrationsIfChanged,
      persistAndApplyCapacityLimits,
      postSyncMessage,
    ]
  );

  const handleStressTestBusyChange = useCallback(
    (busy: boolean) => {
      stressTestBusyRef.current = busy;
      if (busy) {
        postSyncMessage({ type: 'MUTATION_IN_FLIGHT', ts: Date.now() });
      } else {
        postSyncMessage({ type: 'MUTATION_IDLE', ts: Date.now() });
      }
    },
    [postSyncMessage]
  );

  const handleReplaceRegistrations = useCallback(
    (next: RegistrationRecord[]) => {
      mutationSeqRef.current += 1;
      applyRegistrationsIfChanged(next, 'local');
    },
    [applyRegistrationsIfChanged]
  );

  const handleClearLocalTestRecords = useCallback(() => {
    commitLocalRegistrations((prev) => prev.filter((r) => !r.isTest));
  }, [commitLocalRegistrations]);

  const handleAppendLocalTestRecords = useCallback(
    (records: RegistrationRecord[]) => {
      commitLocalRegistrations((prev) => [...records.slice().reverse(), ...prev]);
    },
    [commitLocalRegistrations]
  );

  const handleApproveLocalTestRecords = useCallback(() => {
    commitLocalRegistrations((prev) => {
      const caps = getCapacityCounts(prev, capacityLimits);
      const busRem = {
        bus1: caps.buses.bus1.remaining,
        bus2: caps.buses.bus2.remaining,
      };
      const colorRem: Record<ColorGroupKey, number> = {
        pink: caps.colors.pink.remaining,
        black: caps.colors.black.remaining,
        yellow: caps.colors.yellow.remaining,
        green: caps.colors.green.remaining,
      };

      return prev.map((reg) => {
        if (!reg.isTest) return reg;
        return {
          ...reg,
          members: reg.members.map((m) => {
            if (m.cancelled || m.paid) return m;
            const mBus = getMemberBus(m, reg);
            const mColor = getMemberColor(m, reg);
            if (busRem[mBus] > 0 && colorRem[mColor] > 0) {
              busRem[mBus] -= 1;
              colorRem[mColor] -= 1;
              return { ...m, paid: true };
            }
            return m;
          }),
        };
      });
    });
  }, [commitLocalRegistrations, capacityLimits]);

  const hidePublicRegistrationCtas = activeView === 'public' && tripSettings.registrationClosed;

  return (
    <div className="flex min-h-screen flex-col bg-[#F9F7F3] text-[#1E1A16]">
      {/* Clean Public Top Bar (No Admin Link) */}
      <header className="sticky top-0 z-30 border-b border-[#E4DDD2] bg-[#F9F7F3]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={() => goToPublic(false)}
            className="font-display text-lg font-extrabold tracking-tight text-[#1E1A16] whitespace-nowrap shrink-0 cursor-pointer"
          >
            اجتماع شباب الثلاثة فتية
          </button>

          {!hidePublicRegistrationCtas && (
            <button
              type="button"
              onClick={() => goToPublic(true)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-[#9A5B25] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#7C4518] whitespace-nowrap shrink-0 cursor-pointer"
            >
              سجّل الآن
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        {activeView === 'public' ? (
          <RegistrationView
            registrations={registrations}
            capacities={capacities}
            whatsappNumbers={whatsappNumbers}
            showAvailability={tripSettings.showAvailability}
            registrationClosed={tripSettings.registrationClosed}
            onSubmittingChange={handlePublicSubmittingChange}
            onRegistrationClosedDetected={handleRegistrationClosedDetected}
            onAddRegistration={handleAddRegistration}
          />
        ) : authenticatedOrganizer ? (
          <AdminPanelView
            currentOrganizer={authenticatedOrganizer}
            registrations={registrations}
            capacities={capacities}
            capacityLimits={capacityLimits}
            onSaveCapacities={handleSaveCapacities}
            onUpdateMemberName={handleUpdateMemberName}
            tripSettings={tripSettings}
            isSavingSettings={isSavingSettings}
            settingsSavedPulse={settingsSavedPulse}
            settingsSaveError={settingsSaveError}
            onToggleShowAvailability={handleToggleShowAvailability}
            onToggleRegistrationClosed={handleToggleRegistrationClosed}
            visitorAnalytics={visitorAnalytics}
            isRefreshingAnalytics={isRefreshingAnalytics}
            onRefreshAnalytics={handleRefreshAnalytics}
            onUpdateBaselineVisits={handleUpdateBaselineVisits}
            whatsappNumbers={whatsappNumbers}
            googleScriptUrl={googleScriptUrl}
            isSyncingSheets={isSyncingSheets}
            pendingSavesCount={pendingSavesCount}
            cloudNotice={cloudNotice}
            onDismissCloudNotice={() => setCloudNotice('')}
            onSyncSheets={() => syncFromSheets(undefined, false, 'adminData')}
            onStressTestBusyChange={handleStressTestBusyChange}
            onReplaceRegistrations={handleReplaceRegistrations}
            onClearLocalTestRecords={handleClearLocalTestRecords}
            onAppendLocalTestRecords={handleAppendLocalTestRecords}
            onApproveLocalTestRecords={handleApproveLocalTestRecords}
            onUpdateGoogleScriptUrl={handleUpdateGoogleScriptUrl}
            onUpdateWhatsAppNumbers={setWhatsAppNumbers}
            onToggleMemberPaid={handleToggleMemberPaid}
            onToggleMemberCancelled={handleToggleMemberCancelled}
            onApproveAllInReg={handleApproveAllInReg}
            onCancelAllInReg={handleCancelAllInReg}
            onDeleteMember={handleDeleteMember}
            onDeleteRegistration={handleDeleteRegistration}
            onGoToRegister={() => goToPublic(true)}
            onLogout={handleOrganizerLogout}
          />
        ) : (
          <AdminAuthGate
            onAuthenticated={handleOrganizerLogin}
            onExitToPublic={() => goToPublic(false)}
          />
        )}
      </main>

      {/* Quiet Footer (No Admin Link) */}
      <footer className="border-t border-[#E4DDD2] bg-white/70 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-xs text-[#6B6155] sm:flex-row sm:px-6">
          <p className="font-display font-bold text-[#1E1A16]">
            اجتماع شباب الثلاثة فتية — رحلة دير القديس العظيم الأنبا أنطونيوس بالبحر الأحمر
          </p>
          {!hidePublicRegistrationCtas && (
            <button
              type="button"
              onClick={() => goToPublic(true)}
              className="font-semibold text-[#7C4518] hover:underline cursor-pointer"
            >
              الانتقال لاستمارة التسجيل
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
