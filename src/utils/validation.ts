import * as XLSX from 'xlsx';
import {
  BUS_CAPACITY,
  BUS_LIST,
  COLOR_GROUP_CAPACITY,
  COLOR_GROUP_LIST,
  DEFAULT_CAPACITY_LIMITS,
  LABELS,
  PAYMENT_METHOD_LIST,
  PAYMENT_RECIPIENT_MAP,
  TICKET_PRICE,
  type BookingStatusKey,
  type BusKey,
  type CapacityLimits,
  type ColorGroupKey,
  type MemberRecord,
  type PaymentMethodKey,
  type RecipientKey,
  type RegistrationRecord,
  type WhatsAppConfig,
} from '../types/trip';

const COLOR_GROUP_MIGRATION_MAP: Record<string, ColorGroupKey> = {
  pink: 'pink',
  black: 'black',
  yellow: 'yellow',
  green: 'green',
  red: 'pink',
  blue: 'black',
  وردي: 'pink',
  أسود: 'black',
  أصفر: 'yellow',
  أخضر: 'green',
  أحمر: 'pink',
  أزرق: 'black',
};

const MIGRATED_PINK_MEMBERS_RAW = [
  'نونسيا ناصر كرزون',
  'مارينا ماجد لمعي',
  'ديانا موسى توفيق',
  'لليان موسى توفيق',
  'بطه امين بشاي',
  'سانتي امين بشاي',
] as const;

let migratedPinkMemberSetCache: Set<string> | null = null;
function getMigratedPinkMemberSet(): Set<string> {
  if (!migratedPinkMemberSetCache) {
    migratedPinkMemberSetCache = new Set(
      MIGRATED_PINK_MEMBERS_RAW.map((name) => normalizeArabicText(name))
    );
  }
  return migratedPinkMemberSetCache;
}

export function normalizeColorGroupKey(raw: unknown): ColorGroupKey {
  const trimmed = String(raw ?? '').trim();
  const lower = trimmed.toLowerCase();
  return COLOR_GROUP_MIGRATION_MAP[lower] ?? COLOR_GROUP_MIGRATION_MAP[trimmed] ?? 'pink';
}

export function normalizeRegistrationRecord(reg: RegistrationRecord): RegistrationRecord {
  const migratedPinkMembers = getMigratedPinkMemberSet();
  const normalizedMembers = reg.members.map((member) => {
    const rawColor = member.colorGroup ?? reg.colorGroup;
    const rawLower = String(rawColor ?? '').trim().toLowerCase();
    const isMigratedPinkMember = migratedPinkMembers.has(normalizeArabicText(member.name));
    const nextColor: ColorGroupKey =
      isMigratedPinkMember && (!rawLower || rawLower === 'red' || rawLower === 'أحمر')
        ? 'pink'
        : normalizeColorGroupKey(rawColor);

    return {
      ...member,
      colorGroup: nextColor,
    };
  });

  const primaryColor = normalizedMembers[0]?.colorGroup ?? normalizeColorGroupKey(reg.colorGroup);

  return {
    ...reg,
    colorGroup: primaryColor,
    members: normalizedMembers,
  };
}

export function getMemberBus(member: MemberRecord, reg: RegistrationRecord): BusKey {
  return member.bus ?? reg.bus;
}

export function getMemberColor(member: MemberRecord, reg: RegistrationRecord): ColorGroupKey {
  return normalizeColorGroupKey(member.colorGroup ?? reg.colorGroup);
}

export function hasMixedMemberAssignments(reg: RegistrationRecord): boolean {
  if (reg.members.length <= 1) return false;
  const firstBus = getMemberBus(reg.members[0], reg);
  const firstColor = getMemberColor(reg.members[0], reg);
  return reg.members.some(
    (m) => getMemberBus(m, reg) !== firstBus || getMemberColor(m, reg) !== firstColor
  );
}

export interface ValidationResult {
  valid: boolean;
  message: string;
}

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function normalizeDigits(raw: string): string {
  return raw
    .replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_DIGIT_MAP[ch] ?? ch)
    .replace(/[^\d]/g, '');
}

