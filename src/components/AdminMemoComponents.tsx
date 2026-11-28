import { memo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  BUS_LIST,
  COLOR_GROUP_LIST,
  LABELS,
  PAYMENT_METHOD_LIST,
  type AvailabilityVisibilityKey,
  type BusKey,
  type ColorGroupKey,
  type ManualUnavailableMap,
  type MemberRecord,
  type RegistrationRecord,
} from '../types/trip';
import {
  calculateAgeFromBirthDate,
  formatAgeArabic,
  getMemberBus,
  getMemberColor,
  getRegSummary,
  hasMixedMemberAssignments,
  normalizeArabicText,
  normalizePhoneKey,
  validateAdminMemberName,
  type CapacityCounts,
  type FinancialStats,
} from '../utils/validation';
import { PaymentMethodIcon } from './PaymentMethodIcon';

interface AdminFinancialCardsProps {
  mekhailStats: FinancialStats;
  fayezStats: FinancialStats;
  overallStats: FinancialStats;
}

export const AdminFinancialCards = memo(function AdminFinancialCards({
  mekhailStats,
  fayezStats,
  overallStats,
}: AdminFinancialCardsProps) {
  const summaryCards = [
    { key: 'mekhail', title: 'ميخائيل إدور', stats: mekhailStats },
    { key: 'fayez', title: 'فايز فيكتور', stats: fayezStats },
    { key: 'overall', title: 'الإجمالي العام للرحلة', stats: overallStats },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {summaryCards.map(({ key, title, stats }) => (
        <div key={key} className="rounded-xl border border-[#E4DDD2] bg-white p-5">
          <h2 className="font-display text-lg font-bold text-[#1E1A16]">{title}</h2>

          <div className="mt-4 space-y-2 text-sm tabular-nums">
            <div className="flex items-center justify-between">
              <span className="text-[#5C5349]">إجمالي المطلوب (النشطين)</span>
              <strong className="font-mono-num text-[#1E1A16]">
                {stats.expectedMoney} ج ({stats.activePersons} فرد)
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C5349]">تم الدفع (Approve)</span>
              <strong className="font-mono-num text-emerald-700">
                {stats.paidMoney} ج ({stats.paidPersons} فرد)
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C5349]">المتبقي (لم يدفع)</span>
              <strong className="font-mono-num text-amber-700">
                {stats.remainingMoney} ج ({stats.activePersons - stats.paidPersons} فرد)
              </strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#5C5349]">أفراد ملغيين</span>
              <strong className="font-mono-num text-red-700">{stats.cancelledPersons} فرد</strong>
            </div>
          </div>

          <div className="mt-4 border-t border-dashed border-[#DFD7CA] pt-3.5 text-xs tabular-nums">
            <p className="mb-2 font-semibold text-[#4E463D]">حسب طريقة الدفع (مدفوع / مطلوب)</p>
            <div className="space-y-1.5 text-[#5C5349]">
              {PAYMENT_METHOD_LIST.map((pm) => {
                const pStat = stats.byPayment[pm.key];
                return (
                  <div key={pm.key} className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#3E3730]">
                      {pm.key === 'instapay' ? `${pm.label} (${pm.enLabel})` : pm.label}
                    </span>
                    <span className="font-mono-num text-[#1E1A16]">
                      {pStat.paid} / {pStat.expected} ج ({pStat.persons} فرد)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

interface AdminCapacityBoardProps {
  capacities: CapacityCounts;
  manualUnavailable: ManualUnavailableMap;
  onToggleManualUnavailable: (key: AvailabilityVisibilityKey) => void;
}

const NEAR_CAPACITY_THRESHOLD_PCT = 80;

function getCapacityIndicator(confirmed: number, limit: number, isFull: boolean) {
  const fillPct =
    limit > 0 ? Math.min(100, Math.round((confirmed / limit) * 100)) : confirmed > 0 ? 100 : 0;
  const isNearFull = !isFull && fillPct >= NEAR_CAPACITY_THRESHOLD_PCT;
  const isWarning = isFull || isNearFull;

  let badgeClass = 'border-emerald-200 bg-emerald-50 text-emerald-800';
  let statusText = `${fillPct}%`;

  if (isFull) {
    badgeClass = 'border-red-700 bg-red-600 text-white';
    statusText = `${fillPct}% · مكتمل`;
  } else if (isNearFull) {
    badgeClass = 'border-red-300 bg-red-100 text-red-800';
    statusText = `${fillPct}% · اقترب من الاكتمال`;
  } else if (fillPct >= 50) {
    badgeClass = 'border-amber-200 bg-amber-50 text-amber-800';
    statusText = `${fillPct}%`;
  }

  return { fillPct, isNearFull, isWarning, badgeClass, statusText };
}

export const AdminCapacityBoard = memo(function AdminCapacityBoard({
  capacities,
  manualUnavailable,
  onToggleManualUnavailable,
}: AdminCapacityBoardProps) {
  const totalBusCap = capacities.buses.bus1.limit + capacities.buses.bus2.limit;
  const totalColorCap =
    capacities.colors.pink.limit +
    capacities.colors.black.limit +
    capacities.colors.yellow.limit +
    capacities.colors.green.limit;

  const warningItems: { label: string; pct: number; isFull: boolean }[] = [];
  for (const bus of BUS_LIST) {
    const stat = capacities.buses[bus.key];
    const ind = getCapacityIndicator(stat.confirmed, stat.limit, stat.isFull);
    if (ind.isWarning) {
      warningItems.push({ label: bus.label, pct: ind.fillPct, isFull: stat.isFull });
    }
  }
  for (const group of COLOR_GROUP_LIST) {
    const stat = capacities.colors[group.key];
    const ind = getCapacityIndicator(stat.confirmed, stat.limit, stat.isFull);
    if (ind.isWarning) {
      warningItems.push({
        label: `قروب ${LABELS.colors[group.key]}`,
        pct: ind.fillPct,
        isFull: stat.isFull,
      });
    }
  }

  return (
    <div className="rounded-xl border border-[#E4DDD2] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-[#1E1A16]">
          حالة المقاعد والقروبات (المؤكدين بالدفع فقط)
        </h2>
        <span className="text-xs text-[#6B6155] tabular-nums">
          إجمالي الباصات {totalBusCap} مقعد · إجمالي القروبات {totalColorCap} مقعد
        </span>
      </div>

      {warningItems.length > 0 && (
        <div
          role="status"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5 text-xs text-red-900"
        >
          <span className="inline-flex items-center gap-1.5 font-extrabold text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            <span>تنبيه امتلاء السعة:</span>
          </span>
          {warningItems.map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono-num text-[11px] font-bold tabular-nums ${
                item.isFull
                  ? 'border-red-700 bg-red-600 text-white'
                  : 'border-red-300 bg-white text-red-800'
              }`}
            >
              <span>{item.label}</span>
              <span>({item.pct}%)</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {BUS_LIST.map((bus) => {
          const stat = capacities.buses[bus.key];
          const ind = getCapacityIndicator(stat.confirmed, stat.limit, stat.isFull);
          const isManualOff = Boolean(manualUnavailable[bus.key]);
          return (
            <div
              key={bus.key}
              className={`rounded-lg border p-4 transition-colors ${
                ind.isWarning || isManualOff
                  ? 'border-red-300 bg-red-50/45'
                  : 'border-[#ECE6DC] bg-[#FAF8F4]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[#1E1A16]">{bus.label}</strong>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono-num text-[11px] font-extrabold tabular-nums ${ind.badgeClass}`}
                  >
                    {ind.isWarning && <AlertTriangle className="h-3 w-3 shrink-0" />}
                    <span>{ind.statusText}</span>
                  </span>
                  {isManualOff && (
                    <span className="inline-flex items-center rounded-md border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-800">
                      مغلق بالتسجيل
                    </span>
                  )}
                </div>
                <span
                  className={`font-mono-num text-xs font-bold tabular-nums ${
                    stat.isFull
                      ? 'text-red-700'
                      : ind.isNearFull
                        ? 'text-red-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {stat.isFull
                    ? `البص اتملا (${stat.confirmed}/${stat.limit})`
                    : `${stat.confirmed} / ${stat.limit} مؤكد · متبقي ${stat.remaining}`}
                </span>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#E6DFD3]">
                <div
                  className={`h-full transition-all duration-300 ${
                    stat.isFull
                      ? 'bg-red-600'
                      : ind.isNearFull
                        ? 'bg-red-500'
                        : 'bg-[#9A5B25]'
                  }`}
                  style={{ width: `${ind.fillPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[#6B6155] tabular-nums">
                بانتظار تأكيد الدفع:{' '}
                <strong className="font-mono-num text-[#1E1A16]">{stat.pending} فرد</strong>
              </p>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#E6DFD3]/90 pt-2.5">
                <div className="min-w-0">
                  <span
                    className={`block text-xs font-bold ${
                      isManualOff ? 'text-red-800' : 'text-[#4E463D]'
                    }`}
                  >
                    {isManualOff
                      ? 'غير متاح في صفحة التسجيل (مفعّل)'
                      : 'إظهار كـ «غير متاح» في صفحة التسجيل'}
                  </span>
                  <span className="block text-[10px] text-[#6B6155]">
                    {isManualOff
                      ? 'يظهر للزوار «غير متاح» فقط بدون أي أرقام مقاعد'
                      : 'عند التفعيل يظهر «غير متاح» بدون أرقام أو مقاعد متبقية'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isManualOff}
                  aria-label={`تفعيل حالة غير متاح لـ ${bus.label} في صفحة التسجيل`}
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

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {COLOR_GROUP_LIST.map((group) => {
          const stat = capacities.colors[group.key];
          const ind = getCapacityIndicator(stat.confirmed, stat.limit, stat.isFull);
          const isManualOff = Boolean(manualUnavailable[group.key]);
          return (
            <div
              key={group.key}
              className={`flex flex-col justify-between rounded-lg border p-3.5 transition-colors ${
                ind.isWarning || isManualOff
                  ? 'border-red-300 bg-red-50/45'
                  : 'border-[#ECE6DC] bg-[#FAF8F4]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 text-xs">
                  <span className="flex items-center gap-1.5 font-bold text-[#1E1A16]">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-xs ${group.swatchClass}`} />
                    <span>قروب {LABELS.colors[group.key]}</span>
                  </span>
                  <span
                    className={`font-mono-num font-bold tabular-nums ${
                      ind.isWarning ? 'text-red-700' : 'text-[#4E463D]'
                    }`}
                  >
                    {stat.confirmed}/{stat.limit}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono-num text-[10px] font-extrabold tabular-nums ${ind.badgeClass}`}
                  >
                    {ind.isWarning && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
                    <span>{ind.statusText}</span>
                  </span>
                  {stat.isFull && (
                    <span className="text-[10px] font-extrabold text-red-700">القروب اكتمل</span>
                  )}
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E6DFD3]">
                  <div
                    className={`h-full transition-all duration-300 ${
                      stat.isFull
                        ? 'bg-red-600'
                        : ind.isNearFull
                          ? 'bg-red-500'
                          : group.swatchClass
                    }`}
                    style={{
                      width: `${ind.fillPct}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-[#6B6155] tabular-nums">
                  متبقي {stat.remaining} · معلق {stat.pending}
                </p>
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-[#E6DFD3]/90 pt-2">
                <span
                  className={`text-[11px] font-bold leading-tight ${
                    isManualOff ? 'text-red-800' : 'text-[#4E463D]'
                  }`}
                >
                  {isManualOff ? 'غير متاح (مغلق)' : 'جعله غير متاح'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isManualOff}
                  aria-label={`تفعيل حالة غير متاح لقروب ${LABELS.colors[group.key]} في صفحة التسجيل`}
                  onClick={() => onToggleManualUnavailable(group.key)}
                  dir="ltr"
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 cursor-pointer ${
                    isManualOff
                      ? 'border-red-700 bg-red-600'
                      : 'border-[#C8BCAE] bg-[#D6CEC2]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      isManualOff ? 'translate-x-4.5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

interface RegistrationTableRowProps {
  reg: RegistrationRecord;
  capacities: CapacityCounts;
  duplicateNameCounts: Map<string, number>;
  duplicatePhoneCounts: Map<string, number>;
  deletingMemberId: string | null;
  deletingRegId: number | null;
  onQuickFilterText: (query: string) => void;
  onUpdateMemberName: (regId: number, memberId: string, newName: string) => Promise<string | null>;
  onTransferMember: (
    regId: number,
    memberId: string,
    newBus: BusKey,
    newColor: ColorGroupKey
  ) => Promise<string | null>;
  onTransferSuccess?: (message: string) => void;
  onToggleMemberPaid: (regId: number, memberId: string) => void;
  onToggleMemberCancelled: (regId: number, memberId: string) => void;
  onApproveAllInReg: (regId: number) => void;
  onCancelAllInReg: (regId: number) => void;
  onRequestDeleteMember: (regId: number, memberId: string, memberName: string) => void;
  onRequestDeleteRegistration: (reg: RegistrationRecord) => void;
}

export const RegistrationTableRow = memo(function RegistrationTableRow({
  reg,
  capacities,
  duplicateNameCounts,
  duplicatePhoneCounts,
  deletingMemberId,
  deletingRegId,
  onQuickFilterText,
  onUpdateMemberName,
  onTransferMember,
  onTransferSuccess,
  onToggleMemberPaid,
  onToggleMemberCancelled,
  onApproveAllInReg,
  onCancelAllInReg,
  onRequestDeleteMember,
  onRequestDeleteRegistration,
}: RegistrationTableRowProps) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editNameDraft, setEditNameDraft] = useState('');
  const [editError, setEditError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  const [transferringMemberId, setTransferringMemberId] = useState<string | null>(null);
  const [transferBusDraft, setTransferBusDraft] = useState<BusKey>('bus1');
  const [transferColorDraft, setTransferColorDraft] = useState<ColorGroupKey>('pink');
  const [transferError, setTransferError] = useState('');
  const [isSavingTransfer, setIsSavingTransfer] = useState(false);

  const isDeletingThisReg = deletingRegId === reg.id;

  const summary = getRegSummary(reg);
  const allCancelled = summary.activeCount === 0;
  const mixedAssignments = hasMixedMemberAssignments(reg);
  const primaryBus = reg.members[0] ? getMemberBus(reg.members[0], reg) : reg.bus;
  const primaryColor = reg.members[0] ? getMemberColor(reg.members[0], reg) : reg.colorGroup;
  const colorMeta = COLOR_GROUP_LIST.find((c) => c.key === primaryColor);

  const startEditingMember = (memberId: string, currentName: string) => {
    setTransferringMemberId(null);
    setTransferError('');
    setEditingMemberId(memberId);
    setEditNameDraft(currentName);
    setEditError('');
  };

  const cancelEditingMember = () => {
    if (isSavingName) return;
    setEditingMemberId(null);
    setEditNameDraft('');
    setEditError('');
  };

  const startTransferringMember = (member: MemberRecord) => {
    if (isSavingTransfer) return;
    if (transferringMemberId === member.id) {
      setTransferringMemberId(null);
      setTransferError('');
      return;
    }
    setEditingMemberId(null);
    setEditError('');
    setTransferringMemberId(member.id);
    setTransferBusDraft(getMemberBus(member, reg));
    setTransferColorDraft(getMemberColor(member, reg));
    setTransferError('');
  };

  const cancelTransferringMember = () => {
    if (isSavingTransfer) return;
    setTransferringMemberId(null);
    setTransferError('');
  };

  const handleSaveTransfer = async (member: MemberRecord) => {
    if (isSavingTransfer) return;
    const currentBus = getMemberBus(member, reg);
    const currentColor = getMemberColor(member, reg);

    if (transferBusDraft === currentBus && transferColorDraft === currentColor) {
      setTransferringMemberId(null);
      setTransferError('');
      return;
    }

    setIsSavingTransfer(true);
    setTransferError('');
    try {
      const err = await onTransferMember(reg.id, member.id, transferBusDraft, transferColorDraft);
      if (err) {
        setTransferError(err);
      } else {
        setTransferringMemberId(null);
        setTransferError('');
        onTransferSuccess?.('تم نقل الفرد وتحديث المقاعد بنجاح');
      }
    } finally {
      setIsSavingTransfer(false);
    }
  };

  const handleSaveMemberName = async (memberId: string, originalName: string) => {
    if (isSavingName) return;
    const trimmed = editNameDraft.trim().replace(/\s+/g, ' ');
    const validation = validateAdminMemberName(trimmed);
    if (!validation.valid) {
      setEditError(validation.message);
      return;
    }

    if (trimmed === originalName.trim().replace(/\s+/g, ' ')) {
      setEditingMemberId(null);
      setEditNameDraft('');
      setEditError('');
      return;
    }

    setIsSavingName(true);
    setEditError('');
    try {
      const err = await onUpdateMemberName(reg.id, memberId, trimmed);
      if (err) {
        setEditError(err);
      } else {
        setEditingMemberId(null);
        setEditNameDraft('');
        setEditError('');
      }
    } finally {
      setIsSavingName(false);
    }
  };

  const rowHasDuplicate = reg.members.some((m) => {
    const nameKey = normalizeArabicText(m.name);
    const phoneKey = normalizePhoneKey(m.phone);
    return (
      (nameKey !== '' && (duplicateNameCounts.get(nameKey) ?? 0) > 1) ||
      (phoneKey !== '' && (duplicatePhoneCounts.get(phoneKey) ?? 0) > 1)
    );
  });

  return (
    <tr
      className={`align-top transition-colors ${
        rowHasDuplicate
          ? 'border-r-4 border-r-red-600 bg-red-50/55 hover:bg-red-50/85'
          : reg.isTest
            ? 'bg-amber-50/45 hover:bg-amber-50/80'
            : 'hover:bg-[#FCFBF9]'
      }`}
    >
      {/* Queue Sequence (#seqNo) + Millisecond Timestamp + Test Badge */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col items-start gap-1">
          <span className="font-mono-num text-sm font-extrabold text-[#7C4518]">
            {typeof reg.seqNo === 'number' && reg.seqNo > 0 ? `#${reg.seqNo}` : '—'}
          </span>
          <span className="font-mono-num text-[11px] text-[#5C5349]" dir="ltr">
            {reg.timestamp || '—'}
          </span>
          {reg.isTest && (
            <span className="inline-flex items-center rounded border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-900">
              اختبار ضغط
            </span>
          )}
        </div>
      </td>

      {/* Members & Per-Member Actions */}
      <td className="min-w-[330px] px-4 py-3.5">
        <div className="space-y-2">
          {reg.members.map((m) => {
            const isDeletingThisMember = deletingMemberId === m.id;
            const normNameKey = normalizeArabicText(m.name);
            const normPhoneKey = normalizePhoneKey(m.phone);
            const nameDupCount = normNameKey ? (duplicateNameCounts.get(normNameKey) ?? 0) : 0;
            const phoneDupCount = normPhoneKey ? (duplicatePhoneCounts.get(normPhoneKey) ?? 0) : 0;
            const isDuplicateName = nameDupCount > 1;
            const isDuplicatePhone = phoneDupCount > 1;
            const isMemberDuplicate = isDuplicateName || isDuplicatePhone;
            const mBus = getMemberBus(m, reg);
            const mColor = getMemberColor(m, reg);
            const mColorMeta = COLOR_GROUP_LIST.find((c) => c.key === mColor);
            const isTransferringThisMember = transferringMemberId === m.id && !m.cancelled;

            return (
              <div
                key={m.id}
                className={`rounded-lg border px-3 py-2 ${
                  isMemberDuplicate
                    ? 'border-red-500 bg-red-100/75 ring-1 ring-red-300'
                    : m.cancelled
                      ? 'border-red-200 bg-red-50/60 opacity-90'
                      : m.paid
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-[#E6DFD3] bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {editingMemberId === m.id ? (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="text"
                            value={editNameDraft}
                            disabled={isSavingName}
                            autoFocus
                            onChange={(e) => {
                              setEditNameDraft(e.target.value);
                              if (editError) setEditError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleSaveMemberName(m.id, m.name);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditingMember();
                              }
                            }}
                            placeholder="اكتب الاسم الثلاثي..."
                            aria-label="تعديل اسم الفرد"
                            className={`min-w-[190px] flex-1 rounded-md border bg-white px-2.5 py-1 text-sm font-semibold text-[#1E1A16] focus:outline-none ${
                              editError
                                ? 'border-red-500 focus:border-red-600'
                                : 'border-[#9A5B25] focus:border-[#7C4518]'
                            }`}
                          />
                          <button
                            type="button"
                            disabled={isSavingName}
                            onClick={() => void handleSaveMemberName(m.id, m.name)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                          >
                            {isSavingName ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>جارٍ الحفظ...</span>
                              </>
                            ) : (
                              <>
                                <Check className="h-3 w-3" />
                                <span>حفظ</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isSavingName}
                            onClick={cancelEditingMember}
                            className="inline-flex items-center gap-1 rounded-md border border-[#D4CBBF] bg-white px-2 py-1 text-xs font-semibold text-[#5C5349] transition-colors hover:bg-[#F5F1E9] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                            <span>إلغاء</span>
                          </button>
                        </div>
                        {editError && (
                          <p
                            role="alert"
                            className="flex items-start gap-1 text-xs font-semibold text-red-700"
                          >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{editError}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p
                          className={`text-sm font-bold ${
                            isDuplicateName
                              ? `rounded bg-red-200/90 px-1.5 py-0.5 text-red-950 ${
                                  m.cancelled ? 'line-through' : ''
                                }`
                              : m.cancelled
                                ? 'text-red-700 line-through'
                                : 'text-[#1E1A16]'
                          }`}
                        >
                          {m.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => startEditingMember(m.id, m.name)}
                          title="تعديل الاسم"
                          aria-label={`تعديل اسم ${m.name}`}
                          className="inline-flex items-center gap-1 rounded border border-[#DFD5C7] bg-[#FAF8F4] px-1.5 py-0.5 text-[11px] font-semibold text-[#6B5A46] transition-colors hover:border-[#9A5B25]/50 hover:bg-[#F5ECE0] hover:text-[#7C4518] whitespace-nowrap cursor-pointer"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          <span>تعديل</span>
                        </button>
                        {!m.cancelled && (
                          <button
                            type="button"
                            disabled={isDeletingThisReg}
                            onClick={() => startTransferringMember(m)}
                            title="نقل الفرد لباص أو قروب لوني آخر"
                            aria-label={`نقل ${m.name} لباص أو قروب لوني آخر`}
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 ${
                              isTransferringThisMember
                                ? 'border-[#9A5B25] bg-[#9A5B25] text-white'
                                : 'border-[#D9C7B0] bg-[#FAF5EC] text-[#7C4518] hover:border-[#9A5B25] hover:bg-[#F3E5D3]'
                            }`}
                          >
                            <span>نقل 🔄</span>
                          </button>
                        )}
                        {m.isMain && (
                          <span className="text-xs font-normal text-[#6B6155]">(الرئيسي)</span>
                        )}
                        {isDuplicateName && (
                          <button
                            type="button"
                            onClick={() => onQuickFilterText(m.name)}
                            title="اضغط لعرض كل الحجوزات التي تحمل هذا الاسم ومقارنتها"
                            className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white transition-colors hover:bg-red-700 whitespace-nowrap cursor-pointer"
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span>اسم مكرر (×{nameDupCount})</span>
                          </button>
                        )}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#5C5349]">
                      <span
                        className={`font-mono-num ${
                          isDuplicatePhone
                            ? 'rounded bg-red-200/90 px-1.5 py-0.5 font-extrabold text-red-950'
                            : ''
                        }`}
                        dir="ltr"
                      >
                        {m.phone}
                      </span>
                      {isDuplicatePhone && (
                        <button
                          type="button"
                          onClick={() => onQuickFilterText(m.phone)}
                          title="اضغط لعرض كل الحجوزات التي تحمل هذا الرقم ومقارنتها"
                          className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white transition-colors hover:bg-red-700 whitespace-nowrap cursor-pointer"
                        >
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>رقم مكرر (×{phoneDupCount})</span>
                        </button>
                      )}
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-bold ${
                          m.cancelled
                            ? 'text-red-700'
                            : m.paid
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {m.cancelled ? 'ملغي' : m.paid ? 'مدفوع' : 'لم يدفع'}
                      </span>
                      {(() => {
                        const memberAge = calculateAgeFromBirthDate(m.birthDate);
                        if (memberAge === null) return null;
                        return (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              title={m.birthDate ? `تاريخ الميلاد: ${m.birthDate}` : undefined}
                              className="inline-flex items-center rounded border border-[#E4DDD2] bg-[#FAF8F4] px-1.5 py-0.5 text-[11px] font-bold text-[#7C4518]"
                            >
                              العمر: {formatAgeArabic(memberAge)}
                            </span>
                          </>
                        );
                      })()}
                      <span aria-hidden="true">·</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                          mColorMeta
                            ? mColorMeta.badgeClass
                            : 'border-[#E4DDD2] bg-[#FAF8F4] text-[#1E1A16]'
                        }`}
                      >
                        <span>{LABELS.buses[mBus]}</span>
                        <span aria-hidden="true">•</span>
                        {mColorMeta && (
                          <span className={`h-2 w-2 rounded-xs ${mColorMeta.swatchClass}`} />
                        )}
                        <span>{LABELS.colors[mColor]}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {!m.cancelled && (
                      <button
                        type="button"
                        onClick={() => onToggleMemberPaid(reg.id, m.id)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-white transition-colors whitespace-nowrap cursor-pointer ${
                          m.paid
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-emerald-700 hover:bg-emerald-800'
                        }`}
                      >
                        {m.paid ? (
                          <span>إلغاء الدفع</span>
                        ) : (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>تأكيد دفع</span>
                          </>
                        )}
                      </button>
                    )}

                    {m.cancelled ? (
                      <>
                        <button
                          type="button"
                          disabled={isDeletingThisMember || isDeletingThisReg}
                          onClick={() => onToggleMemberCancelled(reg.id, m.id)}
                          className="inline-flex items-center gap-1 rounded-md bg-sky-700 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-sky-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>استرجاع</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingThisMember || isDeletingThisReg}
                          onClick={() => onRequestDeleteMember(reg.id, m.id, m.name)}
                          className="inline-flex items-center gap-1 rounded-md bg-red-900 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-red-950 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                        >
                          {isDeletingThisMember ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>جارٍ المسح...</span>
                            </>
                          ) : (
                            <span>مسح نهائي 🗑️</span>
                          )}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isDeletingThisReg}
                        onClick={() => onToggleMemberCancelled(reg.id, m.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-red-700 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <span>إلغاء ✕</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Transfer Panel (Bus / Color Group) */}
                {isTransferringThisMember && (
                  <div className="mt-2.5 space-y-2 rounded-lg border border-[#DEC9AE] bg-[#FAF6F0] p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-extrabold text-[#7C4518]">
                        نقل الفرد (الباص / القروب اللوني):
                      </p>
                      <span className="text-[11px] text-[#6B6155]">
                        الحالي: {LABELS.buses[mBus]} • قروب {LABELS.colors[mColor]}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`transfer-bus-${m.id}`}
                          className="mb-1 block text-[11px] font-bold text-[#4E463D]"
                        >
                          الباص الجديد
                        </label>
                        <select
                          id={`transfer-bus-${m.id}`}
                          disabled={isSavingTransfer}
                          value={transferBusDraft}
                          onChange={(e) => {
                            setTransferBusDraft(e.target.value as BusKey);
                            if (transferError) setTransferError('');
                          }}
                          className="w-full rounded-md border border-[#D4CBBF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none disabled:opacity-60"
                        >
                          {BUS_LIST.map((bus) => {
                            const bStat = capacities.buses[bus.key];
                            const isCurrent = bus.key === mBus;
                            const statusPart = bStat.isFull
                              ? 'ممتلئ'
                              : `متبقي ${bStat.remaining}`;
                            return (
                              <option key={bus.key} value={bus.key}>
                                {bus.label} ({isCurrent ? `الحالي · ${statusPart}` : statusPart})
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor={`transfer-color-${m.id}`}
                          className="mb-1 block text-[11px] font-bold text-[#4E463D]"
                        >
                          القروب اللوني الجديد
                        </label>
                        <select
                          id={`transfer-color-${m.id}`}
                          disabled={isSavingTransfer}
                          value={transferColorDraft}
                          onChange={(e) => {
                            setTransferColorDraft(e.target.value as ColorGroupKey);
                            if (transferError) setTransferError('');
                          }}
                          className="w-full rounded-md border border-[#D4CBBF] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none disabled:opacity-60"
                        >
                          {COLOR_GROUP_LIST.map((group) => {
                            const cStat = capacities.colors[group.key];
                            const isCurrent = group.key === mColor;
                            const statusPart = cStat.isFull
                              ? 'ممتلئ'
                              : `متبقي ${cStat.remaining}`;
                            return (
                              <option key={group.key} value={group.key}>
                                قروب {LABELS.colors[group.key]} (
                                {isCurrent ? `الحالي · ${statusPart}` : statusPart})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {transferError && (
                      <p
                        role="alert"
                        className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
                      >
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{transferError}</span>
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        disabled={isSavingTransfer}
                        onClick={cancelTransferringMember}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D4CBBF] bg-white px-2.5 py-1 text-xs font-semibold text-[#5C5349] transition-colors hover:bg-[#F5F1E9] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                        <span>إلغاء</span>
                      </button>
                      <button
                        type="button"
                        disabled={isSavingTransfer}
                        onClick={() => void handleSaveTransfer(m)}
                        className="inline-flex items-center gap-1 rounded-md bg-[#9A5B25] px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-[#7C4518] disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      >
                        {isSavingTransfer ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>جارٍ حفظ النقل...</span>
                          </>
                        ) : (
                          <>
                            <Check className="h-3 w-3" />
                            <span>حفظ النقل</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </td>

      {/* Bus & Color */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        {mixedAssignments ? (
          <div className="space-y-1">
            <p className="font-bold text-[#7C4518]">متعدد (حسب كل فرد)</p>
            <div className="space-y-0.5 text-[11px] text-[#4E463D]">
              {reg.members.map((m) => {
                const mBus = getMemberBus(m, reg);
                const mColor = getMemberColor(m, reg);
                const mColorMeta = COLOR_GROUP_LIST.find((c) => c.key === mColor);
                return (
                  <p key={m.id} className="flex items-center gap-1">
                    {mColorMeta && (
                      <span className={`h-2 w-2 shrink-0 rounded-xs ${mColorMeta.swatchClass}`} />
                    )}
                    <span className="max-w-[115px] truncate font-medium text-[#1E1A16]">
                      {m.name.split(' ')[0]}:
                    </span>
                    <span>
                      {LABELS.buses[mBus]} · {LABELS.colors[mColor]}
                    </span>
                  </p>
                );
              })}
            </div>
            <p className="pt-0.5 text-xs text-[#7B7165]">مجموعة ({reg.members.length})</p>
          </div>
        ) : (
          <>
            <p className="font-bold text-[#1E1A16]">{LABELS.buses[primaryBus]}</p>
            <p className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-bold ${
                  colorMeta
                    ? colorMeta.badgeClass
                    : 'border-[#E4DDD2] bg-[#FAF8F4] text-[#4E463D]'
                }`}
              >
                {colorMeta && <span className={`h-2.5 w-2.5 rounded-xs ${colorMeta.swatchClass}`} />}
                <span>قروب {LABELS.colors[primaryColor]}</span>
              </span>
            </p>
            <p className="mt-1 text-xs text-[#7B7165]">{reg.isGroup ? 'مجموعة' : 'فردي'}</p>
          </>
        )}
      </td>

      {/* Recipient & Payment */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className="font-bold text-[#1E1A16]">{LABELS.recipients[reg.recipient]}</p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[#4E463D]">
          <PaymentMethodIcon method={reg.paymentMethod} className="h-5 w-5 shrink-0" />
          <span>{LABELS.payments[reg.paymentMethod]}</span>
        </div>
        <p className="mt-1 font-mono-num text-[11px] text-[#8C8173]">#{reg.id}</p>
      </td>

      {/* Financial Summary */}
      <td className="space-y-1 px-4 py-3.5 text-xs tabular-nums whitespace-nowrap">
        <p className="text-[#1E1A16]">
          المطلوب: <strong className="font-mono-num">{summary.expectedMoney} ج</strong> (
          {summary.activeCount} نشط)
        </p>
        <p className="text-emerald-700">
          المدفوع: <strong className="font-mono-num">{summary.paidMoney} ج</strong> (
          {summary.paidCount} فرد)
        </p>
        <p className="text-amber-700">
          المتبقي: <strong className="font-mono-num">{summary.remainingMoney} ج</strong>
        </p>
      </td>

      {/* Quick Booking Actions */}
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex flex-col gap-1.5">
          {!allCancelled && (
            <button
              type="button"
              onClick={() => onApproveAllInReg(reg.id)}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-800 cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Approve الكل</span>
            </button>
          )}

          <button
            type="button"
            disabled={isDeletingThisReg}
            onClick={() => onCancelAllInReg(reg.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer ${
              allCancelled ? 'bg-sky-700 hover:bg-sky-800' : 'bg-red-700 hover:bg-red-800'
            }`}
          >
            {allCancelled ? 'استرجاع الحجز' : 'إلغاء الحجز بالكامل'}
          </button>

          {allCancelled && (
            <button
              type="button"
              disabled={isDeletingThisReg}
              onClick={() => onRequestDeleteRegistration(reg)}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-red-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-950 disabled:opacity-60 whitespace-nowrap cursor-pointer"
            >
              {isDeletingThisReg ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>جارٍ المسح...</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>مسح نهائي 🗑️</span>
                </>
              )}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});
