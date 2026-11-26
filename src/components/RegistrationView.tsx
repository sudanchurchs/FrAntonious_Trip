import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Phone,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  BUS_CAPACITY,
  BUS_LIST,
  COLOR_GROUP_CAPACITY,
  COLOR_GROUP_LIST,
  DEFAULT_WHATSAPP_NUMBERS,
  LABELS,
  PAYMENT_OPTIONS,
  TICKET_PRICE,
  type AvailabilityVisibility,
  type BusKey,
  type ColorGroupKey,
  type MemberRecord,
  type PaymentOptionId,
  type RegistrationRecord,
  type WhatsAppConfig,
} from '../types/trip';
import {
  buildWhatsAppDetails,
  formatEgyptianPhone,
  getActiveExistingSets,
  getMemberBus,
  getMemberColor,
  getTodayIsoDate,
  hasMixedMemberAssignments,
  normalizeArabicText,
  normalizeDigits,
  normalizePhoneKey,
  validateBirthDate,
  validateEgyptianPhone,
  validateTripleName,
  type CapacityCounts,
} from '../utils/validation';
import { MonasteryBannerImage } from './MonasteryBannerImage';
import { PaymentMethodIcon } from './PaymentMethodIcon';
import { RegistrationClosedScreen } from './RegistrationClosedScreen';
import { generateRequestId, type RetryStatusCallback } from '../services/sheetsApi';

interface CompanionDraft {
  keyId: string;
  name: string;
  phone: string;
  birthDate: string;
  bus: BusKey | '';
  colorGroup: ColorGroupKey | '';
  busClickedFull: string;
  colorClickedFull: string;
  nameTouched: boolean;
  phoneTouched: boolean;
  birthDateTouched: boolean;
}

let companionKeySeq = 1;
function createEmptyCompanion(): CompanionDraft {
  companionKeySeq += 1;
  return {
    keyId: `comp_${Date.now()}_${companionKeySeq}`,
    name: '',
    phone: '',
    birthDate: '',
    bus: '',
    colorGroup: '',
    busClickedFull: '',
    colorClickedFull: '',
    nameTouched: false,
    phoneTouched: false,
    birthDateTouched: false,
  };
}

function getArabicSeatWord(count: number): string {
  return count >= 2 && count <= 10 ? 'مقاعد' : 'مقعد';
}

interface BusSelectorGridProps {
  capacities: CapacityCounts;
  value: BusKey | '';
  clickedFullMessage: string;
  availabilityVisibility: AvailabilityVisibility;
  onSelect: (key: BusKey) => void;
  ariaLabel: string;
  compact?: boolean;
}