/**
 * Validates that the full name consists strictly of 3 words (اسم ثلاثي فقط).
 */
export function validateTripleName(rawName: string): ValidationResult {
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { valid: false, message: 'يرجى إدخال الاسم الثلاثي' };
  }

  const parts = trimmed.split(' ').filter(Boolean);
  const validWordPattern = /^[\u0621-\u064Aa-zA-Z]{2,}$/;

  for (const part of parts) {
    if (!validWordPattern.test(part)) {
      return {
        valid: false,
        message: 'الاسم يجب أن يحتوي على حروف فقط بدون أرقام أو رموز (حرفين على الأقل لكل اسم)',
      };
    }
  }

  if (parts.length < 3) {
    return {
      valid: false,
      message: 'الاسم غير مكتمل — لا يُقبل إلا الاسم الثلاثي فقط (3 أسماء مفصولة بمسافة)',
    };
  }

  if (parts.length > 3) {
    return {
      valid: false,
      message: 'الاسم لا يقبل إلا ثلاثياً فقط (3 أسماء فقط بدون اسم رابع)',
    };
  }

  return { valid: true, message: '' };
}

/**
 * Validates edited member name in Admin Panel: requires at least 3 words (اسم ثلاثي على الأقل).
 */
export function validateAdminMemberName(rawName: string): ValidationResult {
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { valid: false, message: 'يرجى إدخال الاسم' };
  }

  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length < 3) {
    return {
      valid: false,
      message: 'الاسم يجب أن يكون ثلاثياً على الأقل (3 كلمات مفصولة بمسافة)',
    };
  }

  const validWordPattern = /^[\u0621-\u064Aa-zA-Z]{2,}$/;
  for (const part of parts) {
    if (!validWordPattern.test(part)) {
      return {
        valid: false,
        message: 'الاسم يجب أن يحتوي على حروف فقط بدون أرقام أو رموز (حرفين على الأقل لكل كلمة)',
      };
    }
  }

  return { valid: true, message: '' };
}

/**
 * Validates Egyptian phone number entered after +20 prefix.
 * - Less than 10 digits => "الرقم ناقص"
 * - More than 10 digits => "الرقم زايد"
 * - Exactly 10 digits => must be a valid Egyptian mobile number starting with 10, 11, 12, or 15
 */
export function validateEgyptianPhone(rawDigits: string): ValidationResult {
  const digits = normalizeDigits(rawDigits);

  if (!digits) {
    return { valid: false, message: 'يرجى إدخال رقم الهاتف المصري (10 أرقام بعد +20)' };
  }

  if (digits.length < 10) {
    const remaining = 10 - digits.length;
    return {
      valid: false,
      message: `الرقم ناقص — أدخلت ${digits.length} أرقام (متبقي ${remaining} ${remaining === 1 ? 'رقم' : 'أرقام'} بعد +20)`,
    };
  }

  if (digits.length > 10) {
    const extra = digits.length - 10;
    return {
      valid: false,
      message: `الرقم زايد — أدخلت ${digits.length} رقم (زيادة ${extra} ${extra === 1 ? 'رقم' : 'أرقام'}، أدخل 10 أرقام فقط بعد +20 بدون الصفر الأول)`,
    };
  }

  if (!/^1[0125]\d{8}$/.test(digits)) {
    return {
      valid: false,
      message: 'رقم مصري غير صحيح — بعد +20 يجب أن يبدأ الرقم بـ 10 أو 11 أو 12 أو 15 (بدون الصفر الأول)',
    };
  }

  return { valid: true, message: '' };
}

export function formatEgyptianPhone(rawDigits: string): string {
  const digits = normalizeDigits(rawDigits);
  return `+20${digits}`;
}

/**
 * Returns today's local date as YYYY-MM-DD without UTC midnight shift.
 */
