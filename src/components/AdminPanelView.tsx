import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  KeyRound,
  LogOut,
  Phone,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import {
  LABELS,
  PAYMENT_METHOD_LIST,
  RECIPIENT_LIST,
  type BookingStatusKey,
  type CapacityLimits,
  type PaymentMethodKey,
  type RecipientKey,
  type RegistrationRecord,
  type TripSettings,
  type VisitorAnalyticsData,
  type WhatsAppConfig,
} from '../types/trip';
import {
  calculateFinancialStats,
  exportRegistrationsToCSV,
  exportRegistrationsToExcel,
  getDuplicateNameCounts,
  getDuplicatePhoneCounts,
  getRegSummary,
  hasDuplicateMemberInfo,
  matchesRegistrationSearch,
  normalizeDigits,
  type CapacityCounts,
} from '../utils/validation';
import { isValidGoogleScriptUrl } from '../config/sheets';
import { saveAdminPin } from './AdminAuthGate';
import {
  AdminCapacityBoard,
  AdminFinancialCards,
  RegistrationTableRow,
} from './AdminMemoComponents';
import { AdminStressTestPanel } from './AdminStressTestPanel';
import { AdminLiveControlCard } from './AdminLiveControlCard';
import { AdminCapacityControlCard } from './AdminCapacityControlCard';
import { AdminPdfExportModal } from './AdminPdfExportModal';
import { VisitorAnalyticsModal } from './VisitorAnalyticsModal';

const LAZY_PAGE_SIZE = 20;

interface AdminPanelViewProps {
  currentOrganizer: RecipientKey;
  registrations: RegistrationRecord[];
  capacities: CapacityCounts;
  capacityLimits: CapacityLimits;
  onSaveCapacities: (nextLimits: CapacityLimits) => Promise<string | null>;
  onUpdateMemberName: (regId: number, memberId: string, newName: string) => Promise<string | null>;
  tripSettings: TripSettings;
  isSavingSettings: boolean;
  settingsSavedPulse: boolean;
  settingsSaveError: string;
  onToggleShowAvailability: () => void;
  onToggleRegistrationClosed: () => void;
  visitorAnalytics: VisitorAnalyticsData;
  isRefreshingAnalytics: boolean;
  onRefreshAnalytics: () => Promise<string | null>;
  onUpdateBaselineVisits: (baselineUnique: number, baselineTotal: number) => Promise<string | null>;
  whatsappNumbers: WhatsAppConfig;
  googleScriptUrl: string;
  isSyncingSheets: boolean;
  pendingSavesCount: number;
  cloudNotice: string;
  onDismissCloudNotice: () => void;
  onSyncSheets: () => Promise<string | null>;
  onStressTestBusyChange?: (busy: boolean) => void;
  onReplaceRegistrations: (next: RegistrationRecord[]) => void;
  onClearLocalTestRecords: () => void;
  onAppendLocalTestRecords: (records: RegistrationRecord[]) => void;
  onApproveLocalTestRecords: () => void;
  onUpdateGoogleScriptUrl: (nextUrl: string) => Promise<string | null>;
  onUpdateWhatsAppNumbers: (next: WhatsAppConfig) => void;
  onToggleMemberPaid: (regId: number, memberId: string) => string | null;
  onToggleMemberCancelled: (regId: number, memberId: string) => string | null;
  onApproveAllInReg: (regId: number) => string | null;
  onCancelAllInReg: (regId: number) => string | null;
  onDeleteMember: (regId: number, memberId: string) => Promise<string | null>;
  onDeleteRegistration: (regId: number) => Promise<string | null>;
  onGoToRegister: () => void;
  onLogout: () => void;
}