function BusSelectorGrid({
  capacities,
  value,
  clickedFullMessage,
  availabilityVisibility,
  onSelect,
  ariaLabel,
  compact = false,
}: BusSelectorGridProps) {
  return (
    <div>
      <div
        className={`grid grid-cols-1 ${compact ? 'gap-2.5 sm:grid-cols-2' : 'gap-3 sm:grid-cols-2'}`}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {BUS_LIST.map((bus) => {
          const stat = capacities.buses[bus.key];
          const busLimit = stat.limit ?? capacities.busLimits?.[bus.key] ?? BUS_CAPACITY;
          const isSelected = value === bus.key;
          const fillPercent =
            busLimit > 0 ? Math.min(100, Math.round((stat.confirmed / busLimit) * 100)) : 100;
          const remainingWord = getArabicSeatWord(stat.remaining);
          const isBusAvailabilityVisible = availabilityVisibility[bus.key];
          const showFullState = isBusAvailabilityVisible && stat.isFull;

          return (
            <button
              key={bus.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={stat.isFull}
              onClick={() => onSelect(bus.key)}
              className={`flex flex-col ${compact ? 'gap-2 p-3' : 'gap-2.5 p-4'} rounded-lg border text-right transition-colors ${
                showFullState
                  ? 'border-red-200 bg-red-50/50 text-[#7A6F64] cursor-not-allowed'
                  : isSelected
                    ? 'border-[#9A5B25] bg-[#FAF4EC] cursor-pointer'
                    : 'border-[#E4DDD2] bg-white hover:border-[#C8BCAE] cursor-pointer'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span
                  className={`flex items-center gap-2 font-display ${
                    compact ? 'text-sm' : 'text-base'
                  } font-bold text-[#1E1A16]`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      showFullState
                        ? 'border-red-300 bg-red-100'
                        : isSelected
                          ? 'border-[#9A5B25] bg-[#9A5B25]'
                          : 'border-[#B9AFA2]'
                    }`}
                  >
                    {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>
                  <span>{bus.label}</span>
                </span>

                {isBusAvailabilityVisible &&
                  (stat.isFull ? (
                    <span className="text-xs font-extrabold text-red-700 whitespace-nowrap">
                      غير متاح
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                      متاح
                    </span>
                  ))}
              </div>

              {isBusAvailabilityVisible && (
                <>
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      dir="ltr"
                      className={`font-mono-num font-bold tabular-nums ${
                        stat.isFull ? 'text-red-700' : 'text-[#7C4518]'
                      }`}
                    >
                      ({stat.confirmed}/{busLimit})
                    </span>
                    <span
                      className={`font-semibold ${stat.isFull ? 'text-red-700' : 'text-[#4E463D]'}`}
                    >
                      {stat.isFull
                        ? 'متبقي 0 مقعد · البص اتملا'
                        : `متبقي ${stat.remaining} ${remainingWord}`}
                    </span>
                  </div>

                  <svg
                    viewBox="0 0 100 4"
                    preserveAspectRatio="none"
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <rect x="0" y="0" width="100" height="4" rx="2" className="fill-[#ECE6DC]" />
                    <rect
                      x={100 - fillPercent}
                      y="0"
                      width={fillPercent}
                      height="4"
                      rx="2"
                      className={stat.isFull ? 'fill-red-600' : 'fill-[#9A5B25]'}
                    />
                  </svg>
                </>
              )}
            </button>
          );
        })}
      </div>

      {clickedFullMessage && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{clickedFullMessage}</span>
        </p>
      )}
    </div>
  );
}

interface ColorSelectorGridProps {
  capacities: CapacityCounts;
  value: ColorGroupKey | '';
  clickedFullMessage: string;
  availabilityVisibility: AvailabilityVisibility;
  onSelect: (key: ColorGroupKey) => void;
  ariaLabel: string;
  compact?: boolean;
}

function ColorSelectorGrid({
  capacities,
  value,
  clickedFullMessage,
  availabilityVisibility,
  onSelect,
  ariaLabel,
  compact = false,
}: ColorSelectorGridProps) {
  return (
    <div>
      <div
        className={`grid grid-cols-1 ${compact ? 'gap-2 sm:grid-cols-2' : 'gap-3 sm:grid-cols-2'}`}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {COLOR_GROUP_LIST.map((group) => {
          const stat = capacities.colors[group.key];
          const colorLimit =
            stat.limit ?? capacities.colorLimits?.[group.key] ?? COLOR_GROUP_CAPACITY;
          const isSelected = value === group.key;
          const fillPercent =
            colorLimit > 0 ? Math.min(100, Math.round((stat.confirmed / colorLimit) * 100)) : 100;
          const remainingWord = getArabicSeatWord(stat.remaining);
          const isColorAvailabilityVisible = availabilityVisibility[group.key];
          const showFullState = isColorAvailabilityVisible && stat.isFull;

          return (
            <button
              key={group.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={stat.isFull}
              onClick={() => onSelect(group.key)}
              className={`flex flex-col ${
                compact ? 'gap-1.5 px-3 py-2.5' : 'gap-2.5 px-4 py-3.5'
              } rounded-lg border text-right transition-colors ${
                showFullState
                  ? 'border-red-200 bg-red-50/50 cursor-not-allowed'
                  : isSelected
                    ? `${group.borderClass} ${group.softBgClass} cursor-pointer`
                    : 'border-[#E4DDD2] bg-white hover:border-[#C8BCAE] cursor-pointer'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-3.5 w-3.5 shrink-0 rounded-sm ${group.swatchClass} ${
                      showFullState ? 'opacity-50' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <p className="font-display text-sm font-bold text-[#1E1A16]">
                    قروب {LABELS.colors[group.key]}
                  </p>
                </div>

                {isColorAvailabilityVisible &&
                  (stat.isFull ? (
                    <span className="text-xs font-extrabold text-red-700 whitespace-nowrap">
                      غير متاح
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                      متاح
                    </span>
                  ))}
              </div>

              {isColorAvailabilityVisible && (
                <>
                  <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs">
                    <span
                      dir="ltr"
                      className={`font-mono-num font-bold tabular-nums ${
                        stat.isFull ? 'text-red-700' : 'text-[#5C5349]'
                      }`}
                    >
                      ({stat.confirmed}/{colorLimit})
                    </span>
                    <span
                      className={`font-semibold ${stat.isFull ? 'text-red-700' : 'text-[#4E463D]'}`}
                    >
                      {stat.isFull
                        ? 'متبقي 0 مقعد · القروب اكتمل'
                        : `متبقي ${stat.remaining} ${remainingWord}`}
                    </span>
                  </div>

                  <svg
                    viewBox="0 0 100 4"
                    preserveAspectRatio="none"
                    className="h-1.5 w-full overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <rect x="0" y="0" width="100" height="4" rx="2" className="fill-[#ECE6DC]" />
                    <rect
                      x={100 - fillPercent}
                      y="0"
                      width={fillPercent}
                      height="4"
                      rx="2"
                      className={stat.isFull ? 'fill-red-600' : group.fillClass}
                    />
                  </svg>
                </>
              )}
            </button>
          );
        })}
      </div>

      {clickedFullMessage && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{clickedFullMessage}</span>
        </p>
      )}
    </div>
  );
}

export interface SubmitBookingResult {
  ok: boolean;
  registrationClosed?: boolean;
  error?: string;
  created?: RegistrationRecord;
}

interface RegistrationViewProps {
  registrations: RegistrationRecord[];
  capacities: CapacityCounts;
  whatsappNumbers: WhatsAppConfig;
  availabilityVisibility: AvailabilityVisibility;
  registrationClosed: boolean;
  onSubmittingChange?: (submitting: boolean) => void;
  onRegistrationClosedDetected?: () => void;
  onAddRegistration: (
    record: RegistrationRecord,
    requestId: string,
    onRetryStatus?: RetryStatusCallback
  ) => Promise<SubmitBookingResult>;
}

export function RegistrationView({
  registrations,
  capacities,
  whatsappNumbers,
  availabilityVisibility,
  registrationClosed,
  onSubmittingChange,
  onRegistrationClosedDetected,
  onAddRegistration,
}: RegistrationViewProps) {
  const [fullName, setFullName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);

  const [phoneDigits, setPhoneDigits] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);

  const [birthDate, setBirthDate] = useState('');
  const [birthDateTouched, setBirthDateTouched] = useState(false);
  const maxBirthDate = useMemo(() => getTodayIsoDate(), []);

  const [regType, setRegType] = useState<'self' | 'group'>('self');
  const [companions, setCompanions] = useState<CompanionDraft[]>(() => [createEmptyCompanion()]);

  const [busChoice, setBusChoice] = useState<BusKey | ''>('');
  const [busClickedFull, setBusClickedFull] = useState<string>('');

  const [colorGroup, setColorGroup] = useState<ColorGroupKey | ''>('');
  const [colorClickedFull, setColorClickedFull] = useState<string>('');

  const [selectedPaymentOptionId, setSelectedPaymentOptionId] = useState<PaymentOptionId | ''>('');

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryStatusText, setRetryStatusText] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [confirmedBooking, setConfirmedBooking] = useState<RegistrationRecord | null>(null);
  const [copied, setCopied] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState<number | null>(null);
  const [autoRedirectDone, setAutoRedirectDone] = useState(false);
  const whatsappLinkRef = useRef<HTMLAnchorElement | null>(null);
  const manualRedirectRef = useRef(false);

  const totalPersons = regType === 'group' ? 1 + companions.length : 1;
  const totalPrice = totalPersons * TICKET_PRICE;

  const selectedPaymentOption = useMemo(
    () => PAYMENT_OPTIONS.find((opt) => opt.id === selectedPaymentOptionId) ?? null,
    [selectedPaymentOptionId]
  );
  const paymentMethod = selectedPaymentOption?.method ?? '';
  const assignedRecipient = selectedPaymentOption?.recipient ?? null;
  const assignedWhatsAppRaw =
    selectedPaymentOption && assignedRecipient
      ? whatsappNumbers[assignedRecipient]?.[selectedPaymentOption.method] ||
        DEFAULT_WHATSAPP_NUMBERS[assignedRecipient][selectedPaymentOption.method]
      : '';
  const assignedWhatsAppDisplay = assignedWhatsAppRaw
    ? `+${assignedWhatsAppRaw.replace(/^\+/, '')}`
    : '';

  useEffect(() => {
    onSubmittingChange?.(isSubmitting);
  }, [isSubmitting, onSubmittingChange]);

  useEffect(() => {
    if (busChoice && capacities.buses[busChoice].isFull) {
      setBusChoice('');
      setBusClickedFull('البص اتملا — يرجى اختيار الباص الآخر المتاح');
    }
  }, [capacities.buses, busChoice]);

  useEffect(() => {
    if (colorGroup && capacities.colors[colorGroup].isFull) {
      setColorGroup('');
      setColorClickedFull('القروب اتملا — يرجى اختيار قروب لوني آخر متاح');
    }
  }, [capacities.colors, colorGroup]);

  useEffect(() => {
    if (regType !== 'group') return;
    setCompanions((prev) => {
      let changed = false;
      const next = prev.map((comp) => {
        let updated = comp;
        if (comp.bus && capacities.buses[comp.bus].isFull) {
          changed = true;
          updated = {
            ...updated,
            bus: '',
            busClickedFull: 'البص اتملا — يرجى اختيار الباص الآخر المتاح',
          };
        }
        if (comp.colorGroup && capacities.colors[comp.colorGroup].isFull) {
          changed = true;
          updated = {
            ...updated,
            colorGroup: '',
            colorClickedFull: 'القروب اتملا — يرجى اختيار قروب لوني آخر متاح',
          };
        }
        return updated;
      });
      return changed ? next : prev;
    });
  }, [capacities, regType]);

  useEffect(() => {
    if (formError) setFormError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    totalPersons,
    busChoice,
    colorGroup,
    selectedPaymentOptionId,
    fullName,
    phoneDigits,
    birthDate,
    companions,
    regType,
  ]);

  const existingActiveSets = useMemo(
    () => getActiveExistingSets(registrations),
    [registrations]
  );

  // Track duplicates within the current form (main attendee + companions in group mode)
  const intraFormCounts = useMemo(() => {
    const names = new Map<string, number>();
    const phones = new Map<string, number>();

    const mainNameKey = normalizeArabicText(fullName);
    if (mainNameKey) names.set(mainNameKey, (names.get(mainNameKey) ?? 0) + 1);
    const mainPhoneKey = normalizePhoneKey(phoneDigits);
    if (mainPhoneKey) phones.set(mainPhoneKey, (phones.get(mainPhoneKey) ?? 0) + 1);

    if (regType === 'group') {
      for (const comp of companions) {
        const cNameKey = normalizeArabicText(comp.name);
        if (cNameKey) names.set(cNameKey, (names.get(cNameKey) ?? 0) + 1);
        const cPhoneKey = normalizePhoneKey(comp.phone);
        if (cPhoneKey) phones.set(cPhoneKey, (phones.get(cPhoneKey) ?? 0) + 1);
      }
    }

    return { names, phones };
  }, [fullName, phoneDigits, regType, companions]);

  const getMemberNameError = (rawName: string): string => {
    const base = validateTripleName(rawName);
    if (!base.valid) return base.message;
    const key = normalizeArabicText(rawName);
    if (key && existingActiveSets.names.has(key)) {
      return 'تم تسجيل هذا الاسم من قبل — الاسم ده موجود بالفعل';
    }
    if (regType === 'group' && key && (intraFormCounts.names.get(key) ?? 0) > 1) {
      return 'الاسم مكرر داخل نفس الحجز — يجب كتابة اسم مختلف لكل شخص';
    }
    return '';
  };

  const getMemberPhoneError = (rawPhone: string): string => {
    const base = validateEgyptianPhone(rawPhone);
    if (!base.valid) return base.message;
    const key = normalizePhoneKey(rawPhone);
    if (key && existingActiveSets.phones.has(key)) {
      return 'الرقم ده متسجل وموجود بالفعل — يرجى إدخال رقم هاتف مختلف';
    }
    if (regType === 'group' && key && (intraFormCounts.phones.get(key) ?? 0) > 1) {
      return 'الرقم ده متسجل وموجود لمشارك آخر في نفس الحجز — يجب أن يكتب كل مرافق رقمه الخاص';
    }
    return '';
  };

  const mainNameError = getMemberNameError(fullName);
  const mainNameValid = mainNameError === '';
  const mainPhoneError = getMemberPhoneError(phoneDigits);
  const mainPhoneValid = mainPhoneError === '';
  const mainBirthDateResult = validateBirthDate(birthDate);
  const mainBirthDateError = mainBirthDateResult.valid ? '' : mainBirthDateResult.message;
  const mainBirthDateValid = mainBirthDateResult.valid;

  const selectionDemand = useMemo(() => {
    const buses: Record<BusKey, number> = { bus1: 0, bus2: 0 };
    const colors: Record<ColorGroupKey, number> = { pink: 0, black: 0, yellow: 0, green: 0 };

    if (busChoice) buses[busChoice] += 1;
    if (colorGroup) colors[colorGroup] += 1;

    if (regType === 'group') {
      for (const comp of companions) {
        if (comp.bus) buses[comp.bus] += 1;
        if (comp.colorGroup) colors[comp.colorGroup] += 1;
      }
    }

    return { buses, colors };
  }, [busChoice, colorGroup, regType, companions]);

  const capacityOverflowMessages = useMemo(() => {
    const msgs: string[] = [];
    for (const b of BUS_LIST) {
      const need = selectionDemand.buses[b.key];
      const stat = capacities.buses[b.key];
      if (need > 0 && !stat.isFull && need > stat.remaining) {
        msgs.push(
          availabilityVisibility[b.key]
            ? `لا يمكن تسجيل ${need} أفراد في ${b.label} — المتبقي حالياً ${stat.remaining} ${getArabicSeatWord(stat.remaining)} فقط. يرجى تغيير الباص لبعض الأفراد.`
            : `لا يمكن تسجيل ${need} أفراد في ${b.label} لعدم توفر مقاعد كافية حالياً. يرجى تغيير الباص لبعض الأفراد.`
        );
      }
    }
    for (const c of COLOR_GROUP_LIST) {
      const need = selectionDemand.colors[c.key];
      const stat = capacities.colors[c.key];
      if (need > 0 && !stat.isFull && need > stat.remaining) {
        msgs.push(
          availabilityVisibility[c.key]
            ? `لا يمكن تسجيل ${need} أفراد في قروب ${LABELS.colors[c.key]} — المتبقي حالياً ${stat.remaining} ${getArabicSeatWord(stat.remaining)} فقط. يرجى تغيير اللون لبعض الأفراد.`
            : `لا يمكن تسجيل ${need} أفراد في قروب ${LABELS.colors[c.key]} لعدم توفر مقاعد كافية حالياً. يرجى تغيير اللون لبعض الأفراد.`
        );
      }
    }
    return msgs;
  }, [selectionDemand, capacities, availabilityVisibility]);

  const scrollToForm = () => {
    const formSection = document.getElementById('registration-form');
    if (formSection) {
      formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      document.getElementById('fullName')?.focus({ preventScroll: true });
    }, 450);
  };

  const updateCompanion = (keyId: string, patch: Partial<CompanionDraft>) => {
    setCompanions((prev) => prev.map((c) => (c.keyId === keyId ? { ...c, ...patch } : c)));
  };

  const addCompanion = () => {
    setCompanions((prev) => [...prev, createEmptyCompanion()]);
  };

  const removeCompanion = (keyId: string) => {
    setCompanions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.keyId !== keyId);
    });
  };

  const handleSelectBus = (key: BusKey) => {
    const stat = capacities.buses[key];
    if (stat.isFull) {
      setBusClickedFull('البص اتملا');
      return;
    }
    setBusClickedFull('');
    setBusChoice(key);
  };

  const handleSelectColor = (key: ColorGroupKey) => {
    const stat = capacities.colors[key];
    if (stat.isFull) {
      setColorClickedFull('القروب اتملا');
      return;
    }
    setColorClickedFull('');
    setColorGroup(key);
  };

  const handleSelectCompanionBus = (keyId: string, key: BusKey) => {
    const stat = capacities.buses[key];
    if (stat.isFull) {
      updateCompanion(keyId, { busClickedFull: 'البص اتملا' });
      return;
    }
    updateCompanion(keyId, { bus: key, busClickedFull: '' });
  };

  const handleSelectCompanionColor = (keyId: string, key: ColorGroupKey) => {
    const stat = capacities.colors[key];
    if (stat.isFull) {
      updateCompanion(keyId, { colorClickedFull: 'القروب اتملا' });
      return;
    }
    updateCompanion(keyId, { colorGroup: key, colorClickedFull: '' });
  };

  const resetForm = () => {
    setFullName('');
    setNameTouched(false);
    setPhoneDigits('');
    setPhoneTouched(false);
    setBirthDate('');
    setBirthDateTouched(false);
    setRegType('self');
    setCompanions([createEmptyCompanion()]);
    setBusChoice('');
    setBusClickedFull('');
    setColorGroup('');
    setColorClickedFull('');
    setSelectedPaymentOptionId('');
    setSubmitAttempted(false);
    setRetryStatusText('');
    setFormError('');
    setConfirmedBooking(null);
    setCopied(false);
    setRedirectSeconds(null);
    setAutoRedirectDone(false);
    manualRedirectRef.current = false;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitAttempted(true);
    setFormError('');

    if (!mainNameValid) {
      setFormError(mainNameError);
      return;
    }

    if (!mainPhoneValid) {
      setFormError(mainPhoneError);
      return;
    }

    if (!mainBirthDateValid) {
      setFormError(mainBirthDateError);
      return;
    }

    if (!busChoice) {
      setFormError(
        regType === 'group'
          ? 'يرجى اختيار الباص للمشترك الرئيسي'
          : 'يرجى اختيار باص واحد متاح للرحلة'
      );
      return;
    }

    const mainBusStat = capacities.buses[busChoice];
    if (mainBusStat.isFull) {
      setBusClickedFull('البص اتملا');
      setFormError('البص اتملا — لا يمكن إتمام التسجيل في هذا الباص');
      return;
    }

    if (!colorGroup) {
      setFormError(
        regType === 'group'
          ? 'يرجى اختيار القروب اللوني للمشترك الرئيسي'
          : 'يرجى اختيار قروب لوني واحد متاح'
      );
      return;
    }

    const mainColorStat = capacities.colors[colorGroup];
    if (mainColorStat.isFull) {
      setColorClickedFull('القروب اتملا');
      setFormError('القروب اتملا — لا يمكن إتمام التسجيل في هذا القروب');
      return;
    }

    if (regType === 'group') {
      for (let i = 0; i < companions.length; i++) {
        const comp = companions[i];
        const cNameErr = getMemberNameError(comp.name);
        if (cNameErr) {
          setFormError(`المرافق ${i + 1}: ${cNameErr}`);
          return;
        }
        const cPhoneErr = getMemberPhoneError(comp.phone);
        if (cPhoneErr) {
          setFormError(`المرافق ${i + 1}: ${cPhoneErr}`);
          return;
        }
        const cBirthRes = validateBirthDate(comp.birthDate);
        if (!cBirthRes.valid) {
          setFormError(`المرافق ${i + 1}: ${cBirthRes.message}`);
          return;
        }
        if (!comp.bus) {
          setFormError(`المرافق ${i + 1}: يرجى اختيار الباص`);
          return;
        }
        if (capacities.buses[comp.bus].isFull) {
          updateCompanion(comp.keyId, { busClickedFull: 'البص اتملا' });
          setFormError(`المرافق ${i + 1}: البص اتملا — يرجى اختيار الباص الآخر`);
          return;
        }
        if (!comp.colorGroup) {
          setFormError(`المرافق ${i + 1}: يرجى اختيار القروب اللوني`);
          return;
        }
        if (capacities.colors[comp.colorGroup].isFull) {
          updateCompanion(comp.keyId, { colorClickedFull: 'القروب اتملا' });
          setFormError(`المرافق ${i + 1}: القروب اتملا — يرجى اختيار قروب لوني آخر`);
          return;
        }
      }
    }

    if (capacityOverflowMessages.length > 0) {
      setFormError(capacityOverflowMessages[0]);
      return;
    }

    if (!paymentMethod || !assignedRecipient) {
      setFormError('يرجى اختيار طريقة الدفع');
      return;
    }

    const regId = Date.now();
    const members: MemberRecord[] = [
      {
        id: `${regId}_0`,
        name: fullName.trim().replace(/\s+/g, ' '),
        phone: formatEgyptianPhone(phoneDigits),
        birthDate: birthDate.trim(),
        isMain: true,
        paid: false,
        cancelled: false,
        bus: busChoice,
        colorGroup,
      },
    ];

    if (regType === 'group') {
      companions.forEach((comp, idx) => {
        const cBus = comp.bus as BusKey;
        const cColor = comp.colorGroup as ColorGroupKey;
        members.push({
          id: `${regId}_${idx + 1}`,
          name: comp.name.trim().replace(/\s+/g, ' '),
          phone: formatEgyptianPhone(comp.phone),
          birthDate: comp.birthDate.trim(),
          isMain: false,
          paid: false,
          cancelled: false,
          bus: cBus,
          colorGroup: cColor,
        });
      });
    }

    const requestId = generateRequestId();
    const newRecord: RegistrationRecord = {
      id: regId,
      requestId,
      isGroup: regType === 'group',
      members,
      bus: busChoice,
      colorGroup,
      recipient: assignedRecipient,
      paymentMethod,
      timestamp: new Date().toLocaleString('ar-EG'),
    };

    setIsSubmitting(true);
    setRetryStatusText('');
    try {
      const result = await onAddRegistration(newRecord, requestId, (attempt) => {
        setRetryStatusText(
          `جاري تثبيت حجزك في الطابور... يرجى عدم إغلاق الصفحة (محاولة ${attempt})`
        );
      });
      if (!result.ok) {
        if (result.registrationClosed) {
          onRegistrationClosedDetected?.();
          return;
        }
        setFormError(result.error || 'تعذر حفظ التسجيل، يرجى المحاولة مرة أخرى.');
        return;
      }
      setConfirmedBooking(result.created ?? newRecord);
      document
        .getElementById('registration-form')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setIsSubmitting(false);
      setRetryStatusText('');
    }
  };

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const whatsappDetails = confirmedBooking
    ? buildWhatsAppDetails(confirmedBooking, whatsappNumbers)
    : null;

  useEffect(() => {
    if (!confirmedBooking || !whatsappDetails) return;

    manualRedirectRef.current = false;
    setAutoRedirectDone(false);
    setRedirectSeconds(1);

    const redirectTimer = window.setTimeout(() => {
      if (manualRedirectRef.current) return;
      setRedirectSeconds(0);
      setAutoRedirectDone(true);

      let inIframe = false;
      try {
        inIframe = window.self !== window.top;
      } catch {
        inIframe = true;
      }

      if (inIframe) {
        whatsappLinkRef.current?.click();
      } else {
        window.location.assign(whatsappDetails.url);
      }
    }, 1200);

    return () => {
      window.clearTimeout(redirectTimer);
    };
  }, [confirmedBooking, whatsappDetails?.url]);

  if (registrationClosed) {
    return <RegistrationClosedScreen />;
  }

  return (
    <div className="space-y-10 pb-16 pt-8 md:pt-12">
      {/* Unified Hero Header with Direct Scroll-to-Registration CTA */}
      <section className="mx-auto max-w-[960px] text-center">
        <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-[#7C4518] sm:text-5xl lg:text-6xl">
          اجتماع شباب الثلاثة فتية
        </h1>

        <p className="mt-4 font-display text-xl font-bold text-[#1E1A16] sm:text-2xl lg:text-3xl">
          رحلة دير القديس العظيم الأنبا أنطونيوس بالبحر الأحمر
        </p>

        <p className="mt-3 text-base font-medium text-[#5C5349]">
          قيمة الاشتراك:{' '}
          <strong className="font-mono-num text-lg font-bold text-[#1E1A16]">
            {TICKET_PRICE} جنيه للفرد
          </strong>
        </p>

        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={scrollToForm}
            className="inline-flex min-h-[48px] items-center gap-2.5 rounded-lg bg-[#9A5B25] px-8 py-3 text-base font-bold text-white transition-colors hover:bg-[#7C4518] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A5B25] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>سجّل الآن</span>
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* Exact 960x740 Monastery Image directly above the registration details */}
      <MonasteryBannerImage caption="بوابة دير القديس العظيم الأنبا أنطونيوس العامر — البحر الأحمر" />

      {/* Registration Details & Form Directly Below the Image */}
      <section id="registration-form" className="mx-auto max-w-[820px] scroll-mt-24">
        {confirmedBooking && whatsappDetails ? (
          <div className="rounded-xl border border-emerald-200 bg-white p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold text-[#1E1A16]">
                تم تسجيل بيانات الحجز بنجاح
              </h2>
              {(typeof confirmedBooking.seqNo === 'number' || confirmedBooking.timestamp) && (
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-xs">
                  {typeof confirmedBooking.seqNo === 'number' && confirmedBooking.seqNo > 0 && (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-900">
                      رقم الطابور:{' '}
                      <strong className="font-mono-num">#{confirmedBooking.seqNo}</strong>
                    </span>
                  )}
                  {confirmedBooking.timestamp && (
                    <span className="rounded-md border border-[#E4DDD2] bg-[#FAF8F4] px-2.5 py-1 font-medium text-[#4E463D]">
                      وقت التثبيت:{' '}
                      <strong className="font-mono-num" dir="ltr">
                        {confirmedBooking.timestamp}
                      </strong>
                    </span>
                  )}
                </div>
              )}
              <p className="mt-2 text-sm text-[#5C5349]">
                كود الحجز:{' '}
                <strong className="font-mono-num text-[#1E1A16]">{confirmedBooking.id}</strong> ·
                يرجى الضغط على زر الواتساب أدناه لإرسال رسالة التأكيد وإتمام الدفع لدى{' '}
                <strong>{LABELS.recipients[confirmedBooking.recipient]}</strong> على الرقم{' '}
                <strong className="font-mono-num text-[#1E1A16]" dir="ltr">
                  +{whatsappDetails.phoneNum}
                </strong>
                .
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 border-y border-[#ECE6DC] py-5 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-[#6B6155]">الباص والمجموعة</p>
                <p className="mt-1 font-bold text-[#1E1A16]">
                  {hasMixedMemberAssignments(confirmedBooking)
                    ? 'متعدد (موضح لكل فرد أدناه)'
                    : `${LABELS.buses[confirmedBooking.bus]} · قروب ${LABELS.colors[confirmedBooking.colorGroup]}`}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B6155]">المسؤول ووسيلة الدفع</p>
                <div className="mt-1 flex items-center gap-2 font-bold text-[#1E1A16]">
                  <PaymentMethodIcon
                    method={confirmedBooking.paymentMethod}
                    className="h-6 w-6 shrink-0"
                  />
                  <span>
                    {LABELS.recipients[confirmedBooking.recipient]} ·{' '}
                    {LABELS.payments[confirmedBooking.paymentMethod]}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#6B6155]">الإجمالي المطلوب</p>
                <p className="mt-1 font-mono-num text-base font-bold text-[#9A5B25]">
                  {confirmedBooking.members.length * TICKET_PRICE} جنيه (
                  {confirmedBooking.members.length}{' '}
                  {confirmedBooking.members.length === 1 ? 'فرد' : 'أفراد'})
                </p>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold text-[#6B6155]">الأفراد المسجلون في هذا الحجز</p>
              <div className="mt-2 divide-y divide-[#EFEAE1] rounded-lg border border-[#E4DDD2] bg-[#FAF8F4]">
                {confirmedBooking.members.map((m) => {
                  const mBus = getMemberBus(m, confirmedBooking);
                  const mColor = getMemberColor(m, confirmedBooking);
                  const mColorMeta = COLOR_GROUP_LIST.find((c) => c.key === mColor);
                  return (
                    <div
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#1E1A16]">
                          {m.name}{' '}
                          <span className="text-xs font-normal text-[#6B6155]">
                            ({m.isMain ? 'المشترك الرئيسي' : 'مرافق'})
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded border border-[#E4DDD2] bg-white px-2 py-0.5 text-xs font-semibold text-[#4E463D]">
                          <span>{LABELS.buses[mBus]}</span>
                          <span aria-hidden="true">·</span>
                          {mColorMeta && (
                            <span className={`h-2 w-2 rounded-xs ${mColorMeta.swatchClass}`} />
                          )}
                          <span>قروب {LABELS.colors[mColor]}</span>
                        </span>
                      </div>
                      <span className="font-mono-num text-xs text-[#4E463D]" dir="ltr">
                        {m.phone}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold text-[#6B6155]">نص رسالة تأكيد الواتساب</p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-[#E4DDD2] bg-[#FAF8F4] p-4 font-sans text-sm leading-relaxed text-[#2C2620]">
                {whatsappDetails.message}
              </pre>
            </div>

            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-center text-xs font-semibold text-emerald-900">
              {autoRedirectDone ? (
                <span>
                  تم تحويلك إلى واتساب ({LABELS.recipients[confirmedBooking.recipient]}) تلقائياً —
                  إذا لم يُفتح التطبيق اضغط زر التحويل أدناه.
                </span>
              ) : (
                <span>
                  سيتم تحويلك تلقائياً إلى واتساب ({LABELS.recipients[confirmedBooking.recipient]})
                  خلال <strong className="font-mono-num">{redirectSeconds ?? 2}</strong> ثانية...
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                ref={whatsappLinkRef}
                href={whatsappDetails.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  manualRedirectRef.current = true;
                  setRedirectSeconds(0);
                  setAutoRedirectDone(true);
                }}
                className="inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-800 whitespace-nowrap"
              >
                <span>التحويل إلى واتساب ({LABELS.recipients[confirmedBooking.recipient]})</span>
                <ExternalLink className="h-4 w-4" />
              </a>

              <button
                type="button"
                onClick={() => handleCopyMessage(whatsappDetails.message)}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-[#D8CFC0] bg-white px-5 py-3 text-sm font-semibold text-[#1E1A16] transition-colors hover:bg-[#F5F1E9] whitespace-nowrap cursor-pointer"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-700" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span>{copied ? 'تم النسخ' : 'نسخ الرسالة'}</span>
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-[#D8CFC0] bg-white px-5 py-3 text-sm font-semibold text-[#5C5349] transition-colors hover:bg-[#F5F1E9] whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>تسجيل حجز جديد</span>
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="rounded-xl border border-[#E4DDD2] bg-white p-6 sm:p-8"
          >
            <div className="mb-6 border-b border-[#ECE6DC] pb-4 text-center">
              <h2 className="font-display text-2xl font-extrabold text-[#1E1A16]">
                استمارة التسجيل في الرحلة
              </h2>
              <p className="mt-1 text-xs text-[#6B6155]">
                املأ البيانات التالية بدقة ثم اضغط تأكيد التسجيل للتحويل مباشرة إلى الواتساب.
              </p>
            </div>

            {/* Section 1: Registration Type */}
            <div>
              <h3 className="font-display text-lg font-bold text-[#1E1A16]">1. نوع التسجيل</h3>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setRegType('self')}
                  aria-pressed={regType === 'self'}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3.5 text-right transition-colors cursor-pointer ${
                    regType === 'self'
                      ? 'border-[#9A5B25] bg-[#FAF4EC] text-[#1E1A16]'
                      : 'border-[#E4DDD2] bg-white text-[#5C5349] hover:border-[#C8BCAE]'
                  }`}
                >
                  <UserPlus
                    className={`h-5 w-5 shrink-0 ${
                      regType === 'self' ? 'text-[#9A5B25]' : 'text-[#8C8173]'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-bold text-[#1E1A16]">تسجيل فردي (لنفسي فقط)</p>
                    <p className="text-xs text-[#6B6155]">فرد واحد · 250 جنيه</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRegType('group')}
                  aria-pressed={regType === 'group'}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3.5 text-right transition-colors cursor-pointer ${
                    regType === 'group'
                      ? 'border-[#9A5B25] bg-[#FAF4EC] text-[#1E1A16]'
                      : 'border-[#E4DDD2] bg-white text-[#5C5349] hover:border-[#C8BCAE]'
                  }`}
                >
                  <Users
                    className={`h-5 w-5 shrink-0 ${
                      regType === 'group' ? 'text-[#9A5B25]' : 'text-[#8C8173]'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-bold text-[#1E1A16]">تسجيل لمجموعة</p>
                    <p className="text-xs text-[#6B6155]">
                      أنت + إضافة أي عدد من المرافقين — يمكن لكل شخص اختيار الباص والقروب اللوني الخاص به
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Section 2: Main Attendee (Always directly below Registration Type) */}
            <div className="mt-8 border-t border-[#ECE6DC] pt-7">
              <h3 className="font-display text-lg font-bold text-[#1E1A16]">
                2. بيانات المشترك الرئيسي
              </h3>
              <p className="mt-1 text-xs text-[#6B6155]">
                يجب كتابة الاسم ثلاثياً فقط، ورقم الهاتف مصرياً مكوناً من 10 أرقام بعد كود مصر +20.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="fullName"
                    className="mb-1.5 block text-sm font-semibold text-[#1E1A16]"
                  >
                    الاسم الثلاثي فقط <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (!nameTouched) setNameTouched(true);
                    }}
                    onBlur={() => setNameTouched(true)}
                    placeholder="مثال: مينا جرجس بولس"
                    aria-invalid={(nameTouched || submitAttempted) && !mainNameValid}
                    className={`w-full rounded-lg border px-3.5 py-2.5 text-sm text-[#1E1A16] transition-colors focus:outline-none ${
                      (nameTouched || submitAttempted) && !mainNameValid
                        ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                        : nameTouched && mainNameValid
                          ? 'border-emerald-600 bg-emerald-50/20 focus:border-emerald-700'
                          : 'border-[#D4CBBF] bg-white focus:border-[#9A5B25]'
                    }`}
                  />
                  {(nameTouched || submitAttempted) && !mainNameValid && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-red-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{mainNameError}</span>
                    </p>
                  )}
                  {nameTouched && mainNameValid && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>الاسم الثلاثي صحيح</span>
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="mb-1.5 block text-sm font-semibold text-[#1E1A16]"
                  >
                    رقم الهاتف المصري (واتساب) <span className="text-red-600">*</span>
                  </label>
                  <div
                    dir="ltr"
                    className={`flex items-stretch overflow-hidden rounded-lg border transition-colors ${
                      (phoneTouched || submitAttempted) && !mainPhoneValid
                        ? 'border-red-500 bg-red-50/40 focus-within:border-red-600'
                        : phoneTouched && mainPhoneValid
                          ? 'border-emerald-600 bg-emerald-50/20 focus-within:border-emerald-700'
                          : 'border-[#D4CBBF] bg-white focus-within:border-[#9A5B25]'
                    }`}
                  >
                    <span className="flex select-none items-center border-r border-[#E4DDD2] bg-[#F5F1E9] px-3 font-mono-num text-sm font-bold text-[#1E1A16]">
                      +20
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      value={phoneDigits}
                      onChange={(e) => {
                        const cleaned = normalizeDigits(e.target.value);
                        setPhoneDigits(cleaned);
                        if (!phoneTouched) setPhoneTouched(true);
                      }}
                      onBlur={() => setPhoneTouched(true)}
                      placeholder="10xxxxxxxx"
                      aria-invalid={(phoneTouched || submitAttempted) && !mainPhoneValid}
                      className="w-full bg-transparent px-3.5 py-2.5 font-mono-num text-sm text-[#1E1A16] focus:outline-none"
                    />
                  </div>
                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {(phoneTouched || submitAttempted) && !mainPhoneValid ? (
                        <p className="flex items-start gap-1.5 text-xs font-semibold text-red-700">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{mainPhoneError}</span>
                        </p>
                      ) : phoneTouched && mainPhoneValid ? (
                        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            رقم مصري صحيح (
                            <span className="font-mono-num" dir="ltr">
                              +20{phoneDigits}
                            </span>
                            )
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-[#7B7165]">
                          أدخل 10 أرقام بعد +20 بدون الصفر الأول (مثال: 1012345678)
                        </p>
                      )}
                    </div>
                    <span className="font-mono-num text-xs text-[#6B6155] shrink-0">
                      {phoneDigits.length}/10
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 max-w-sm">
                <label
                  htmlFor="birthDate"
                  className="mb-1.5 block text-sm font-semibold text-[#1E1A16]"
                >
                  تاريخ الميلاد <span className="text-red-600">*</span>
                </label>
                <input
                  id="birthDate"
                  type="date"
                  dir="ltr"
                  min="1920-01-01"
                  max={maxBirthDate}
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value);
                    if (!birthDateTouched) setBirthDateTouched(true);
                  }}
                  onBlur={() => setBirthDateTouched(true)}
                  aria-invalid={(birthDateTouched || submitAttempted) && !mainBirthDateValid}
                  className={`w-full rounded-lg border px-3.5 py-2.5 font-mono-num text-sm text-[#1E1A16] transition-colors focus:outline-none ${
                    (birthDateTouched || submitAttempted) && !mainBirthDateValid
                      ? 'border-red-500 bg-red-50/40 focus:border-red-600'
                      : birthDateTouched && mainBirthDateValid
                        ? 'border-emerald-600 bg-emerald-50/20 focus:border-emerald-700'
                        : 'border-[#D4CBBF] bg-white focus:border-[#9A5B25]'
                  }`}
                />
                {(birthDateTouched || submitAttempted) && !mainBirthDateValid && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-red-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{mainBirthDateError}</span>
                  </p>
                )}
                {birthDateTouched && mainBirthDateValid && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>تم إدخال تاريخ الميلاد بنجاح</span>
                  </p>
                )}
              </div>

              {regType === 'group' && (
                <div className="mt-5 space-y-4 rounded-lg border border-[#E4DDD2] bg-[#FAF8F4] p-4">
                  <div>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-bold text-[#1E1A16]">
                        اختيار الباص للمشترك الرئيسي <span className="text-red-600">*</span>
                      </p>
                      <span className="text-[11px] text-[#6B6155]">
                        لا يُحتسب المقعد إلا بعد تأكيد الدفع من المنظمين
                      </span>
                    </div>
                    <BusSelectorGrid
                      capacities={capacities}
                      value={busChoice}
                      clickedFullMessage={busClickedFull}
                      availabilityVisibility={availabilityVisibility}
                      onSelect={handleSelectBus}
                      ariaLabel="اختيار الباص للمشترك الرئيسي"
                      compact
                    />
                    {submitAttempted && !busChoice && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>يرجى اختيار الباص للمشترك الرئيسي</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold text-[#1E1A16]">
                      تحديد المجموعة اللونية للمشترك الرئيسي <span className="text-red-600">*</span>
                    </p>
                    <ColorSelectorGrid
                      capacities={capacities}
                      value={colorGroup}
                      clickedFullMessage={colorClickedFull}
                      availabilityVisibility={availabilityVisibility}
                      onSelect={handleSelectColor}
                      ariaLabel="تحديد المجموعة اللونية للمشترك الرئيسي"
                      compact
                    />
                    {submitAttempted && !colorGroup && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-700">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>يرجى اختيار القروب اللوني للمشترك الرئيسي</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 3 (Group Mode): Companions directly below Main Attendee */}
            {regType === 'group' && (
              <div className="mt-8 border-t border-[#ECE6DC] pt-7">
                <div className="rounded-lg border border-[#E4DDD2] bg-[#FAF8F4] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-display text-lg font-bold text-[#1E1A16]">
                        3. بيانات المرافقين
                      </h3>
                      <p className="mt-0.5 text-xs text-[#6B6155]">
                        أضف كل شخص مرافق معك بالضغط على «إضافة شخص جديد» — ويمكن لكل شخص اختيار الباص والمجموعة اللونية الخاصة به بشكل مستقل.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-[#E4DDD2] bg-white px-3.5 py-2 text-xs font-semibold text-[#4E463D] shrink-0">
                      <span>عدد المرافقين:</span>
                      <strong className="font-mono-num text-sm font-extrabold text-[#9A5B25]">
                        {companions.length}
                      </strong>
                      <span className="text-[#9E9386]">·</span>
                      <span>
                        الإجمالي:{' '}
                        <strong className="font-mono-num text-sm text-[#1E1A16]">
                          {totalPersons}
                        </strong>{' '}
                        أفراد
                      </span>
                    </div>
                  </div>

                  <div className="mt-3.5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-bold text-amber-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <span>
                      تنبيه هام: يجب على كل مرافق كتابة رقم هاتفه الخاص به — لا يُسمح بتكرار نفس
                      الاسم أو نفس رقم الهاتف لأكثر من شخص.
                    </span>
                  </div>

                  <div className="mt-5 divide-y divide-[#E4DDD2]">
                    {companions.map((comp, idx) => {
                      const cNameErr = getMemberNameError(comp.name);
                      const cPhoneErr = getMemberPhoneError(comp.phone);
                      const cBirthRes = validateBirthDate(comp.birthDate);
                      const cNameValid = cNameErr === '';
                      const cPhoneValid = cPhoneErr === '';
                      const cBirthValid = cBirthRes.valid;
                      const showNameErr = (comp.nameTouched || submitAttempted) && !cNameValid;
                      const showPhoneErr = (comp.phoneTouched || submitAttempted) && !cPhoneValid;
                      const showBirthErr =
                        (comp.birthDateTouched || submitAttempted) && !cBirthValid;

                      return (
                        <div key={comp.keyId} className={idx === 0 ? 'pb-5' : 'py-5'}>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-[#7C4518]">
                              المرافق {idx + 1}
                            </p>
                            {companions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeCompanion(comp.keyId)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>حذف الشخص</span>
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className="mb-1.5 block text-xs font-semibold text-[#1E1A16]">
                                الاسم الثلاثي فقط <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="text"
                                value={comp.name}
                                onChange={(e) =>
                                  updateCompanion(comp.keyId, {
                                    name: e.target.value,
                                    nameTouched: true,
                                  })
                                }
                                onBlur={() => updateCompanion(comp.keyId, { nameTouched: true })}
                                placeholder="مثال: بيشوي مجدي حنا"
                                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-[#1E1A16] focus:outline-none ${
                                  showNameErr
                                    ? 'border-red-500 bg-red-50/40'
                                    : comp.nameTouched && cNameValid
                                      ? 'border-emerald-600'
                                      : 'border-[#D4CBBF] focus:border-[#9A5B25]'
                                }`}
                              />
                              {showNameErr && (
                                <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-700">
                                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <span>{cNameErr}</span>
                                </p>
                              )}
                            </div>

                            <div>
                              <label className="mb-1.5 block text-xs font-semibold text-[#1E1A16]">
                                رقم الهاتف المصري الخاص بالمرافق <span className="text-red-600">*</span>
                              </label>
                              <div
                                dir="ltr"
                                className={`flex items-stretch overflow-hidden rounded-lg border bg-white ${
                                  showPhoneErr
                                    ? 'border-red-500 bg-red-50/40'
                                    : comp.phoneTouched && cPhoneValid
                                      ? 'border-emerald-600'
                                      : 'border-[#D4CBBF] focus-within:border-[#9A5B25]'
                                }`}
                              >
                                <span className="flex select-none items-center border-r border-[#E4DDD2] bg-[#F5F1E9] px-2.5 font-mono-num text-xs font-bold text-[#1E1A16]">
                                  +20
                                </span>
                                <input
                                  type="tel"
                                  inputMode="numeric"
                                  value={comp.phone}
                                  onChange={(e) =>
                                    updateCompanion(comp.keyId, {
                                      phone: normalizeDigits(e.target.value),
                                      phoneTouched: true,
                                    })
                                  }
                                  onBlur={() => updateCompanion(comp.keyId, { phoneTouched: true })}
                                  placeholder="10xxxxxxxx"
                                  className="w-full bg-transparent px-3 py-2 font-mono-num text-sm text-[#1E1A16] focus:outline-none"
                                />
                              </div>
                              <div className="mt-1 flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  {showPhoneErr ? (
                                    <p className="flex items-start gap-1 text-xs font-semibold text-red-700">
                                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                      <span>{cPhoneErr}</span>
                                    </p>
                                  ) : comp.phoneTouched && cPhoneValid ? (
                                    <p className="text-xs font-medium text-emerald-700">
                                      رقم مصري صحيح
                                    </p>
                                  ) : null}
                                </div>
                                <span className="font-mono-num text-[11px] text-[#6B6155]">
                                  {comp.phone.length}/10
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Companion Birth Date (directly after Name & Phone — no age displayed here) */}
                          <div className="mt-4 max-w-sm">
                            <label className="mb-1.5 block text-xs font-semibold text-[#1E1A16]">
                              تاريخ الميلاد الخاص بالمرافق <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="date"
                              dir="ltr"
                              min="1920-01-01"
                              max={maxBirthDate}
                              value={comp.birthDate}
                              onChange={(e) =>
                                updateCompanion(comp.keyId, {
                                  birthDate: e.target.value,
                                  birthDateTouched: true,
                                })
                              }
                              onBlur={() =>
                                updateCompanion(comp.keyId, { birthDateTouched: true })
                              }
                              aria-invalid={showBirthErr}
                              className={`w-full rounded-lg border bg-white px-3 py-2 font-mono-num text-sm text-[#1E1A16] focus:outline-none ${
                                showBirthErr
                                  ? 'border-red-500 bg-red-50/40'
                                  : comp.birthDateTouched && cBirthValid
                                    ? 'border-emerald-600'
                                    : 'border-[#D4CBBF] focus:border-[#9A5B25]'
                              }`}
                            />
                            {showBirthErr && (
                              <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-red-700">
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>{cBirthRes.message}</span>
                              </p>
                            )}
                            {comp.birthDateTouched && cBirthValid && (
                              <p className="mt-1 text-xs font-medium text-emerald-700">
                                تم إدخال تاريخ الميلاد بنجاح
                              </p>
                            )}
                          </div>

                          {/* Per-Companion Bus & Color Selection */}
                          <div className="mt-4 space-y-3.5 rounded-lg border border-[#E4DDD2] bg-white/80 p-3.5">
                            <div>
                              <p className="mb-2 text-xs font-bold text-[#1E1A16]">
                                اختيار الباص (المرافق {idx + 1}) <span className="text-red-600">*</span>
                              </p>
                              <BusSelectorGrid
                                capacities={capacities}
                                value={comp.bus}
                                clickedFullMessage={comp.busClickedFull}
                                availabilityVisibility={availabilityVisibility}
                                onSelect={(bKey) => handleSelectCompanionBus(comp.keyId, bKey)}
                                ariaLabel={`اختيار الباص للمرافق ${idx + 1}`}
                                compact
                              />
                              {submitAttempted && !comp.bus && (
                                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-700">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>يرجى اختيار الباص للمرافق {idx + 1}</span>
                                </p>
                              )}
                            </div>

                            <div>
                              <p className="mb-2 text-xs font-bold text-[#1E1A16]">
                                تحديد المجموعة اللونية (المرافق {idx + 1}){' '}
                                <span className="text-red-600">*</span>
                              </p>
                              <ColorSelectorGrid
                                capacities={capacities}
                                value={comp.colorGroup}
                                clickedFullMessage={comp.colorClickedFull}
                                availabilityVisibility={availabilityVisibility}
                                onSelect={(cKey) => handleSelectCompanionColor(comp.keyId, cKey)}
                                ariaLabel={`تحديد المجموعة اللونية للمرافق ${idx + 1}`}
                                compact
                              />
                              {submitAttempted && !comp.colorGroup && (
                                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-red-700">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>يرجى اختيار القروب اللوني للمرافق {idx + 1}</span>
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 border-t border-[#E4DDD2] pt-4">
                    <button
                      type="button"
                      onClick={addCompanion}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#9A5B25]/50 bg-white px-4 py-2.5 text-sm font-bold text-[#7C4518] transition-colors hover:border-[#9A5B25] hover:bg-[#FAF4EC] cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>إضافة شخص جديد</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3 & 4: Bus & Color Selection (Individual Mode Only — in Group Mode each member chooses directly under their own Name & Phone) */}
            {regType === 'self' && (
              <>
                <div className="mt-8 border-t border-[#ECE6DC] pt-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-[#1E1A16]">
                      3. اختيار الباص <span className="text-red-600">*</span>
                    </h3>
                    <span className="text-xs text-[#6B6155]">
                      اختر باصاً واحداً فقط · لا يُحتسب المقعد إلا بعد تأكيد الدفع من المنظمين
                    </span>
                  </div>

                  <div className="mt-4">
                    <BusSelectorGrid
                      capacities={capacities}
                      value={busChoice}
                      clickedFullMessage={busClickedFull}
                      availabilityVisibility={availabilityVisibility}
                      onSelect={handleSelectBus}
                      ariaLabel="اختيار الباص"
                    />
                  </div>
                </div>

                <div className="mt-8 border-t border-[#ECE6DC] pt-7">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-[#1E1A16]">
                      4. تحديد المجموعة اللونية <span className="text-red-600">*</span>
                    </h3>
                    <span className="text-xs text-[#6B6155]">
                      اختر لوناً واحداً فقط · لا يُحتسب المقعد إلا بعد تأكيد الدفع من المنظمين
                    </span>
                  </div>

                  <div className="mt-4">
                    <ColorSelectorGrid
                      capacities={capacities}
                      value={colorGroup}
                      clickedFullMessage={colorClickedFull}
                      availabilityVisibility={availabilityVisibility}
                      onSelect={handleSelectColor}
                      ariaLabel="تحديد المجموعة اللونية"
                    />
                  </div>
                </div>
              </>
            )}

            {capacityOverflowMessages.length > 0 && (
              <div className="mt-6 space-y-2">
                {capacityOverflowMessages.map((msg, idx) => (
                  <p
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-800"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{msg}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Payment Method with Icons & Explicit Organizer Account Cards */}
            <div className="mt-8 border-t border-[#ECE6DC] pt-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-[#1E1A16]">
                  {regType === 'group' ? '4' : '5'}. اختيار طريقة الدفع{' '}
                  <span className="text-red-600">*</span>
                </h3>
              </div>

              <div
                className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="طريقة الدفع"
              >
                {PAYMENT_OPTIONS.map((option) => {
                  const isSelected = selectedPaymentOptionId === option.id;
                  const rawPhone =
                    whatsappNumbers[option.recipient]?.[option.method] ||
                    DEFAULT_WHATSAPP_NUMBERS[option.recipient][option.method];
                  const formattedPhone = rawPhone
                    ? `+${rawPhone.replace(/^\+/, '')}`
                    : option.defaultPhoneDisplay;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedPaymentOptionId(option.id)}
                      className={`flex items-center gap-3.5 rounded-xl border p-3.5 text-right transition-colors cursor-pointer ${
                        isSelected
                          ? 'border-[#9A5B25] bg-[#FAF4EC] ring-1 ring-[#9A5B25]/25'
                          : 'border-[#E4DDD2] bg-white hover:border-[#C8BCAE]'
                      }`}
                    >
                      <PaymentMethodIcon method={option.method} className="h-11 w-11 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-sm font-extrabold text-[#1E1A16]">
                          {option.label} ({option.enLabel})
                        </p>
                        <p className="mt-1 text-xs font-semibold text-[#7C4518]">
                          الاسم: {option.recipientName}
                        </p>
                        <p className="mt-0.5 text-xs text-[#4E463D]">
                          رقم الهاتف:{' '}
                          <span className="font-mono-num font-bold text-[#1E1A16]" dir="ltr">
                            {formattedPhone}
                          </span>
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {paymentMethod && assignedRecipient && (
                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-[#DFD4C4] bg-[#FAF8F4] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <PaymentMethodIcon method={paymentMethod} className="h-9 w-9 shrink-0" />
                    <div>
                      <p className="flex items-center gap-1.5 text-xs text-[#6B6155]">
                        <UserCheck className="h-3.5 w-3.5 text-[#9A5B25]" />
                        <span>المسؤول عن استلام الاشتراك ({LABELS.payments[paymentMethod]})</span>
                      </p>
                      <p className="font-display text-base font-bold text-[#1E1A16]">
                        {LABELS.recipients[assignedRecipient]}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg border border-[#E4DDD2] bg-white px-3.5 py-2">
                    <Phone className="h-4 w-4 text-emerald-700 shrink-0" />
                    <span className="font-mono-num text-sm font-bold text-[#1E1A16]" dir="ltr">
                      {assignedWhatsAppDisplay}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Price Summary & Submit */}
            <div className="mt-8 border-t border-[#ECE6DC] pt-6">
              {formError && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex flex-col items-stretch justify-between gap-4 rounded-xl border border-[#E4DDD2] bg-[#FAF8F4] px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="text-[#5C5349]">
                    عدد الأفراد:{' '}
                    <strong className="font-mono-num text-base text-[#1E1A16]">
                      {totalPersons}
                    </strong>
                  </span>
                  <span className="text-[#5C5349]">
                    الإجمالي المطلوب:{' '}
                    <strong className="font-mono-num text-lg font-extrabold text-[#9A5B25]">
                      {totalPrice} جنيه
                    </strong>
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex min-h-[46px] items-center justify-center rounded-lg bg-[#9A5B25] px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-[#7C4518] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A5B25] disabled:opacity-70 cursor-pointer"
                >
                  {isSubmitting
                    ? retryStatusText || 'جارٍ تثبيت حجزك في الطابور... يرجى عدم إغلاق الصفحة'
                    : 'تأكيد التسجيل والتحويل للواتساب'}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
