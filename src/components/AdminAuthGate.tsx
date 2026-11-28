import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import {
  ADMIN_PIN_HASH_KEY,
  ORGANIZER_ACCOUNTS,
  RECIPIENT_LIST,
  type RecipientKey,
} from '../types/trip';
import { normalizeDigits } from '../utils/validation';

// Independent default PINs per organizer
const DEFAULT_ORGANIZER_PINS: Record<RecipientKey, string> = {
  mekhail: '011908',
  fayez: '332026',
};

function getOrganizerPinStorageKey(organizer: RecipientKey): string {
  return `${ADMIN_PIN_HASH_KEY}_${organizer}`;
}

export async function sha256Hex(value: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(value);
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Simple fallback if SubtleCrypto is unavailable
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

export async function getStoredAdminPinHash(organizer: RecipientKey): Promise<string> {
  try {
    const stored = localStorage.getItem(getOrganizerPinStorageKey(organizer));
    if (stored) return stored;
  } catch {
    // ignore
  }
  return sha256Hex(DEFAULT_ORGANIZER_PINS[organizer]);
}

export async function saveAdminPin(organizer: RecipientKey, newPin: string): Promise<void> {
  const hash = await sha256Hex(newPin);
  localStorage.setItem(getOrganizerPinStorageKey(organizer), hash);
}

interface AdminAuthGateProps {
  onAuthenticated: (organizerKey: RecipientKey) => void;
  onExitToPublic: () => void;
}

export function AdminAuthGate({ onAuthenticated, onExitToPublic }: AdminAuthGateProps) {
  const [selectedOrganizer, setSelectedOrganizer] = useState<RecipientKey>('mekhail');
  const [phoneInput, setPhoneInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const now = Date.now();
    if (lockedUntil > now) {
      const secs = Math.ceil((lockedUntil - now) / 1000);
      setError(`تم إيقاف المحاولات مؤقتاً — حاول مرة أخرى بعد ${secs} ثانية`);
      return;
    }

    const expectedAccount = ORGANIZER_ACCOUNTS[selectedOrganizer];
    const cleanPhone = normalizeDigits(phoneInput).replace(/^0+/, '');
    const cleanPin = pinInput.trim();

    if (!cleanPhone || !cleanPin) {
      setError('يرجى إدخال رقم هاتف المنظم والرمز السري للمتابعة');
      return;
    }

    setIsVerifying(true);
    try {
      const expectedHash = await getStoredAdminPinHash(selectedOrganizer);
      const enteredHash = await sha256Hex(cleanPin);

      const phoneMatches =
        cleanPhone === expectedAccount.phoneDigits ||
        cleanPhone === `20${expectedAccount.phoneDigits}`;

      if (phoneMatches && enteredHash === expectedHash) {
        setFailedAttempts(0);
        onAuthenticated(selectedOrganizer);
      } else {
        const nextFails = failedAttempts + 1;
        setFailedAttempts(nextFails);
        if (nextFails >= 5) {
          setLockedUntil(Date.now() + 30_000);
          setFailedAttempts(0);
          setError('تم إدخال بيانات غير صحيحة 5 مرات — تم قفل الدخول لمدة 30 ثانية');
        } else {
          setError('بيانات الدخول غير صحيحة — هذه اللوحة مخصصة لميخائيل إدور وفايز فيكتور فقط');
        }
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-12 sm:py-16">
      <div className="rounded-xl border border-[#E4DDD2] bg-white p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FAF4EC] text-[#9A5B25]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-extrabold text-[#1E1A16]">
            بوابة دخول المنظمين
          </h1>
          <p className="mt-1.5 text-sm text-[#6B6155]">
            هذه الصفحة مخفية ومخصصة للمنظمين المعتمدين فقط (ميخائيل إدور وفايز فيكتور).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#1E1A16]">
              اسم المنظم
            </label>
            <div className="grid grid-cols-2 gap-2.5" role="radiogroup">
              {RECIPIENT_LIST.map((org) => {
                const isSelected = selectedOrganizer === org.key;
                return (
                  <button
                    key={org.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setSelectedOrganizer(org.key);
                      setError('');
                    }}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#9A5B25] bg-[#FAF4EC] text-[#1E1A16]'
                        : 'border-[#D4CBBF] bg-white text-[#5C5349] hover:border-[#B7A997]'
                    }`}
                  >
                    {org.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="orgPhone"
              className="mb-1.5 block text-sm font-semibold text-[#1E1A16]"
            >
              رقم الهاتف المسجل للمنظم
            </label>
            <div
              dir="ltr"
              className="flex items-stretch overflow-hidden rounded-lg border border-[#D4CBBF] bg-white focus-within:border-[#9A5B25]"
            >
              <span className="flex select-none items-center border-r border-[#E4DDD2] bg-[#F5F1E9] px-3 font-mono-num text-sm font-bold text-[#1E1A16]">
                +20
              </span>
              <input
                id="orgPhone"
                type="tel"
                inputMode="numeric"
                value={phoneInput}
                onChange={(e) => setPhoneInput(normalizeDigits(e.target.value))}
                placeholder="1xxxxxxxxx"
                autoComplete="username"
                className="w-full bg-transparent px-3 py-2.5 font-mono-num text-sm text-[#1E1A16] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="orgPin"
              className="mb-1.5 block text-sm font-semibold text-[#1E1A16]"
            >
              الرمز السري للمنظمين
            </label>
            <input
              id="orgPin"
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="أدخل الرمز السري"
              autoComplete="current-password"
              className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3.5 py-2.5 font-mono-num text-sm text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[#1E1A16] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#3A3229] disabled:opacity-60 cursor-pointer"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{isVerifying ? 'جارٍ التحقق...' : 'دخول لوحة المنظمين'}</span>
          </button>
        </form>

        <div className="mt-5 border-t border-[#ECE6DC] pt-4 text-center">
          <button
            type="button"
            onClick={onExitToPublic}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B6155] hover:text-[#1E1A16] cursor-pointer"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>العودة إلى الصفحة الرئيسية</span>
          </button>
        </div>
      </div>
    </div>
  );
}