export function getTodayIsoDate(referenceDate: Date = new Date()): string {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoBirthDate(
  raw?: string
): { year: number; month: number; day: number } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Verify the calendar date truly exists (rejects e.g. 2023-02-30)
  const check = new Date(year, month - 1, day);
  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/**
 * Validates a required birth date (YYYY-MM-DD).
 * Intentionally never mentions or exposes calculated age so the registration page
 * does not display age to the registrant.
 */
export function validateBirthDate(
  raw: string,
  referenceDate: Date = new Date()
): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, message: 'يرجى إدخال تاريخ الميلاد' };
  }

  const parsed = parseIsoBirthDate(trimmed);
  if (!parsed) {
    return { valid: false, message: 'تاريخ الميلاد غير صحيح' };
  }

  if (parsed.year < 1920) {
    return { valid: false, message: 'يرجى إدخال سنة ميلاد صحيحة (1920 أو أحدث)' };
  }

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  const isFuture =
    parsed.year > refYear ||
    (parsed.year === refYear && parsed.month > refMonth) ||
    (parsed.year === refYear && parsed.month === refMonth && parsed.day > refDay);

  if (isFuture) {
    return { valid: false, message: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل' };
  }

  return { valid: true, message: '' };
}

/**
 * Calculates exact completed years of age from an ISO birth date (YYYY-MM-DD).
 * Returns null if birthDate is missing or invalid.
 */
export function calculateAgeFromBirthDate(
  birthDate?: string,
  referenceDate: Date = new Date()
): number | null {
  const parsed = parseIsoBirthDate(birthDate);
  if (!parsed) return null;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  let age = refYear - parsed.year;
  if (refMonth < parsed.month || (refMonth === parsed.month && refDay < parsed.day)) {
    age -= 1;
  }

  if (age < 0 || age > 120) return null;
  return age;
}

export function formatAgeArabic(age: number | null): string {
  if (age === null) return '';
  return `${age} سنة`;
}

export interface RegSummary {
  activeCount: number;
  paidCount: number;
  unpaidCount: number;
  cancelledCount: number;
  expectedMoney: number;
  paidMoney: number;
  remainingMoney: number;
  statusKey: BookingStatusKey;
}

export function getRegSummary(reg: RegistrationRecord): RegSummary {
  let activeCount = 0;
  let paidCount = 0;
  let cancelledCount = 0;

  for (const m of reg.members) {
    if (m.cancelled) {
      cancelledCount++;
    } else {
      activeCount++;
      if (m.paid) paidCount++;
    }
  }

  const unpaidCount = activeCount - paidCount;
  let statusKey: BookingStatusKey = 'unpaid';
  if (activeCount === 0) statusKey = 'cancelled';
  else if (paidCount === activeCount) statusKey = 'paid';
  else if (paidCount > 0) statusKey = 'partial';

  return {
    activeCount,
    paidCount,
    unpaidCount,
    cancelledCount,
    expectedMoney: activeCount * TICKET_PRICE,
    paidMoney: paidCount * TICKET_PRICE,
    remainingMoney: unpaidCount * TICKET_PRICE,
    statusKey,
  };
}

export interface CapacityItemStat {
  confirmed: number;
  pending: number;
  remaining: number;
  limit: number;
  isFull: boolean;
}

export interface CapacityCounts {
  buses: Record<BusKey, CapacityItemStat>;
  colors: Record<ColorGroupKey, CapacityItemStat>;
  busLimits: Record<BusKey, number>;
  colorLimits: Record<ColorGroupKey, number>;
}

/**
 * Computes confirmed (paid & not cancelled) counts per bus and per color group
 * using dynamic capacity limits (defaults to 50 per bus, 25 per color group).
 */
