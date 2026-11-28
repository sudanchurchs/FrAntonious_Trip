export type BusKey = 'bus1' | 'bus2';
export type ColorGroupKey = 'pink' | 'black' | 'yellow' | 'green';
export type RecipientKey = 'mekhail' | 'fayez';
export type PaymentMethodKey = 'instapay' | 'vf' | 'orange';
export type BookingStatusKey = 'paid' | 'partial' | 'unpaid' | 'cancelled';

export interface MemberRecord {
  id: string;
  name: string;
  phone: string;
  birthDate?: string;
  isMain: boolean;
  paid: boolean;
  cancelled: boolean;
  bus?: BusKey;
  colorGroup?: ColorGroupKey;
}

export interface RegistrationRecord {
  id: number;
  requestId?: string;
  seqNo?: number;
  isTest?: boolean;
  isGroup: boolean;
  members: MemberRecord[];
  bus: BusKey;
  colorGroup: ColorGroupKey;
  recipient: RecipientKey;
  paymentMethod: PaymentMethodKey;
  timestamp: string;
}

export type WhatsAppConfig = Record<RecipientKey, Record<PaymentMethodKey, string>>;

export type AvailabilityVisibilityKey = BusKey | ColorGroupKey;

export interface AvailabilityVisibility {
  bus1: boolean;
  bus2: boolean;
  pink: boolean;
  black: boolean;
  yellow: boolean;
  green: boolean;
}

export const DEFAULT_AVAILABILITY_VISIBILITY: AvailabilityVisibility = {
  bus1: true,
  bus2: true,
  pink: true,
  black: true,
  yellow: true,
  green: true,
};

export interface ManualUnavailableMap {
  bus1: boolean;
  bus2: boolean;
  pink: boolean;
  black: boolean;
  yellow: boolean;
  green: boolean;
}

export const DEFAULT_MANUAL_UNAVAILABLE: ManualUnavailableMap = {
  bus1: false,
  bus2: false,
  pink: false,
  black: false,
  yellow: false,
  green: false,
};

export interface TripSettings {
  showAvailability: boolean;
  registrationClosed: boolean;
  availabilityVisibility: AvailabilityVisibility;
  manualUnavailable: ManualUnavailableMap;
}

export const DEFAULT_TRIP_SETTINGS: TripSettings = {
  showAvailability: true,
  registrationClosed: false,
  availabilityVisibility: { ...DEFAULT_AVAILABILITY_VISIBILITY },
  manualUnavailable: { ...DEFAULT_MANUAL_UNAVAILABLE },
};

export interface DailyVisitRecord {
  date: string;
  unique: number;
  total: number;
}

export interface VisitorAnalyticsData {
  trackedUnique: number;
  trackedTotal: number;
  baselineUnique: number;
  baselineTotal: number;
  grandUnique: number;
  grandTotal: number;
  todayDate: string;
  todayUnique: number;
  todayTotal: number;
  daily: DailyVisitRecord[];
}

export function createEmptyVisitorAnalytics(todayDate?: string): VisitorAnalyticsData {
  const now = new Date();
  const fallbackDate =
    todayDate ??
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    trackedUnique: 0,
    trackedTotal: 0,
    baselineUnique: 0,
    baselineTotal: 0,
    grandUnique: 0,
    grandTotal: 0,
    todayDate: fallbackDate,
    todayUnique: 0,
    todayTotal: 0,
    daily: [],
  };
}

export const TICKET_PRICE = 250;
export const BUS_CAPACITY = 50;
export const COLOR_GROUP_CAPACITY = 25;

export interface CapacityLimits {
  buses: Record<BusKey, number>;
  colors: Record<ColorGroupKey, number>;
}

export const DEFAULT_CAPACITY_LIMITS: CapacityLimits = {
  buses: {
    bus1: BUS_CAPACITY,
    bus2: BUS_CAPACITY,
  },
  colors: {
    pink: COLOR_GROUP_CAPACITY,
    black: COLOR_GROUP_CAPACITY,
    yellow: COLOR_GROUP_CAPACITY,
    green: COLOR_GROUP_CAPACITY,
  },
};

export const STORAGE_KEY = 'trip_registrations';
export const SETTINGS_STORAGE_KEY = 'trip_live_settings_v1';
export const CAPACITY_LIMITS_STORAGE_KEY = 'trip_capacity_limits_v1';
export const VISITOR_COUNTED_STORAGE_KEY = 'trip_visitor_counted';
export const ANALYTICS_STORAGE_KEY = 'trip_visitor_analytics_v1';
export const WHATSAPP_STORAGE_KEY = 'trip_whatsapp_numbers_v2';
export const ADMIN_PIN_HASH_KEY = 'trip_admin_pin_hash_v2';
export const ADMIN_SESSION_KEY = 'trip_admin_session_v1';
export const ADMIN_STRESS_SECRET = 'THREEYOUTH_ANTHONY_2026_ADMIN';

// Official WhatsApp numbers for the two organizers
export const MEKHAIL_PHONE_DIGITS = '1288651567';
export const FAYEZ_PHONE_DIGITS = '1096656853';

export const ORGANIZER_ACCOUNTS: Record<
  RecipientKey,
  { key: RecipientKey; name: string; phoneDigits: string; formattedPhone: string }
> = {
  mekhail: {
    key: 'mekhail',
    name: 'ميخائيل إدور',
    phoneDigits: MEKHAIL_PHONE_DIGITS,
    formattedPhone: `+20${MEKHAIL_PHONE_DIGITS}`,
  },
  fayez: {
    key: 'fayez',
    name: 'فايز فيكتور',
    phoneDigits: FAYEZ_PHONE_DIGITS,
    formattedPhone: `+20${FAYEZ_PHONE_DIGITS}`,
  },
};