export function AdminPanelView({
  currentOrganizer,
  registrations,
  capacities,
  capacityLimits,
  onSaveCapacities,
  onUpdateMemberName,
  tripSettings,
  isSavingSettings,
  settingsSavedPulse,
  settingsSaveError,
  onToggleShowAvailability,
  onToggleRegistrationClosed,
  visitorAnalytics,
  isRefreshingAnalytics,
  onRefreshAnalytics,
  onUpdateBaselineVisits,
  whatsappNumbers,
  googleScriptUrl,
  isSyncingSheets,
  pendingSavesCount,
  cloudNotice,
  onDismissCloudNotice,
  onSyncSheets,
  onStressTestBusyChange,
  onReplaceRegistrations,
  onClearLocalTestRecords,
  onAppendLocalTestRecords,
  onApproveLocalTestRecords,
  onUpdateGoogleScriptUrl,
  onUpdateWhatsAppNumbers,
  onToggleMemberPaid,
  onToggleMemberCancelled,
  onApproveAllInReg,
  onCancelAllInReg,
  onDeleteMember,
  onDeleteRegistration,
  onGoToRegister,
  onLogout,
}: AdminPanelViewProps) {
  const [filterRecipient, setFilterRecipient] = useState<'all' | RecipientKey>('all');
  const [filterPayment, setFilterPayment] = useState<'all' | PaymentMethodKey>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | BookingStatusKey>('all');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [visibleCount, setVisibleCount] = useState<number>(LAZY_PAGE_SIZE);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const [adminNotice, setAdminNotice] = useState<string>('');
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);
  const [deletingRegId, setDeletingRegId] = useState<number | null>(null);
  const [pendingDeleteDialog, setPendingDeleteDialog] = useState<
    | { kind: 'member'; regId: number; memberId: string; memberName: string }
    | { kind: 'reg'; reg: RegistrationRecord }
    | null
  >(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [waDraft, setWaDraft] = useState<WhatsAppConfig>(whatsappNumbers);
  const [waSaved, setWaSaved] = useState(false);

  const [scriptUrlDraft, setScriptUrlDraft] = useState(googleScriptUrl);
  const [scriptSaving, setScriptSaving] = useState(false);
  const [scriptFeedback, setScriptFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [newPin, setNewPin] = useState('');
  const [pinFeedback, setPinFeedback] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const isCloudConnected = isValidGoogleScriptUrl(googleScriptUrl);

  const mekhailStats = useMemo(
    () => calculateFinancialStats(registrations, 'mekhail'),
    [registrations]
  );
  const fayezStats = useMemo(
    () => calculateFinancialStats(registrations, 'fayez'),
    [registrations]
  );
  const overallStats = useMemo(
    () => calculateFinancialStats(registrations, null),
    [registrations]
  );

  const testRowsCount = useMemo(
    () => registrations.filter((r) => Boolean(r.isTest)).length,
    [registrations]
  );

  const duplicateNameCounts = useMemo(
    () => getDuplicateNameCounts(registrations),
    [registrations]
  );

  const duplicatePhoneCounts = useMemo(
    () => getDuplicatePhoneCounts(registrations),
    [registrations]
  );

  const duplicateStats = useMemo(() => {
    let uniqueDuplicateNames = 0;
    duplicateNameCounts.forEach((count) => {
      if (count > 1) uniqueDuplicateNames++;
    });

    let uniqueDuplicatePhones = 0;
    duplicatePhoneCounts.forEach((count) => {
      if (count > 1) uniqueDuplicatePhones++;
    });

    const hasAnyDuplicates = uniqueDuplicateNames > 0 || uniqueDuplicatePhones > 0;
    const duplicateBookingsCount = !hasAnyDuplicates
      ? 0
      : registrations.filter((reg) =>
          hasDuplicateMemberInfo(reg, duplicateNameCounts, duplicatePhoneCounts)
        ).length;

    return {
      uniqueDuplicateNames,
      uniqueDuplicatePhones,
      hasAnyDuplicates,
      duplicateBookingsCount,
    };
  }, [registrations, duplicateNameCounts, duplicatePhoneCounts]);

  // Turn off duplicates-only filter automatically once all duplicates have been cleaned up
  useEffect(() => {
    if (onlyDuplicates && !duplicateStats.hasAnyDuplicates) {
      setOnlyDuplicates(false);
    }
  }, [onlyDuplicates, duplicateStats.hasAnyDuplicates]);

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((reg) => {
      const matchRec = filterRecipient === 'all' || reg.recipient === filterRecipient;
      const matchPay = filterPayment === 'all' || reg.paymentMethod === filterPayment;
      const summary = getRegSummary(reg);
      const matchStatus = filterStatus === 'all' || summary.statusKey === filterStatus;
      const matchDup =
        !onlyDuplicates ||
        hasDuplicateMemberInfo(reg, duplicateNameCounts, duplicatePhoneCounts);
      const matchSearch = matchesRegistrationSearch(reg, deferredSearchQuery);
      return matchRec && matchPay && matchStatus && matchDup && matchSearch;
    });
  }, [
    registrations,
    filterRecipient,
    filterPayment,
    filterStatus,
    onlyDuplicates,
    duplicateNameCounts,
    duplicatePhoneCounts,
    deferredSearchQuery,
  ]);

  const filteredMembersCount = useMemo(
    () => filteredRegistrations.reduce((sum, reg) => sum + reg.members.length, 0),
    [filteredRegistrations]
  );

  // Reset lazy-loading window whenever search or filters change
  useEffect(() => {
    setVisibleCount(LAZY_PAGE_SIZE);
  }, [deferredSearchQuery, filterRecipient, filterPayment, filterStatus, onlyDuplicates]);

  const visibleRegistrations = useMemo(
    () => filteredRegistrations.slice(0, visibleCount),
    [filteredRegistrations, visibleCount]
  );

  const remainingToLoad = Math.max(0, filteredRegistrations.length - visibleRegistrations.length);

  // Automatic lazy loading on scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || remainingToLoad <= 0) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(filteredRegistrations.length, prev + LAZY_PAGE_SIZE));
        }
      },
      { rootMargin: '260px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [remainingToLoad, filteredRegistrations.length]);

  const runInstantAction = useCallback((fn: () => string | null) => {
    setAdminNotice('');
    const err = fn();
    if (err) setAdminNotice(err);
  }, []);

  const handleTogglePaidCb = useCallback(
    (regId: number, memberId: string) =>
      runInstantAction(() => onToggleMemberPaid(regId, memberId)),
    [runInstantAction, onToggleMemberPaid]
  );

  const handleToggleCancelledCb = useCallback(
    (regId: number, memberId: string) =>
      runInstantAction(() => onToggleMemberCancelled(regId, memberId)),
    [runInstantAction, onToggleMemberCancelled]
  );

  const handleApproveAllCb = useCallback(
    (regId: number) => runInstantAction(() => onApproveAllInReg(regId)),
    [runInstantAction, onApproveAllInReg]
  );

  const handleCancelAllCb = useCallback(
    (regId: number) => runInstantAction(() => onCancelAllInReg(regId)),
    [runInstantAction, onCancelAllInReg]
  );

  const handleRequestDeleteMemberCb = useCallback(
    (regId: number, memberId: string, memberName: string) => {
      setAdminNotice('');
      setPendingDeleteDialog({ kind: 'member', regId, memberId, memberName });
    },
    []
  );

  const handleRequestDeleteRegCb = useCallback((reg: RegistrationRecord) => {
    setAdminNotice('');
    setPendingDeleteDialog({ kind: 'reg', reg });
  }, []);

  const handleConfirmPendingDelete = useCallback(async () => {
    const target = pendingDeleteDialog;
    if (!target) return;
    setPendingDeleteDialog(null);
    setAdminNotice('');

    if (target.kind === 'member') {
      setDeletingMemberId(target.memberId);
      try {
        const err = await onDeleteMember(target.regId, target.memberId);
        if (err) setAdminNotice(err);
      } finally {
        setDeletingMemberId((cur) => (cur === target.memberId ? null : cur));
      }
      return;
    }

    setDeletingRegId(target.reg.id);
    try {
      const err = await onDeleteRegistration(target.reg.id);
      if (err) setAdminNotice(err);
    } finally {
      setDeletingRegId((cur) => (cur === target.reg.id ? null : cur));
    }
  }, [pendingDeleteDialog, onDeleteMember, onDeleteRegistration]);

  const handleQuickFilterText = useCallback((query: string) => {
    setSearchQuery(query);
    setFilterRecipient('all');
    setFilterPayment('all');
    setFilterStatus('all');
    setOnlyDuplicates(false);
  }, []);

  const handleRefresh = async () => {
    setAdminNotice('');
    onDismissCloudNotice();
    const err = await onSyncSheets();
    if (err) setAdminNotice(err);
  };

  const handleSaveScriptUrl = async () => {
    setScriptSaving(true);
    setScriptFeedback(null);
    try {
      const err = await onUpdateGoogleScriptUrl(scriptUrlDraft);
      if (err) {
        setScriptFeedback({ ok: false, text: err });
      } else {
        setScriptFeedback({
          ok: true,
          text: scriptUrlDraft.trim()
            ? 'تم الاتصال بـ Google Sheets ومزامنة البيانات بنجاح'
            : 'تم فصل رابط Google Sheets والعودة للتخزين المحلي',
        });
      }
    } finally {
      setScriptSaving(false);
    }
  };

  const handleSaveWhatsApp = () => {
    onUpdateWhatsAppNumbers(waDraft);
    setWaSaved(true);
    setTimeout(() => setWaSaved(false), 2000);
  };

  const handleSavePin = async () => {
    const clean = newPin.trim();
    if (clean.length < 4) {
      setPinFeedback('الرمز السري يجب أن يكون 4 أرقام أو أحرف على الأقل');
      return;
    }
    await saveAdminPin(clean);
    setNewPin('');
    setPinFeedback('تم تحديث الرمز السري للمنظمين بنجاح');
    setTimeout(() => setPinFeedback(''), 2500);
  };

  const handleCopyAdminLink = async () => {
    const adminUrl = `${window.location.origin}${window.location.pathname}?admin=true`;
    try {
      await navigator.clipboard.writeText(adminUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2200);
    } catch {
      setLinkCopied(false);
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterRecipient !== 'all' ||
    filterPayment !== 'all' ||
    filterStatus !== 'all' ||
    onlyDuplicates;

  return (
    <div className="space-y-8 pb-16 pt-6 md:pt-10">
      {/* Header Row */}
      <div className="flex flex-col gap-4 border-b border-[#E4DDD2] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium text-[#7C4518]">
            اجتماع شباب الثلاثة فتية · مسجل الدخول: {LABELS.recipients[currentOrganizer]} ·{' '}
            {isCloudConnected ? 'متصل بـ Google Sheets' : 'وضع التخزين المحلي'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-2xl font-extrabold text-[#1E1A16] sm:text-3xl">
              لوحة تحكم المنظمين وحسابات الرحلة
            </h1>
            <button
              type="button"
              onClick={() => setShowAnalyticsModal(true)}
              className="inline-flex min-h-[34px] items-center gap-2 rounded-lg border border-[#0B7285]/30 bg-[#0B7285]/8 px-3 py-1.5 text-xs font-extrabold text-[#0B5D6B] transition-colors hover:border-[#0B7285]/60 hover:bg-[#0B7285]/15 whitespace-nowrap cursor-pointer"
            >
              <span>📊 إحصائيات الزوار</span>
              <span className="rounded-md bg-[#0B7285] px-1.5 py-0.5 font-mono-num text-[11px] font-bold text-white tabular-nums">
                {visitorAnalytics.grandUnique}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCloudConnected && (
            <button
              type="button"
              disabled={isSyncingSheets}
              onClick={handleRefresh}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4CBBF] bg-white px-3.5 py-2 text-xs font-semibold text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw
                className={`h-4 w-4 text-[#7C4518] ${
                  isSyncingSheets || pendingSavesCount > 0 ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isSyncingSheets
                  ? 'جارٍ التحديث...'
                  : pendingSavesCount > 0
                    ? 'جارٍ الحفظ...'
                    : 'تحديث البيانات'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPdfModal(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#9A5B25] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#7C4518] whitespace-nowrap cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            <span>تصدير كشف PDF</span>
          </button>

          <button
            type="button"
            onClick={() =>
              exportRegistrationsToExcel(
                filteredRegistrations,
                registrations,
                filterRecipient,
                capacityLimits
              )
            }
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>تصدير Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => exportRegistrationsToCSV(filteredRegistrations, filterRecipient)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4CBBF] bg-white px-3.5 py-2 text-xs font-semibold text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] whitespace-nowrap cursor-pointer"
          >
            <Download className="h-4 w-4 text-[#5C5349]" />
            <span>تصدير CSV</span>
          </button>

          <button
            type="button"
            onClick={handleCopyAdminLink}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4CBBF] bg-white px-3.5 py-2 text-xs font-semibold text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] whitespace-nowrap cursor-pointer"
          >
            {linkCopied ? (
              <Check className="h-4 w-4 text-emerald-700" />
            ) : (
              <Copy className="h-4 w-4 text-[#7C4518]" />
            )}
            <span>{linkCopied ? 'تم نسخ الرابط الخاص' : 'نسخ رابط المنظمين'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWaDraft(whatsappNumbers);
              setScriptUrlDraft(googleScriptUrl);
              setScriptFeedback(null);
              setShowSettings((v) => !v);
            }}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#D4CBBF] bg-white px-3.5 py-2 text-xs font-semibold text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] whitespace-nowrap cursor-pointer"
          >
            <Settings2 className="h-4 w-4 text-[#7C4518]" />
            <span>الإعدادات</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-800 transition-colors hover:bg-red-100 whitespace-nowrap cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Real-Time Live Control Card for Registration Page */}
      <AdminLiveControlCard
        settings={tripSettings}
        isSaving={isSavingSettings}
        savedPulse={settingsSavedPulse}
        saveError={settingsSaveError}
        isCloudConnected={isCloudConnected}
        onToggleShowAvailability={onToggleShowAvailability}
        onToggleRegistrationClosed={onToggleRegistrationClosed}
      />

      {/* Dedicated Stress Test & Sheet Cleanup Section (Admin Only) */}
      <AdminStressTestPanel
        googleScriptUrl={googleScriptUrl}
        testRowsCount={testRowsCount}
        onBusyChange={onStressTestBusyChange}
        onReplaceRegistrations={onReplaceRegistrations}
        onClearLocalTestRecords={onClearLocalTestRecords}
        onAppendLocalTestRecords={onAppendLocalTestRecords}
        onApproveLocalTestRecords={onApproveLocalTestRecords}
      />

      {/* Organizer Settings (Google Sheets URL + WhatsApp Numbers + Secret PIN) */}
      {showSettings && (
        <div className="space-y-6 rounded-xl border border-[#E4DDD2] bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#9A5B25]" />
              <h2 className="font-display text-base font-bold text-[#1E1A16]">
                إعدادات قاعدة بيانات Google Sheets والواتساب والرمز السري
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="rounded-md p-1 text-[#6B6155] hover:bg-[#F5F1E9] cursor-pointer"
              aria-label="إغلاق الإعدادات"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-lg border border-[#ECE6DC] bg-[#FAF8F4] p-4">
            <label
              htmlFor="scriptUrlInput"
              className="block font-display text-sm font-bold text-[#1E1A16]"
            >
              رابط Google Apps Script Web App (ينتهي بـ /exec)
            </label>
            <p className="mt-1 text-xs text-[#6B6155]">
              ضع رابط النشر الخاص بكود Google Apps Script هنا لاختباره وربطه مباشرة، كما يُفضّل وضعه
              في ملف الإعدادات قبل النشر على GitHub Pages ليعمل تلقائياً لكل المسجلين.
            </p>
            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
              <input
                id="scriptUrlInput"
                type="url"
                dir="ltr"
                value={scriptUrlDraft}
                onChange={(e) => setScriptUrlDraft(e.target.value)}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="flex-1 rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 font-mono-num text-xs text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
              />
              <button
                type="button"
                disabled={scriptSaving}
                onClick={handleSaveScriptUrl}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
              >
                {scriptSaving ? 'جارٍ اختبار الاتصال...' : 'حفظ واختبار الاتصال'}
              </button>
            </div>
            {scriptFeedback && (
              <p
                className={`mt-2 text-xs font-semibold ${
                  scriptFeedback.ok ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {scriptFeedback.text}
              </p>
            )}
          </div>

          <div className="border-t border-[#ECE6DC] pt-5">
            <div className="mb-3 flex items-center gap-2">
              <Phone className="h-4 w-4 text-[#9A5B25]" />
              <h3 className="font-display text-sm font-bold text-[#1E1A16]">
                أرقام واتساب المنظمين
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {RECIPIENT_LIST.map((rec) => (
                <div
                  key={rec.key}
                  className="space-y-3 rounded-lg border border-[#ECE6DC] bg-[#FAF8F4] p-4"
                >
                  <p className="font-display text-sm font-bold text-[#1E1A16]">{rec.label}</p>
                  {PAYMENT_METHOD_LIST.map((pm) => (
                    <div key={pm.key} className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-[#5C5349]">{pm.label}</label>
                      <input
                        type="tel"
                        dir="ltr"
                        value={waDraft[rec.key][pm.key]}
                        onChange={(e) => {
                          const val = normalizeDigits(e.target.value);
                          setWaDraft((prev) => ({
                            ...prev,
                            [rec.key]: { ...prev[rec.key], [pm.key]: val },
                          }));
                        }}
                        className="w-44 rounded-md border border-[#D4CBBF] bg-white px-2.5 py-1.5 font-mono-num text-xs text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              {waSaved && (
                <span className="text-xs font-semibold text-emerald-700">تم حفظ الأرقام بنجاح</span>
              )}
              <button
                type="button"
                onClick={handleSaveWhatsApp}
                className="rounded-lg bg-[#9A5B25] px-5 py-2 text-xs font-bold text-white hover:bg-[#7C4518] cursor-pointer"
              >
                حفظ أرقام الواتساب
              </button>
            </div>
          </div>

          <div className="border-t border-[#ECE6DC] pt-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#9A5B25]" />
              <h3 className="font-display text-sm font-bold text-[#1E1A16]">
                تغيير الرمز السري لدخول المنظمين
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="أدخل الرمز السري الجديد"
                className="w-56 rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 font-mono-num text-xs text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleSavePin}
                className="rounded-lg bg-[#1E1A16] px-4 py-2 text-xs font-bold text-white hover:bg-[#3A3229] cursor-pointer"
              >
                تحديث الرمز السري
              </button>
              {pinFeedback && (
                <span className="text-xs font-semibold text-emerald-700">{pinFeedback}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Admin Capacity / Error Notice */}
      {(adminNotice || cloudNotice) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{adminNotice || cloudNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setAdminNotice('');
              onDismissCloudNotice();
            }}
            className="rounded p-1 text-red-700 hover:bg-red-100 cursor-pointer"
            aria-label="إخفاء التنبيه"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Memoized Financial Summary Cards */}
      <AdminFinancialCards
        mekhailStats={mekhailStats}
        fayezStats={fayezStats}
        overallStats={overallStats}
      />

      {/* Memoized Live Confirmed Capacity Board */}
      <AdminCapacityBoard capacities={capacities} />

      {/* Dynamic Bus & Color Group Capacity Controls */}
      <AdminCapacityControlCard
        capacityLimits={capacityLimits}
        capacities={capacities}
        isCloudConnected={isCloudConnected}
        onSaveCapacities={onSaveCapacities}
      />

      {/* Duplicate Names / Phones Alert Banner (only shown when duplicates exist) */}
      {duplicateStats.hasAnyDuplicates && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border-2 border-red-400 bg-red-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            <div>
              <p className="font-display text-sm font-extrabold text-red-900">
                تنبيه تكرار:{' '}
                {[
                  duplicateStats.uniqueDuplicateNames > 0
                    ? `${duplicateStats.uniqueDuplicateNames} ${
                        duplicateStats.uniqueDuplicateNames === 1 ? 'اسم مكرر' : 'أسماء مكررة'
                      }`
                    : '',
                  duplicateStats.uniqueDuplicatePhones > 0
                    ? `${duplicateStats.uniqueDuplicatePhones} ${
                        duplicateStats.uniqueDuplicatePhones === 1
                          ? 'رقم هاتف مكرر'
                          : 'أرقام هواتف مكررة'
                      }`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="mt-0.5 text-xs text-red-800">
                تم تمييز كل الأسماء وأرقام الهواتف المكررة باللون الأحمر في الجدول أدناه. اضغط على
                شارة «اسم مكرر» أو «رقم مكرر» لعرض كل النسخ معاً وحذف الزائد.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !onlyDuplicates;
              setOnlyDuplicates(next);
              if (next) {
                setSearchQuery('');
                setFilterRecipient('all');
                setFilterPayment('all');
                setFilterStatus('all');
              }
            }}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-extrabold transition-colors whitespace-nowrap cursor-pointer ${
              onlyDuplicates
                ? 'border border-red-400 bg-white text-red-800 hover:bg-red-100'
                : 'bg-red-700 text-white hover:bg-red-800'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              {onlyDuplicates
                ? 'عرض جميع المسجلين'
                : `عرض التكرارات فقط (${duplicateStats.duplicateBookingsCount})`}
            </span>
          </button>
        </div>
      )}

      {/* Prominent Quick Search & Filters Toolbar */}
      <div className="space-y-4 rounded-xl border border-[#E4DDD2] bg-white p-5">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="adminSearch" className="text-sm font-bold text-[#1E1A16]">
              البحث السريع عن المسجلين (بالاسم الثلاثي أو رقم الهاتف أو رقم الطابور)
            </label>
            <span className="text-xs text-[#6B6155] tabular-nums">
              عرض{' '}
              <strong className="font-mono-num text-[#1E1A16]">
                {visibleRegistrations.length}
              </strong>{' '}
              من {filteredRegistrations.length} حجز مطابق ({filteredMembersCount} فرد)
            </span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8C8173]" />
            <input
              id="adminSearch"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="اكتب الاسم الثلاثي أو جزء منه، أو رقم الهاتف (مثال: 010... أو +2010...) أو رقم الطابور"
              className="w-full rounded-lg border border-[#D4CBBF] bg-[#FAF8F4] py-3 pr-11 pl-10 text-sm text-[#1E1A16] transition-colors focus:border-[#9A5B25] focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="مسح البحث"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#6B6155] hover:bg-[#EFEAE1] hover:text-[#1E1A16] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-[#EFEAE1] pt-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="filterRecipient"
              className="mb-1 block text-xs font-semibold text-[#5C5349]"
            >
              فرز حسب المستلم
            </label>
            <select
              id="filterRecipient"
              value={filterRecipient}
              onChange={(e) => setFilterRecipient(e.target.value as 'all' | RecipientKey)}
              className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 text-sm text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
            >
              <option value="all">الكل (ميخائيل + فايز)</option>
              <option value="mekhail">ميخائيل إدور</option>
              <option value="fayez">فايز فيكتور</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filterPayment"
              className="mb-1 block text-xs font-semibold text-[#5C5349]"
            >
              فرز حسب طريقة الدفع
            </label>
            <select
              id="filterPayment"
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value as 'all' | PaymentMethodKey)}
              className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 text-sm text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
            >
              <option value="all">كل طرق الدفع</option>
              <option value="instapay">إنستا باي</option>
              <option value="orange">أورانج كاش</option>
              <option value="vf">فودافون كاش</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="filterStatus"
              className="mb-1 block text-xs font-semibold text-[#5C5349]"
            >
              فرز حسب حالة الدفع
            </label>
            <select
              id="filterStatus"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | BookingStatusKey)}
              className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 text-sm text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
            >
              <option value="all">الكل</option>
              <option value="paid">مدفوع بالكامل</option>
              <option value="partial">دفع جزئي</option>
              <option value="unpaid">لم يدفع</option>
              <option value="cancelled">ملغي بالكامل</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterRecipient('all');
                setFilterPayment('all');
                setFilterStatus('all');
                setOnlyDuplicates(false);
              }}
              className="text-xs font-semibold text-[#7C4518] hover:underline cursor-pointer"
            >
              إعادة ضبط البحث والفرز
            </button>
          </div>
        )}
      </div>

      {/* Lazy-Loaded Registrations Table with Queue Sequence Column */}
      <div className="overflow-hidden rounded-xl border border-[#E4DDD2] bg-white">
        {registrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="font-display text-lg font-bold text-[#1E1A16]">
              لا توجد تسجيلات مسجلة حتى الآن
            </p>
            <p className="mt-1.5 max-w-md text-sm text-[#6B6155]">
              فور تسجيل أول مشترك أو مجموعة في الرحلة، ستظهر جميع البيانات وحسابات الدفع هنا تلقائياً.
            </p>
            <button
              type="button"
              onClick={onGoToRegister}
              className="mt-5 rounded-lg bg-[#9A5B25] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#7C4518] cursor-pointer"
            >
              الانتقال لواجهة التسجيل
            </button>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#6B6155]">
            لا توجد بيانات مطابقة لبحثك أو معايير الفرز الحالية.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-right text-sm">
                <thead>
                  <tr className="border-b border-[#E4DDD2] bg-[#FAF8F4] text-xs font-bold text-[#4E463D]">
                    <th className="px-4 py-3.5 whitespace-nowrap">رقم الطابور والوقت</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">الأفراد وإدارة الدفع / الإلغاء</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">الباص واللون</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">المستلم وطريقة الدفع</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">الحساب المالي للحجز</th>
                    <th className="px-4 py-3.5 whitespace-nowrap">إجراءات سريعة للحجز</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECE6DC]">
                  {visibleRegistrations.map((reg) => (
                    <RegistrationTableRow
                      key={reg.id}
                      reg={reg}
                      duplicateNameCounts={duplicateNameCounts}
                      duplicatePhoneCounts={duplicatePhoneCounts}
                      deletingMemberId={deletingMemberId}
                      deletingRegId={deletingRegId}
                      onQuickFilterText={handleQuickFilterText}
                      onUpdateMemberName={onUpdateMemberName}
                      onToggleMemberPaid={handleTogglePaidCb}
                      onToggleMemberCancelled={handleToggleCancelledCb}
                      onApproveAllInReg={handleApproveAllCb}
                      onCancelAllInReg={handleCancelAllCb}
                      onRequestDeleteMember={handleRequestDeleteMemberCb}
                      onRequestDeleteRegistration={handleRequestDeleteRegCb}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {remainingToLoad > 0 && (
              <div
                ref={loadMoreSentinelRef}
                className="flex flex-col items-center justify-center gap-2 border-t border-[#ECE6DC] bg-[#FAF8F4] px-4 py-4"
              >
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((prev) =>
                      Math.min(filteredRegistrations.length, prev + LAZY_PAGE_SIZE)
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4CBBF] bg-white px-5 py-2 text-xs font-bold text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] cursor-pointer"
                >
                  <ChevronDown className="h-4 w-4 text-[#7C4518]" />
                  <span>
                    عرض المزيد ({Math.min(LAZY_PAGE_SIZE, remainingToLoad)} من أصل{' '}
                    {remainingToLoad} متبقي)
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Permanent Deletion Confirmation Dialog */}
      {pendingDeleteDialog && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E1A16]/55 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPendingDeleteDialog(null);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-800">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="delete-confirm-title"
                  className="font-display text-base font-extrabold text-[#1E1A16]"
                >
                  {pendingDeleteDialog.kind === 'member'
                    ? 'تأكيد مسح فرد نهائياً من الفاتورة'
                    : 'تأكيد مسح الفاتورة بالكامل نهائياً'}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[#4E463D]">
                  {pendingDeleteDialog.kind === 'member'
                    ? `هل أنت متأكد من مسح (${pendingDeleteDialog.memberName}) نهائياً من الفاتورة؟ لن يمكن استرجاعه بعد المسح.`
                    : `هل أنت متأكد من مسح هذه الفاتورة بالكامل (${pendingDeleteDialog.reg.members.length} ${
                        pendingDeleteDialog.reg.members.length === 1 ? 'فرد' : 'أفراد'
                      }) نهائياً من قاعدة البيانات؟ لن يمكن استرجاعها بعد المسح.`}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteDialog(null)}
                className="min-h-[40px] rounded-lg border border-[#D4CBBF] bg-white px-4 py-2 text-xs font-semibold text-[#5C5349] transition-colors hover:bg-[#F5F1E9] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmPendingDelete()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-red-800 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-900 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>نعم، مسح نهائي</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Organized PDF Roster Export Modal */}
      <AdminPdfExportModal
        isOpen={showPdfModal}
        allRegistrations={registrations}
        filteredRegistrations={filteredRegistrations}
        capacities={capacities}
        hasActiveFilters={hasActiveFilters}
        onClose={() => setShowPdfModal(false)}
      />

      {/* Visitor Analytics Popup Modal */}
      <VisitorAnalyticsModal
        isOpen={showAnalyticsModal}
        analytics={visitorAnalytics}
        activePersons={overallStats.activePersons}
        isRefreshing={isRefreshingAnalytics}
        isCloudConnected={isCloudConnected}
        onClose={() => setShowAnalyticsModal(false)}
        onRefresh={onRefreshAnalytics}
        onSaveBaseline={onUpdateBaselineVisits}
      />
    </div>
  );
}