export function getCapacityCounts(
  registrations: RegistrationRecord[],
  limits: CapacityLimits = DEFAULT_CAPACITY_LIMITS
): CapacityCounts {
  const busConfirmed: Record<BusKey, number> = { bus1: 0, bus2: 0 };
  const busPending: Record<BusKey, number> = { bus1: 0, bus2: 0 };
  const colorConfirmed: Record<ColorGroupKey, number> = { pink: 0, black: 0, yellow: 0, green: 0 };
  const colorPending: Record<ColorGroupKey, number> = { pink: 0, black: 0, yellow: 0, green: 0 };

  for (const reg of registrations) {
    for (const member of reg.members) {
      if (member.cancelled) continue;
      const mBus = getMemberBus(member, reg);
      const mColor = getMemberColor(member, reg);
      if (member.paid) {
        if (mBus in busConfirmed) busConfirmed[mBus]++;
        if (mColor in colorConfirmed) colorConfirmed[mColor]++;
      } else {
        if (mBus in busPending) busPending[mBus]++;
        if (mColor in colorPending) colorPending[mColor]++;
      }
    }
  }

  const busLimits: Record<BusKey, number> = {
    bus1: Math.max(0, Math.floor(Number(limits?.buses?.bus1 ?? BUS_CAPACITY) || 0)),
    bus2: Math.max(0, Math.floor(Number(limits?.buses?.bus2 ?? BUS_CAPACITY) || 0)),
  };

  const colorLimits: Record<ColorGroupKey, number> = {
    pink: Math.max(0, Math.floor(Number(limits?.colors?.pink ?? COLOR_GROUP_CAPACITY) || 0)),
    black: Math.max(0, Math.floor(Number(limits?.colors?.black ?? COLOR_GROUP_CAPACITY) || 0)),
    yellow: Math.max(0, Math.floor(Number(limits?.colors?.yellow ?? COLOR_GROUP_CAPACITY) || 0)),
    green: Math.max(0, Math.floor(Number(limits?.colors?.green ?? COLOR_GROUP_CAPACITY) || 0)),
  };

  const buildBus = (key: BusKey): CapacityItemStat => {
    const confirmed = busConfirmed[key];
    const limit = busLimits[key];
    return {
      confirmed,
      pending: busPending[key],
      remaining: Math.max(0, limit - confirmed),
      limit,
      isFull: confirmed >= limit,
    };
  };

  const buildColor = (key: ColorGroupKey): CapacityItemStat => {
    const confirmed = colorConfirmed[key];
    const limit = colorLimits[key];
    return {
      confirmed,
      pending: colorPending[key],
      remaining: Math.max(0, limit - confirmed),
      limit,
      isFull: confirmed >= limit,
    };
  };

  return {
    buses: {
      bus1: buildBus('bus1'),
      bus2: buildBus('bus2'),
    },
    colors: {
      pink: buildColor('pink'),
      black: buildColor('black'),
      yellow: buildColor('yellow'),
      green: buildColor('green'),
    },
    busLimits,
    colorLimits,
  };
}

export interface FinancialStats {
  expectedMoney: number;
  paidMoney: number;
  remainingMoney: number;
  activePersons: number;
  paidPersons: number;
  cancelledPersons: number;
  byPayment: Record<PaymentMethodKey, { expected: number; paid: number; persons: number }>;
}

export function calculateFinancialStats(
  registrations: RegistrationRecord[],
  filterRecipientKey: RecipientKey | null = null
): FinancialStats {
  const list = filterRecipientKey
    ? registrations.filter((r) => r.recipient === filterRecipientKey)
    : registrations;

  const stats: FinancialStats = {
    expectedMoney: 0,
    paidMoney: 0,
    remainingMoney: 0,
    activePersons: 0,
    paidPersons: 0,
    cancelledPersons: 0,
    byPayment: {
      instapay: { expected: 0, paid: 0, persons: 0 },
      vf: { expected: 0, paid: 0, persons: 0 },
      orange: { expected: 0, paid: 0, persons: 0 },
    },
  };

  for (const r of list) {
    const s = getRegSummary(r);
    stats.expectedMoney += s.expectedMoney;
    stats.paidMoney += s.paidMoney;
    stats.remainingMoney += s.remainingMoney;
    stats.activePersons += s.activeCount;
    stats.paidPersons += s.paidCount;
    stats.cancelledPersons += s.cancelledCount;

    if (stats.byPayment[r.paymentMethod]) {
      stats.byPayment[r.paymentMethod].expected += s.expectedMoney;
      stats.byPayment[r.paymentMethod].paid += s.paidMoney;
      stats.byPayment[r.paymentMethod].persons += s.activeCount;
    }
  }

  return stats;
}