// Automatic recipient assignment based on payment method:
// InstaPay & Orange Cash => Mekhail Edwar (+201288651567)
// Vodafone Cash => Fayez Victor (+201096656853)
export const PAYMENT_RECIPIENT_MAP: Record<PaymentMethodKey, RecipientKey> = {
  instapay: 'mekhail',
  orange: 'mekhail',
  vf: 'fayez',
};

export const DEFAULT_WHATSAPP_NUMBERS: WhatsAppConfig = {
  mekhail: {
    instapay: `20${MEKHAIL_PHONE_DIGITS}`,
    orange: `20${MEKHAIL_PHONE_DIGITS}`,
    vf: `20${MEKHAIL_PHONE_DIGITS}`,
  },
  fayez: {
    instapay: `20${FAYEZ_PHONE_DIGITS}`,
    orange: `20${FAYEZ_PHONE_DIGITS}`,
    vf: `20${FAYEZ_PHONE_DIGITS}`,
  },
};

export const BUS_LIST: { key: BusKey; label: string }[] = [
  { key: 'bus1', label: 'الباص الأول' },
  { key: 'bus2', label: 'الباص الثاني' },
];

export const COLOR_GROUP_LIST: {
  key: ColorGroupKey;
  label: string;
  swatchClass: string;
  borderClass: string;
  softBgClass: string;
  fillClass: string;
  badgeClass: string;
}[] = [
  {
    key: 'pink',
    label: 'وردي',
    swatchClass: 'bg-pink-500',
    borderClass: 'border-pink-500',
    softBgClass: 'bg-pink-50/70',
    fillClass: 'fill-pink-500',
    badgeClass: 'border-pink-200 bg-pink-50 text-pink-800',
  },
  {
    key: 'black',
    label: 'أسود',
    swatchClass: 'bg-neutral-900',
    borderClass: 'border-neutral-900',
    softBgClass: 'bg-neutral-100/80',
    fillClass: 'fill-neutral-900',
    badgeClass: 'border-neutral-300 bg-neutral-100 text-neutral-900',
  },
  {
    key: 'yellow',
    label: 'أصفر',
    swatchClass: 'bg-amber-400',
    borderClass: 'border-amber-500',
    softBgClass: 'bg-amber-50/70',
    fillClass: 'fill-amber-500',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  {
    key: 'green',
    label: 'أخضر',
    swatchClass: 'bg-emerald-600',
    borderClass: 'border-emerald-600',
    softBgClass: 'bg-emerald-50/70',
    fillClass: 'fill-emerald-600',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
];

export const RECIPIENT_LIST: { key: RecipientKey; label: string }[] = [
  { key: 'mekhail', label: 'ميخائيل إدور' },
  { key: 'fayez', label: 'فايز فيكتور' },
];

export type PaymentOptionId =
  | 'instapay_mekhail'
  | 'instapay_fayez'
  | 'orange_mekhail'
  | 'vf_fayez';

export interface PaymentOptionItem {
  id: PaymentOptionId;
  method: PaymentMethodKey;
  recipient: RecipientKey;
  label: string;
  enLabel: string;
  recipientName: string;
  defaultPhoneDisplay: string;
}

export const PAYMENT_OPTIONS: PaymentOptionItem[] = [
  {
    id: 'instapay_mekhail',
    method: 'instapay',
    recipient: 'mekhail',
    label: 'إنستا باي',
    enLabel: 'InstaPay',
    recipientName: 'ميخائيل إدور',
    defaultPhoneDisplay: `+20${MEKHAIL_PHONE_DIGITS}`,
  },
  {
    id: 'instapay_fayez',
    method: 'instapay',
    recipient: 'fayez',
    label: 'إنستا باي',
    enLabel: 'InstaPay',
    recipientName: 'فايز فيكتور',
    defaultPhoneDisplay: `+20${FAYEZ_PHONE_DIGITS}`,
  },
  {
    id: 'orange_mekhail',
    method: 'orange',
    recipient: 'mekhail',
    label: 'أورانج كاش',
    enLabel: 'Orange Cash',
    recipientName: 'ميخائيل إدور',
    defaultPhoneDisplay: `+20${MEKHAIL_PHONE_DIGITS}`,
  },
  {
    id: 'vf_fayez',
    method: 'vf',
    recipient: 'fayez',
    label: 'فودافون كاش',
    enLabel: 'Vodafone Cash',
    recipientName: 'فايز فيكتور',
    defaultPhoneDisplay: `+20${FAYEZ_PHONE_DIGITS}`,
  },
];

export const PAYMENT_METHOD_LIST: { key: PaymentMethodKey; label: string; enLabel: string }[] = [
  { key: 'instapay', label: 'إنستا باي', enLabel: 'InstaPay' },
  { key: 'orange', label: 'أورانج كاش', enLabel: 'Orange Cash' },
  { key: 'vf', label: 'فودافون كاش', enLabel: 'Vodafone Cash' },
];

export const LABELS = {
  recipients: {
    mekhail: 'ميخائيل إدور',
    fayez: 'فايز فيكتور',
  } as Record<RecipientKey, string>,
  payments: {
    instapay: 'إنستا باي',
    vf: 'فودافون كاش',
    orange: 'أورانج كاش',
  } as Record<PaymentMethodKey, string>,
  colors: {
    pink: 'وردي',
    black: 'أسود',
    yellow: 'أصفر',
    green: 'أخضر',
  } as Record<ColorGroupKey, string>,
  buses: {
    bus1: 'الباص الأول',
    bus2: 'الباص الثاني',
  } as Record<BusKey, string>,
};
