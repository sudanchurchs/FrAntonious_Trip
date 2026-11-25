import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Bus,
  CheckCircle2,
  Loader2,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  BUS_LIST,
  COLOR_GROUP_LIST,
  LABELS,
  type BusKey,
  type CapacityLimits,
  type ColorGroupKey,
} from '../types/trip';
import type { CapacityCounts } from '../utils/validation';

interface AdminCapacityControlCardProps {
  capacityLimits: CapacityLimits;
  capacities: CapacityCounts;
  isCloudConnected: boolean;
  onSaveCapacities: (nextLimits: CapacityLimits) => Promise<string | null>;
}

function cloneLimits(limits: CapacityLimits): CapacityLimits {
  return {
    buses: { ...limits.buses },
    colors: { ...limits.colors },
  };
}

function areLimitsEqual(a: CapacityLimits, b: CapacityLimits): boolean {
  return (
    a.buses.bus1 === b.buses.bus1 &&
    a.buses.bus2 === b.buses.bus2 &&
    a.colors.pink === b.colors.pink &&
    a.colors.black === b.colors.black &&
    a.colors.yellow === b.colors.yellow &&
    a.colors.green === b.colors.green
  );
}

export function AdminCapacityControlCard({
  capacityLimits,
  capacities,
  isCloudConnected,
  onSaveCapacities,
}: AdminCapacityControlCardProps) {
  const [draft, setDraft] = useState<CapacityLimits>(() => cloneLimits(capacityLimits));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Keep draft synchronized with remote updates unless the organizer is actively editing
  useEffect(() => {
    if (!isDirty) {
      setDraft(cloneLimits(capacityLimits));
    }
  }, [capacityLimits, isDirty]);

  const hasUnsavedChanges = !areLimitsEqual(draft, capacityLimits);

  const updateBusDraft = (key: BusKey, nextVal: number) => {
    const clean = Number.isFinite(nextVal) ? Math.max(0, Math.min(500, Math.floor(nextVal))) : 0;
    setDraft((prev) => ({
      ...prev,
      buses: { ...prev.buses, [key]: clean },
    }));
    setIsDirty(true);
    setSaveError('');
    setSaveSuccess(false);
  };

  const updateColorDraft = (key: ColorGroupKey, nextVal: number) => {
    const clean = Number.isFinite(nextVal) ? Math.max(0, Math.min(500, Math.floor(nextVal))) : 0;
    setDraft((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: clean },
    }));
    setIsDirty(true);
    setSaveError('');
    setSaveSuccess(false);
  };

  const handleResetDraft = () => {
    setDraft(cloneLimits(capacityLimits));
    setIsDirty(false);
    setSaveError('');
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    try {
      const err = await onSaveCapacities(draft);
      if (err) {
        setSaveError(err);
      } else {
        setIsDirty(false);
        setSaveSuccess(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      aria-label="التحكم في سعة الباصات والمجموعات اللونية"
      className="rounded-xl border border-[#DFD5C7] bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EFEAE1] pb-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FAF4EC] text-[#9A5B25] ring-1 ring-[#E8DAC6]">
            <Bus className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-extrabold text-[#1E1A16] sm:text-lg">
              التحكم في سعة الباصات والمجموعات اللونية
            </h2>
            <p className="mt-0.5 text-xs text-[#6B6155]">
              {isCloudConnected
                ? 'عدّل السعة القصوى لأي باص أو قروب لوني واضغط «حفظ السعات الجديدة» لتتحدث فوراً للزوار كل 3 ثوانٍ.'
                : 'وضع محلي: التعديلات تُحفظ محلياً وتنعكس فوراً على صفحة التسجيل وتأكيدات الدفع.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#6B6155] tabular-nums">
          <span>
            إجمالي سعة الباصات:{' '}
            <strong className="font-mono-num text-[#1E1A16]">
              {draft.buses.bus1 + draft.buses.bus2}
            </strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            إجمالي سعة القروبات:{' '}
            <strong className="font-mono-num text-[#1E1A16]">
              {draft.colors.pink + draft.colors.black + draft.colors.yellow + draft.colors.green}
            </strong>
          </span>
        </div>
      </div>

      {/* Buses Capacity Controls */}
      <div className="mt-4">
        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[#4E463D]">
          <Bus className="h-3.5 w-3.5 text-[#9A5B25]" />
          <span>سعة الباصات</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {BUS_LIST.map((bus) => {
            const confirmed = capacities.buses[bus.key].confirmed;
            const currentVal = draft.buses[bus.key];
            const isBelowConfirmed = currentVal < confirmed;

            return (
              <div
                key={bus.key}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  isBelowConfirmed
                    ? 'border-red-300 bg-red-50/40'
                    : 'border-[#E4DDD2] bg-[#FAF8F4]'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-[#1E1A16]">{bus.label}</p>
                  <p className="mt-0.5 text-xs text-[#5C5349] tabular-nums">
                    المؤكد دفعهم حالياً:{' '}
                    <strong className="font-mono-num text-[#1E1A16]">{confirmed}</strong> فرد
                    {isBelowConfirmed && (
                      <span className="mr-1.5 font-bold text-red-700">· أقل من المؤكدين</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-1.5" dir="ltr">
                  <button
                    type="button"
                    disabled={isSaving || currentVal <= 0}
                    onClick={() => updateBusDraft(bus.key, currentVal - 1)}
                    aria-label={`إنقاص سعة ${bus.label}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D4CBBF] bg-white text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] disabled:opacity-45 cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    value={currentVal}
                    disabled={isSaving}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateBusDraft(bus.key, raw === '' ? 0 : Number(raw));
                    }}
                    aria-label={`سعة ${bus.label}`}
                    className={`h-10 w-20 rounded-lg border bg-white px-2 text-center font-mono-num text-sm font-extrabold text-[#1E1A16] tabular-nums focus:outline-none ${
                      isBelowConfirmed
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-[#D4CBBF] focus:border-[#9A5B25]'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={isSaving || currentVal >= 500}
                    onClick={() => updateBusDraft(bus.key, currentVal + 1)}
                    aria-label={`زيادة سعة ${bus.label}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#D4CBBF] bg-white text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] disabled:opacity-45 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Color Groups Capacity Controls */}
      <div className="mt-5 border-t border-[#EFEAE1] pt-4">
        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-[#4E463D]">
          <Palette className="h-3.5 w-3.5 text-[#9A5B25]" />
          <span>سعة المجموعات اللونية</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COLOR_GROUP_LIST.map((group) => {
            const confirmed = capacities.colors[group.key].confirmed;
            const currentVal = draft.colors[group.key];
            const isBelowConfirmed = currentVal < confirmed;

            return (
              <div
                key={group.key}
                className={`flex flex-col justify-between gap-3 rounded-lg border p-3.5 transition-colors ${
                  isBelowConfirmed
                    ? 'border-red-300 bg-red-50/40'
                    : 'border-[#E4DDD2] bg-[#FAF8F4]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-xs ${group.swatchClass}`}
                      aria-hidden="true"
                    />
                    <p className="font-display text-sm font-bold text-[#1E1A16]">
                      قروب {LABELS.colors[group.key]}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-[#5C5349] tabular-nums">
                    المؤكد دفعهم:{' '}
                    <strong className="font-mono-num text-[#1E1A16]">{confirmed}</strong> فرد
                    {isBelowConfirmed && (
                      <span className="block font-bold text-red-700">أقل من المؤكدين</span>
                    )}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-1.5" dir="ltr">
                  <button
                    type="button"
                    disabled={isSaving || currentVal <= 0}
                    onClick={() => updateColorDraft(group.key, currentVal - 1)}
                    aria-label={`إنقاص سعة قروب ${LABELS.colors[group.key]}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4CBBF] bg-white text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] disabled:opacity-45 cursor-pointer"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={500}
                    value={currentVal}
                    disabled={isSaving}
                    onChange={(e) => {
                      const raw = e.target.value;
                      updateColorDraft(group.key, raw === '' ? 0 : Number(raw));
                    }}
                    aria-label={`سعة قروب ${LABELS.colors[group.key]}`}
                    className={`h-10 min-w-0 flex-1 rounded-lg border bg-white px-2 text-center font-mono-num text-sm font-extrabold text-[#1E1A16] tabular-nums focus:outline-none ${
                      isBelowConfirmed
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-[#D4CBBF] focus:border-[#9A5B25]'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={isSaving || currentVal >= 500}
                    onClick={() => updateColorDraft(group.key, currentVal + 1)}
                    aria-label={`زيادة سعة قروب ${LABELS.colors[group.key]}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4CBBF] bg-white text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] disabled:opacity-45 cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feedback Messages & Save Bar */}
      {saveError && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>تم حفظ السعات الجديدة بنجاح</span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#EFEAE1] pt-4">
        {hasUnsavedChanges && (
          <button
            type="button"
            disabled={isSaving}
            onClick={handleResetDraft}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#D4CBBF] bg-white px-4 py-2 text-xs font-semibold text-[#5C5349] transition-colors hover:bg-[#F5F1E9] disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>إلغاء التغييرات</span>
          </button>
        )}

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSave}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#9A5B25] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#7C4518] disabled:opacity-60 whitespace-nowrap cursor-pointer"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>جارٍ حفظ السعات...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>حفظ السعات الجديدة</span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