export function buildWhatsAppDetails(
  data: RegistrationRecord,
  whatsappNumbers: WhatsAppConfig
): { url: string; message: string; phoneNum: string } {
  const resolvedRecipient = PAYMENT_RECIPIENT_MAP[data.paymentMethod] ?? data.recipient;
  const phoneNum = whatsappNumbers[resolvedRecipient][data.paymentMethod];
  const paymentName = LABELS.payments[data.paymentMethod];
  const mainMember = data.members[0];
  const companions = data.members.slice(1);
  const totalPersons = data.members.length;
  const totalPrice = totalPersons * TICKET_PRICE;

  const mainAge = calculateAgeFromBirthDate(mainMember.birthDate);
  const mainAgeLine = mainAge !== null ? `\nالعمر: ${formatAgeArabic(mainAge)}` : '';

  const hasMixed = hasMixedMemberAssignments(data);
  let message = '';

  if (hasMixed) {
    const memberLines = data.members
      .map((m) => {
        const mBus = getMemberBus(m, data);
        const mColor = getMemberColor(m, data);
        const mAge = calculateAgeFromBirthDate(m.birthDate);
        const agePart = mAge !== null ? `العمر: ${formatAgeArabic(mAge)} | ` : '';
        return `- ${m.name} (${agePart}${LABELS.buses[mBus]} | قروب ${LABELS.colors[mColor]})`;
      })
      .join('\n');

    message =
      `سلام و نعمة\n` +
      `الاسم: ${mainMember.name}\n` +
      `رقم الهاتف: ${mainMember.phone}${mainAgeLine}\n` +
      `عدد الأفراد: ${totalPersons}\n` +
      `تفاصيل الأفراد:\n${memberLines}\n` +
      `الإجمالي: ${totalPrice} جنيه\n` +
      `طريقة الدفع: ${paymentName}\n` +
      `كود الحجز: ${data.id}`;
  } else {
    const mainBus = getMemberBus(mainMember, data);
    const mainColor = getMemberColor(mainMember, data);
    const companionsNames = companions.length
      ? `\nالمرافقون: ${companions
          .map((c) => {
            const cAge = calculateAgeFromBirthDate(c.birthDate);
            return cAge !== null ? `${c.name} (${formatAgeArabic(cAge)})` : c.name;
          })
          .join('، ')}`
      : '';

    message =
      `سلام و نعمة\n` +
      `الاسم: ${mainMember.name}\n` +
      `رقم الهاتف: ${mainMember.phone}${mainAgeLine}\n` +
      `عدد الأفراد: ${totalPersons}${companionsNames}\n` +
      `الإجمالي: ${totalPrice} جنيه\n` +
      `طريقة الدفع: ${paymentName}\n` +
      `الباص: ${LABELS.buses[mainBus]} | المجموعة: ${LABELS.colors[mainColor]}\n` +
      `كود الحجز: ${data.id}`;
  }

  const url = `https://wa.me/${phoneNum}?text=${encodeURIComponent(message)}`;
  return { url, message, phoneNum };
}

