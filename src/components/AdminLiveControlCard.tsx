import {
  AlertCircle,
  Ban,
  Bus,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Palette,
  SlidersHorizontal,
  Unlock,
} from 'lucide-react';
import {
  BUS_LIST,
  COLOR_GROUP_LIST,
  LABELS,
  type AvailabilityVisibilityKey,
  type TripSettings,
} from '../types/trip';

interface AdminLiveControlCardProps {
  settings: TripSettings;
  isSaving: boolean;
  savedPulse: boolean;
  saveError: string;
  isCloudConnected: boolean;
  onToggleAvailabilityItem: (key: AvailabilityVisibilityKey) => void;
  onSetAllAvailabilityVisibility: (visible: boolean) => void;
  onToggleManualUnavailable: (key: AvailabilityVisibilityKey) => void;
  onSetAllManualUnavailable: (unavailable: boolean) => void;
  onToggleRegistrationClosed: () => void;
}

export function AdminLiveControlCard({
  settings,
  isSaving,
  savedPulse,
  saveError,
  isCloudConnected,
  onToggleAvailabilityItem,
  onSetAllAvailabilityVisibility,
  onToggleManualUnavailable,
  onSetAllManualUnavailable,
  onToggleRegistrationClosed,
}: AdminLiveControlCardProps) {
  const vis = settings.availabilityVisibility;
  const visibleCount = [
    vis.bus1,
    vis.bus2,
    vis.pink,
    vis.black,
    vis.yellow,
    vis.green,
  ].filter(Boolean).length;
  const allVisible = visibleCount === 6;
  const allHidden = visibleCount === 0;

  const manual = settings.manualUnavailable;
  const manualClosedCount = [
    manual.bus1,
    manual.bus2,
    manual.pink,
    manual.black,
    manual.yellow,
    manual.green,
  ].filter(Boolean).length;
  const allManuallyClosed = manualClosedCount === 6;
  const noneManuallyClosed = manualClosedCount === 0;

  return (
    <section
      aria-label="التحكم اللحظي في صفحة التسجيل"
      className="rounded-xl border border-[#DFD5C7] bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFEAE1] pb-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FAF4EC] text-[#9A5B25] ring-1 ring-[#E8DAC6]">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-extrabold text-[#1E1A16] sm:text-lg">
              التحكم اللحظي في صفحة التسجيل
            </h2>
            <p className="mt-0.5 text-xs text-[#6B6155]">
              {isCloudConnected
                ? 'ينعكس أي تعديل فوراً على صفحة التسجيل لجميع الزوار تلقائياً كل 3 ثوانٍ بدون إعادة تحميل أو مسح البيانات.'
                : 'وضع محلي: التعديلات تنعكس فوراً في هذا المتصفح، وعند ربط Google Sheets تتزامن مع كل الأجهزة.'}
            </p>
          </div>
        </div>

        <div className="flex min-h-[28px] items-center gap-2 text-xs font-bold">
          {isSaving ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>جارٍ الحفظ...</span>
            </span>
          ) : savedPulse ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>تم الحفظ لحظياً</span>
            </span>
          ) : null}
        </div>
      </div>

      {saveError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Independent Per-Bus & Per-Color Manual Unavailable Switches (Show ONLY "غير متاح" without numbers) */}
      <div className="mt-4 rounded-xl border border-red-200/80 bg-red-50/30 p-4">
        <div className="flex flex-col gap-3 border-b border-red-200/60 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Ban
                className={`h-4 w-4 shrink-0 ${
                  manualClosedCount > 0 ? 'text-red-700' : 'text-[#6B6155]'
                }`}
              />
              <h3 className="font-display text-sm font-extrabold text-[#1E1A16]">
                تفعيل «غير متاح» يدوياً لكل باص وقروب في صفحة التسجيل
              </h3>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono-num text-[11px] font-bold tabular-nums ${
                  manualClosedCount > 0
                    ? 'border-red-300 bg-red-100 text-red-900'
                    : 'border-[#DFD5C7] bg-white text-[#4E463D]'
                }`}
              >
                غير متاح {manualClosedCount} / 6
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5C5349]">
              عند تفعيل أي مفتاح يظهر الباص أو القروب اللوني في صفحة التسجيل كـ «غير متاح» فقط بدون
              إظهار أي أرقام أو مقاعد متبقية ويُمنع اختياره.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={noneManuallyClosed}
              onClick={() => onSetAllManualUnavailable(false)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>فتح الكل</span>
            </button>
            <button
              type="button"
              disabled={allManuallyClosed}
              onClick={() => onSetAllManualUnavailable(true)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>جعل الكل غير متاح</span>
            </button>
          </div>
        </div>

        {/* Buses Row (2 manual unavailable slider switches) */}
        <div className="mt-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#4E463D]">
            <Bus className="h-3.5 w-3.5 text-red-700" />
            <span>الباصات</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {BUS_LIST.map((bus) => {
              const isManualOff = manual[bus.key];
              return (
                <div
                  key={bus.key}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                    isManualOff
                      ? 'border-red-300 bg-red-50/80'
                      : 'border-[#E4DDD2] bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold text-[#1E1A16]">{bus.label}</p>
                    <p
                      className={`mt-0.5 text-[11px] font-semibold ${
                        isManualOff ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {isManualOff
                        ? 'يظهر «غير متاح» فقط بدون أرقام مقاعد'
                        : 'مفتوح في التسجيل حسب السعة'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-[11px] font-bold whitespace-nowrap ${
                        isManualOff ? 'text-red-800' : 'text-[#6B6155]'
                      }`}
                    >
                      {isManualOff ? 'غير متاح' : 'مفتوح'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isManualOff}
                      aria-label={`جعل ${bus.label} غير متاح في صفحة التسجيل`}
                      onClick={() => onToggleManualUnavailable(bus.key)}
                      dir="ltr"
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 cursor-pointer ${
                        isManualOff
                          ? 'border-red-700 bg-red-600'
                          : 'border-[#C8BCAE] bg-[#D6CEC2]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          isManualOff ? 'translate-x-5.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Color Groups Row (4 manual unavailable slider switches) */}
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#4E463D]">
            <Palette className="h-3.5 w-3.5 text-red-700" />
            <span>المجموعات اللونية</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {COLOR_GROUP_LIST.map((group) => {
              const isManualOff = manual[group.key];
              return (
                <div
                  key={group.key}
                  className={`flex items-center justify-between gap-2.5 rounded-lg border px-3.5 py-3 transition-colors ${
                    isManualOff
                      ? 'border-red-300 bg-red-50/80'
                      : 'border-[#E4DDD2] bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-xs ${group.swatchClass}`}
                        aria-hidden="true"
                      />
                      <p className="font-display text-sm font-bold text-[#1E1A16] truncate">
                        قروب {LABELS.colors[group.key]}
                      </p>
                    </div>
                    <p
                      className={`mt-0.5 text-[11px] font-semibold ${
                        isManualOff ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {isManualOff ? 'غير متاح (ON)' : 'مفتوح (OFF)'}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isManualOff}
                    aria-label={`جعل قروب ${LABELS.colors[group.key]} غير متاح في صفحة التسجيل`}
                    onClick={() => onToggleManualUnavailable(group.key)}
                    dir="ltr"
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 cursor-pointer ${
                      isManualOff
                        ? 'border-red-700 bg-red-600'
                        : 'border-[#C8BCAE] bg-[#D6CEC2]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        isManualOff ? 'translate-x-5.5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Independent Per-Bus & Per-Color Availability Visibility Controls */}
      <div className="mt-4 rounded-xl border border-[#E4DDD2] bg-[#FAF8F4] p-4">
        <div className="flex flex-col gap-3 border-b border-[#E8E1D6] pb-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {visibleCount > 0 ? (
                <Eye className="h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <EyeOff className="h-4 w-4 shrink-0 text-[#6B6155]" />
              )}
              <h3 className="font-display text-sm font-extrabold text-[#1E1A16]">
                إظهار / إخفاء أرقام المقاعد المتبقية لكل باص وقروب بشكل مستقل
              </h3>
              <span className="rounded-md border border-[#DFD5C7] bg-white px-2 py-0.5 font-mono-num text-[11px] font-bold text-[#4E463D] tabular-nums">
                ظاهر {visibleCount} / 6
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5C5349]">
              عند إيقاف أي باص أو قروب تختفي عنه أرقام المقاعد المتبقية مع بقاء إمكانية اختياره طالما لم يكتمل.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={allVisible}
              onClick={() => onSetAllAvailabilityVisibility(true)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>تفعيل الكل</span>
            </button>
            <button
              type="button"
              disabled={allHidden}
              onClick={() => onSetAllAvailabilityVisibility(false)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#D4CBBF] bg-white px-3 py-1.5 text-xs font-bold text-[#4E463D] transition-colors hover:bg-[#F5F1E9] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span>إخفاء الكل</span>
            </button>
          </div>
        </div>

        {/* Buses Row (2 independent switches) */}
        <div className="mt-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#4E463D]">
            <Bus className="h-3.5 w-3.5 text-[#9A5B25]" />
            <span>الباصات</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {BUS_LIST.map((bus) => {
              const isOn = vis[bus.key];
              return (
                <div
                  key={bus.key}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                    isOn
                      ? 'border-emerald-200 bg-white'
                      : 'border-[#E4DDD2] bg-[#F4F0E8]/70'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold text-[#1E1A16]">{bus.label}</p>
                    <p
                      className={`mt-0.5 text-[11px] font-semibold ${
                        isOn ? 'text-emerald-700' : 'text-[#6B6155]'
                      }`}
                    >
                      {isOn ? 'الإتاحة والمقاعد ظاهرة للزوار' : 'أرقام المقاعد مخفية'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`text-[11px] font-bold whitespace-nowrap ${
                        isOn ? 'text-emerald-800' : 'text-[#6B6155]'
                      }`}
                    >
                      {isOn ? 'ظاهر' : 'مخفي'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={`إظهار إتاحة ${bus.label}`}
                      onClick={() => onToggleAvailabilityItem(bus.key)}
                      dir="ltr"
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A5B25] cursor-pointer ${
                        isOn
                          ? 'border-emerald-700 bg-emerald-600'
                          : 'border-[#C8BCAE] bg-[#D6CEC2]'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          isOn ? 'translate-x-5.5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Color Groups Row (4 independent switches) */}
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#4E463D]">
            <Palette className="h-3.5 w-3.5 text-[#9A5B25]" />
            <span>المجموعات اللونية</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {COLOR_GROUP_LIST.map((group) => {
              const isOn = vis[group.key];
              return (
                <div
                  key={group.key}
                  className={`flex items-center justify-between gap-2.5 rounded-lg border px-3.5 py-3 transition-colors ${
                    isOn
                      ? 'border-emerald-200 bg-white'
                      : 'border-[#E4DDD2] bg-[#F4F0E8]/70'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-xs ${group.swatchClass}`}
                        aria-hidden="true"
                      />
                      <p className="font-display text-sm font-bold text-[#1E1A16] truncate">
                        قروب {LABELS.colors[group.key]}
                      </p>
                    </div>
                    <p
                      className={`mt-0.5 text-[11px] font-semibold ${
                        isOn ? 'text-emerald-700' : 'text-[#6B6155]'
                      }`}
                    >
                      {isOn ? 'ظاهر (ON)' : 'مخفي (OFF)'}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`إظهار إتاحة قروب ${LABELS.colors[group.key]}`}
                    onClick={() => onToggleAvailabilityItem(group.key)}
                    dir="ltr"
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A5B25] cursor-pointer ${
                      isOn
                        ? 'border-emerald-700 bg-emerald-600'
                        : 'border-[#C8BCAE] bg-[#D6CEC2]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        isOn ? 'translate-x-5.5' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Registration Close / Open Switch */}
      <div
        className={`mt-4 flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
          settings.registrationClosed
            ? 'border-red-300 bg-red-50/60'
            : 'border-[#E4DDD2] bg-[#FAF8F4]'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {settings.registrationClosed ? (
              <Lock className="h-4 w-4 shrink-0 text-red-700" />
            ) : (
              <Unlock className="h-4 w-4 shrink-0 text-emerald-700" />
            )}
            <p className="font-display text-sm font-extrabold text-[#1E1A16]">
              إغلاق وانتهاء التسجيل
            </p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[#5C5349]">
            {settings.registrationClosed
              ? 'التسجيل مغلق الآن للزوار وتظهر شاشة «التسجيل انتهى !! منتظرينكم في الرحلة» — لوحة المنظمين تظل متاحة.'
              : 'التسجيل مفتوح حالياً للزوار واستمارة الحجز ظاهرة بالكامل.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <button
            type="button"
            role="switch"
            aria-checked={settings.registrationClosed}
            aria-label="إغلاق وانتهاء التسجيل"
            onClick={onToggleRegistrationClosed}
            dir="ltr"
            className={`relative inline-flex h-7 w-13 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 cursor-pointer ${
              settings.registrationClosed
                ? 'border-red-700 bg-red-600'
                : 'border-[#C8BCAE] bg-[#D6CEC2]'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                settings.registrationClosed ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
          <span
            className={`text-[11px] font-bold whitespace-nowrap ${
              settings.registrationClosed ? 'text-red-800' : 'text-emerald-800'
            }`}
          >
            {settings.registrationClosed ? 'مغلق (ON)' : 'مفتوح (OFF)'}
          </span>
        </div>
      </div>
    </section>
  );
}