export function migrateLegacyRegistrations(rawList: unknown): RegistrationRecord[] {
  if (!Array.isArray(rawList)) return [];

  return rawList.map((item: any) => {
    if (Array.isArray(item?.members)) {
      return normalizeRegistrationRecord(item as RegistrationRecord);
    }

    const isPaid = item?.status === 'تم التأكيد';
    const normalizedColor = normalizeColorGroupKey(item?.colorGroup);
    const members = [
      {
        id: `${item?.id ?? Date.now()}_0`,
        name: item?.mainAttendee?.name || 'غير معروف',
        phone: item?.mainAttendee?.phone || '',
        isMain: true,
        paid: isPaid,
        cancelled: false,
        colorGroup: normalizedColor,
      },
    ];

    if (Array.isArray(item?.companions)) {
      item.companions.forEach((c: any, idx: number) => {
        members.push({
          id: `${item?.id ?? Date.now()}_${idx + 1}`,
          name: c?.name || '',
          phone: c?.phone || '',
          isMain: false,
          paid: isPaid,
          cancelled: false,
          colorGroup: normalizedColor,
        });
      });
    }

    return normalizeRegistrationRecord({
      id: item?.id ?? Date.now(),
      isGroup: Boolean(item?.isGroup || members.length > 1),
      members,
      bus: item?.bus === 'bus2' ? 'bus2' : 'bus1',
      colorGroup: normalizedColor,
      recipient: item?.recipient === 'fayez' ? 'fayez' : 'mekhail',
      paymentMethod: ['instapay', 'vf', 'orange'].includes(item?.paymentMethod)
        ? item.paymentMethod
        : 'instapay',
      timestamp: item?.timestamp || new Date().toLocaleString('ar-EG'),
    });
  });
}

export function exportRegistrationsToCSV(
  filtered: RegistrationRecord[],
  filenameSuffix: string
): void {
  let csvContent =
    '\uFEFFكود الحجز,الاسم,الهاتف,تاريخ الميلاد,العمر,الصفة,حالة الفرد,الباص,المجموعة,المستلم,طريقة الدفع,المبلغ المدفوع للفرد,التاريخ\n';

  for (const r of filtered) {
    for (const m of r.members) {
      const statusText = m.cancelled ? 'ملغي' : m.paid ? 'مدفوع' : 'لم يدفع';
      const paidAmount = !m.cancelled && m.paid ? TICKET_PRICE : 0;
      const mBus = getMemberBus(m, r);
      const mColor = getMemberColor(m, r);
      const mAge = calculateAgeFromBirthDate(m.birthDate);
      const row = [
        r.id,
        m.name,
        m.phone,
        m.birthDate || '',
        mAge !== null ? mAge : '',
        m.isMain ? 'رئيسي' : 'مرافق',
        statusText,
        LABELS.buses[mBus] || mBus,
        LABELS.colors[mColor] || mColor,
        LABELS.recipients[r.recipient] || '',
        LABELS.payments[r.paymentMethod] || r.paymentMethod,
        paidAmount,
        r.timestamp,
      ]
        .map((val) => `"${String(val).replace(/"/g, '""')}"`)
        .join(',');
      csvContent += `${row}\r\n`;
    }
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `trip_registrations_${filenameSuffix}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Normalizes Arabic letters (Alef variants, Ta Marbuta, Alef Maksura, diacritics)
 * for forgiving, accurate triple-name search in the organizer panel.
 */
export function normalizeArabicText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes any Egyptian phone representation (+2010..., 2010..., 010..., 10...)
 * into its canonical 10-digit local key (e.g. 1012345678) for accurate duplicate detection.
 */
export function normalizePhoneKey(phone: string): string {
  const digits = normalizeDigits(phone);
  if (!digits) return '';
  return digits.replace(/^20/, '').replace(/^0/, '');
}

/**
 * Builds fast lookup Sets of normalized names and canonical phones across all
 * active (non-cancelled) members in existing registrations.
 */
export function getActiveExistingSets(registrations: RegistrationRecord[]): {
  names: Set<string>;
  phones: Set<string>;
} {
  const names = new Set<string>();
  const phones = new Set<string>();

  for (const reg of registrations) {
    for (const member of reg.members) {
      if (member.cancelled) continue;
      const nameKey = normalizeArabicText(member.name);
      if (nameKey) names.add(nameKey);
      const phoneKey = normalizePhoneKey(member.phone);
      if (phoneKey) phones.add(phoneKey);
    }
  }

  return { names, phones };
}

/**
 * Counts occurrences of each normalized member name across all registrations,
 * returning a Map of normalizedName -> occurrence count (> 1 means duplicate).
 */
export function getDuplicateNameCounts(
  registrations: RegistrationRecord[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const reg of registrations) {
    for (const member of reg.members) {
      const key = normalizeArabicText(member.name);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Counts occurrences of each canonical member phone across all registrations,
 * returning a Map of phoneKey -> occurrence count (> 1 means duplicate).
 */
export function getDuplicatePhoneCounts(
  registrations: RegistrationRecord[]
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const reg of registrations) {
    for (const member of reg.members) {
      const key = normalizePhoneKey(member.phone);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Returns true if any member inside a registration shares a normalized name
 * or phone number with at least one other member across the registrations list.
 */
export function hasDuplicateMemberInfo(
  reg: RegistrationRecord,
  duplicateNameCounts: Map<string, number>,
  duplicatePhoneCounts: Map<string, number>
): boolean {
  return reg.members.some((member) => {
    const nameKey = normalizeArabicText(member.name);
    const phoneKey = normalizePhoneKey(member.phone);
    return (
      (nameKey !== '' && (duplicateNameCounts.get(nameKey) ?? 0) > 1) ||
      (phoneKey !== '' && (duplicatePhoneCounts.get(phoneKey) ?? 0) > 1)
    );
  });
}

/**
 * Matches a registration record against a search query by triple name,
 * phone number (supporting +20, 01..., 1..., or Arabic numerals), or booking ID.
 */
export function matchesRegistrationSearch(reg: RegistrationRecord, rawQuery: string): boolean {
  const trimmed = rawQuery.trim();
  if (!trimmed) return true;

  const normQuery = normalizeArabicText(trimmed);
  const queryDigits = normalizeDigits(trimmed);
  const strippedLeadingZeroDigits = queryDigits.replace(/^20/, '').replace(/^0/, '');

  if (queryDigits && String(reg.id).includes(queryDigits)) {
    return true;
  }

  if (queryDigits && typeof reg.seqNo === 'number' && String(reg.seqNo) === queryDigits) {
    return true;
  }

  return reg.members.some((member) => {
    const normName = normalizeArabicText(member.name);
    if (normName.includes(normQuery)) {
      return true;
    }

    if (queryDigits.length > 0) {
      const memberDigits = normalizeDigits(member.phone);
      const memberLocal = memberDigits.replace(/^20/, '');
      if (
        memberDigits.includes(queryDigits) ||
        memberLocal.includes(queryDigits) ||
        (strippedLeadingZeroDigits.length > 0 && memberLocal.includes(strippedLeadingZeroDigits))
      ) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Exports filtered registrations and full trip summary into a native Excel (.xlsx)
 * workbook with RTL sheet direction and formatted column widths.
 */
export function exportRegistrationsToExcel(
  filtered: RegistrationRecord[],
  allRegistrations: RegistrationRecord[],
  filenameSuffix: string,
  limits: CapacityLimits = DEFAULT_CAPACITY_LIMITS
): void {
  const memberRows: Record<string, string | number>[] = [];

  for (const r of filtered) {
    for (const m of r.members) {
      const statusText = m.cancelled ? 'ملغي' : m.paid ? 'مدفوع' : 'لم يدفع';
      const paidAmount = !m.cancelled && m.paid ? TICKET_PRICE : 0;
      const remainingAmount = !m.cancelled && !m.paid ? TICKET_PRICE : 0;
      const mBus = getMemberBus(m, r);
      const mColor = getMemberColor(m, r);
      const mAge = calculateAgeFromBirthDate(m.birthDate);

      memberRows.push({
        'كود الحجز': r.id,
        'الاسم الثلاثي': m.name,
        'رقم الهاتف': m.phone,
        'تاريخ الميلاد': m.birthDate || '—',
        العمر: mAge !== null ? mAge : '—',
        الصفة: m.isMain ? 'مشترك رئيسي' : 'مرافق',
        'حالة الفرد': statusText,
        الباص: LABELS.buses[mBus] || mBus,
        'القروب اللوني': LABELS.colors[mColor] || mColor,
        'نوع الحجز': r.isGroup ? 'مجموعة' : 'فردي',
        'المسؤول المستلم': LABELS.recipients[r.recipient] || '',
        'طريقة الدفع': LABELS.payments[r.paymentMethod] || r.paymentMethod,
        'المدفوع (جنيه)': paidAmount,
        'المتبقي (جنيه)': remainingAmount,
        'تاريخ التسجيل': r.timestamp,
      });
    }
  }

  const membersSheet = XLSX.utils.json_to_sheet(
    memberRows.length > 0
      ? memberRows
      : [{ ملاحظة: 'لا توجد بيانات مسجلين مطابقة للفرز الحالي' }]
  );
  membersSheet['!cols'] = [
    { wch: 16 },
    { wch: 26 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 15 },
    { wch: 15 },
    { wch: 22 },
  ];
  membersSheet['!views'] = [{ RTL: true }];

  // Sheet 2: Financial Summary & Capacity Report
  const mekhail = calculateFinancialStats(allRegistrations, 'mekhail');
  const fayez = calculateFinancialStats(allRegistrations, 'fayez');
  const overall = calculateFinancialStats(allRegistrations, null);
  const caps = getCapacityCounts(allRegistrations, limits);

  const summaryRows: (string | number)[][] = [
    ['ملخص حسابات رحلة دير الأنبا أنطونيوس - اجتماع شباب الثلاثة فتية'],
    [],
    ['المسؤول', 'المطلوب (جنيه)', 'المدفوع (جنيه)', 'المتبقي (جنيه)', 'الأفراد النشطين', 'المؤكدين بالدفع', 'الملغيين'],
    [
      'ميخائيل إدور',
      mekhail.expectedMoney,
      mekhail.paidMoney,
      mekhail.remainingMoney,
      mekhail.activePersons,
      mekhail.paidPersons,
      mekhail.cancelledPersons,
    ],
    [
      'فايز فيكتور',
      fayez.expectedMoney,
      fayez.paidMoney,
      fayez.remainingMoney,
      fayez.activePersons,
      fayez.paidPersons,
      fayez.cancelledPersons,
    ],
    [
      'الإجمالي العام',
      overall.expectedMoney,
      overall.paidMoney,
      overall.remainingMoney,
      overall.activePersons,
      overall.paidPersons,
      overall.cancelledPersons,
    ],
    [],
    ['توزيع طرق الدفع (الإجمالي العام)', 'المدفوع (جنيه)', 'المطلوب (جنيه)', 'عدد الأفراد'],
    ...PAYMENT_METHOD_LIST.map((pm) => [
      pm.label,
      overall.byPayment[pm.key].paid,
      overall.byPayment[pm.key].expected,
      overall.byPayment[pm.key].persons,
    ]),
    [],
    ['حالة الباصات', 'المؤكدين', 'السعة القصوى', 'المتبقي', 'بانتظار الدفع', 'الحالة'],
    ...BUS_LIST.map((b) => [
      b.label,
      caps.buses[b.key].confirmed,
      caps.buses[b.key].limit,
      caps.buses[b.key].remaining,
      caps.buses[b.key].pending,
      caps.buses[b.key].isFull ? 'البص اتملا' : 'متاح',
    ]),
    [],
    ['حالة القروبات اللونية', 'المؤكدين', 'السعة القصوى', 'المتبقي', 'بانتظار الدفع', 'الحالة'],
    ...COLOR_GROUP_LIST.map((c) => [
      `قروب ${LABELS.colors[c.key]}`,
      caps.colors[c.key].confirmed,
      caps.colors[c.key].limit,
      caps.colors[c.key].remaining,
      caps.colors[c.key].pending,
      caps.colors[c.key].isFull ? 'القروب اكتمل' : 'متاح',
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [
    { wch: 30 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
  ];
  summarySheet['!views'] = [{ RTL: true }];

  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(workbook, membersSheet, 'قائمة المسجلين');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'ملخص الحسابات والسعة');

  const dateTag = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `رحلة_دير_الانبا_انطونيوس_${filenameSuffix}_${dateTag}.xlsx`);
}

