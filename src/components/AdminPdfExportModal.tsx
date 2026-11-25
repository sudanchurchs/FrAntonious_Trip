import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, X } from 'lucide-react';
import {
  BUS_LIST,
  COLOR_GROUP_LIST,
  LABELS,
  type BusKey,
  type ColorGroupKey,
  type RegistrationRecord,
} from '../types/trip';
import {
  calculateAgeFromBirthDate,
  getMemberBus,
  getMemberColor,
  type CapacityCounts,
} from '../utils/validation';

type PdfGroupMode = 'bus_then_color' | 'by_bus' | 'by_color' | 'unified';
type PdfStatusScope = 'active_only' | 'paid_only' | 'all_including_cancelled';
type PdfDataScope = 'filtered' | 'all';

interface FlatParticipantRow {
  regId: number;
  seqNo?: number;
  memberId: string;
  name: string;
  phone: string;
  age: number | null;
  isMain: boolean;
  paid: boolean;
  cancelled: boolean;
  bus: BusKey;
  colorGroup: ColorGroupKey;
  recipientLabel: string;
  paymentLabel: string;
}

interface RosterSection {
  id: string;
  title: string;
  subtitle: string;
  accentHex: string;
  rows: FlatParticipantRow[];
  paidCount: number;
  unpaidCount: number;
  cancelledCount: number;
}

interface AdminPdfExportModalProps {
  isOpen: boolean;
  allRegistrations: RegistrationRecord[];
  filteredRegistrations: RegistrationRecord[];
  capacities: CapacityCounts;
  hasActiveFilters: boolean;
  onClose: () => void;
}

const COLOR_HEX_MAP: Record<ColorGroupKey, string> = {
  pink: '#DB2777',
  black: '#18181B',
  yellow: '#CA8A04',
  green: '#15803D',
};

const BUS_HEX_MAP: Record<BusKey, string> = {
  bus1: '#7C4518',
  bus2: '#0B5D6B',
};

export function AdminPdfExportModal({
  isOpen,
  allRegistrations,
  filteredRegistrations,
  capacities,
  hasActiveFilters,
  onClose,
}: AdminPdfExportModalProps) {
  const [groupMode, setGroupMode] = useState<PdfGroupMode>('bus_then_color');
  const [statusScope, setStatusScope] = useState<PdfStatusScope>('active_only');
  const [dataScope, setDataScope] = useState<PdfDataScope>(hasActiveFilters ? 'filtered' : 'all');
  const [includePhones, setIncludePhones] = useState(true);
  const [includeCheckboxes, setIncludeCheckboxes] = useState(true);
  const [pageBreakBetweenSections, setPageBreakBetweenSections] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setDataScope(hasActiveFilters ? 'filtered' : 'all');
  }, [isOpen, hasActiveFilters]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const sourceRegs = dataScope === 'filtered' ? filteredRegistrations : allRegistrations;

  const flatRows = useMemo<FlatParticipantRow[]>(() => {
    const list: FlatParticipantRow[] = [];
    for (const reg of sourceRegs) {
      for (const m of reg.members) {
        if (statusScope === 'active_only' && m.cancelled) continue;
        if (statusScope === 'paid_only' && (m.cancelled || !m.paid)) continue;
        list.push({
          regId: reg.id,
          seqNo: reg.seqNo,
          memberId: m.id,
          name: m.name,
          phone: m.phone,
          age: calculateAgeFromBirthDate(m.birthDate),
          isMain: m.isMain,
          paid: m.paid,
          cancelled: m.cancelled,
          bus: getMemberBus(m, reg),
          colorGroup: getMemberColor(m, reg),
          recipientLabel: LABELS.recipients[reg.recipient],
          paymentLabel: LABELS.payments[reg.paymentMethod],
        });
      }
    }
    return list;
  }, [sourceRegs, statusScope]);

  const summaryCounts = useMemo(() => {
    let paid = 0;
    let unpaid = 0;
    let cancelled = 0;
    for (const row of flatRows) {
      if (row.cancelled) cancelled++;
      else if (row.paid) paid++;
      else unpaid++;
    }
    return {
      total: flatRows.length,
      active: paid + unpaid,
      paid,
      unpaid,
      cancelled,
    };
  }, [flatRows]);

  const sections = useMemo<RosterSection[]>(() => {
    const buildSection = (
      id: string,
      title: string,
      subtitle: string,
      accentHex: string,
      rows: FlatParticipantRow[]
    ): RosterSection => {
      let paidCount = 0;
      let unpaidCount = 0;
      let cancelledCount = 0;
      for (const r of rows) {
        if (r.cancelled) cancelledCount++;
        else if (r.paid) paidCount++;
        else unpaidCount++;
      }
      return { id, title, subtitle, accentHex, rows, paidCount, unpaidCount, cancelledCount };
    };

    if (groupMode === 'unified') {
      return [
        buildSection(
          'unified',
          'الكشف الشامل لجميع المشاركين',
          `إجمالي المدرجين في الكشف: ${flatRows.length} فرد`,
          '#7C4518',
          flatRows
        ),
      ];
    }

    if (groupMode === 'by_bus') {
      return BUS_LIST.map((bus) => {
        const rows = flatRows.filter((r) => r.bus === bus.key);
        const cap = capacities.buses[bus.key];
        return buildSection(
          bus.key,
          `كشف ${bus.label}`,
          `المؤكد بالدفع: ${cap.confirmed} / ${cap.limit} · متبقي ${cap.remaining} مقعد`,
          BUS_HEX_MAP[bus.key],
          rows
        );
      });
    }

    if (groupMode === 'by_color') {
      return COLOR_GROUP_LIST.map((group) => {
        const rows = flatRows.filter((r) => r.colorGroup === group.key);
        const cap = capacities.colors[group.key];
        return buildSection(
          group.key,
          `كشف قروب ${LABELS.colors[group.key]}`,
          `المؤكد بالدفع: ${cap.confirmed} / ${cap.limit} · متبقي ${cap.remaining} مقعد`,
          COLOR_HEX_MAP[group.key],
          rows
        );
      });
    }

    // bus_then_color
    const result: RosterSection[] = [];
    for (const bus of BUS_LIST) {
      for (const group of COLOR_GROUP_LIST) {
        const rows = flatRows.filter((r) => r.bus === bus.key && r.colorGroup === group.key);
        if (rows.length === 0) continue;
        result.push(
          buildSection(
            `${bus.key}_${group.key}`,
            `${bus.label} — قروب ${LABELS.colors[group.key]}`,
            `العدد في هذه المجموعة: ${rows.length} فرد`,
            COLOR_HEX_MAP[group.key],
            rows
          )
        );
      }
    }
    return result;
  }, [flatRows, groupMode, capacities]);

  const generatedAt = useMemo(() => {
    const now = new Date();
    return now.toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [isOpen]);

  const handlePrintToPdf = () => {
    const originalTitle = document.title;
    const todayIso = new Date().toISOString().slice(0, 10);
    document.title = `كشف-رحلة-دير-الأنبا-أنطونيوس-${todayIso}`;

    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 3000);
  };

  if (!isOpen) return null;

  const statusScopeLabel =
    statusScope === 'paid_only'
      ? 'المؤكدين بالدفع فقط'
      : statusScope === 'active_only'
        ? 'النشطين فقط (بدون الملغيين)'
        : 'جميع المسجلين (شامل الملغيين)';

  const renderRosterDocument = (forPrint: boolean) => (
    <div className={forPrint ? 'space-y-5 text-[#1E1A16]' : 'space-y-6 text-[#1E1A16]'}>
      {/* Document Header */}
      <div className="pdf-avoid-break border-b-2 border-[#7C4518] pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-[#7C4518]">
              اجتماع شباب الثلاثة فتية — رحلة دير القديس العظيم الأنبا أنطونيوس بالبحر الأحمر
            </p>
            <h1 className="mt-0.5 font-display text-xl font-extrabold text-[#1E1A16]">
              كشف المشاركين وتوزيع الباصات والمجموعات اللونية
            </h1>
          </div>
          <div className="text-left text-[11px] text-[#5C5349] tabular-nums">
            <p>
              تاريخ التصدير: <strong className="font-mono-num text-[#1E1A16]">{generatedAt}</strong>
            </p>
            <p className="mt-0.5">نطاق الحالة: {statusScopeLabel}</p>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
          <div className="rounded-md border border-[#E4DDD2] bg-[#FAF8F4] px-2.5 py-2 text-xs tabular-nums">
            <p className="text-[10px] text-[#6B6155]">إجمالي الكشف</p>
            <p className="font-mono-num text-sm font-extrabold text-[#1E1A16]">
              {summaryCounts.total} فرد
            </p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-2.5 py-2 text-xs tabular-nums">
            <p className="text-[10px] text-emerald-800">مؤكد الدفع</p>
            <p className="font-mono-num text-sm font-extrabold text-emerald-800">
              {summaryCounts.paid} فرد
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-xs tabular-nums">
            <p className="text-[10px] text-amber-800">لم يدفع</p>
            <p className="font-mono-num text-sm font-extrabold text-amber-800">
              {summaryCounts.unpaid} فرد
            </p>
          </div>
          {BUS_LIST.map((bus) => {
            const stat = capacities.buses[bus.key];
            return (
              <div
                key={bus.key}
                className="rounded-md border border-[#E4DDD2] bg-white px-2.5 py-2 text-xs tabular-nums"
              >
                <p className="text-[10px] text-[#6B6155]">{bus.label}</p>
                <p className="font-mono-num text-sm font-extrabold text-[#1E1A16]">
                  {stat.confirmed} / {stat.limit}
                </p>
              </div>
            );
          })}
          <div className="rounded-md border border-[#E4DDD2] bg-white px-2.5 py-2 text-xs tabular-nums">
            <p className="text-[10px] text-[#6B6155]">القروبات (مؤكد)</p>
            <p className="font-mono-num text-[11px] font-bold text-[#1E1A16]">
              و:{capacities.colors.pink.confirmed} · س:{capacities.colors.black.confirmed} · ص:
              {capacities.colors.yellow.confirmed} · خ:{capacities.colors.green.confirmed}
            </p>
          </div>
        </div>
      </div>

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="rounded-lg border border-[#E4DDD2] bg-[#FAF8F4] px-6 py-10 text-center text-sm text-[#6B6155]">
          لا يوجد مشاركون مطابقون للخيارات المحددة حالياً.
        </div>
      ) : (
        sections.map((section, sectionIdx) => (
          <section
            key={section.id}
            className={
              forPrint && pageBreakBetweenSections && sectionIdx > 0
                ? 'pdf-section-break space-y-2'
                : 'space-y-2'
            }
          >
            <div className="pdf-avoid-break flex flex-wrap items-center justify-between gap-2 border-b border-[#D4CBBF] pb-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-xs shrink-0"
                  style={{ backgroundColor: section.accentHex }}
                />
                <h2 className="font-display text-base font-extrabold text-[#1E1A16]">
                  {section.title}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5C5349] tabular-nums">
                <span>{section.subtitle}</span>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-emerald-700">مدفوع: {section.paidCount}</span>
                <span aria-hidden="true">·</span>
                <span className="font-bold text-amber-700">معلق: {section.unpaidCount}</span>
                {section.cancelledCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-red-700">ملغي: {section.cancelledCount}</span>
                  </>
                )}
              </div>
            </div>

            {section.rows.length === 0 ? (
              <p className="rounded-md border border-[#ECE6DC] bg-[#FAF8F4] px-4 py-3 text-xs text-[#6B6155]">
                لا يوجد مشاركون في هذا القسم حالياً.
              </p>
            ) : (
              <div className={forPrint ? '' : 'overflow-x-auto'}>
                <table className="w-full border-collapse text-right text-xs">
                  <thead>
                    <tr className="border-y border-[#CFC5B6] bg-[#F5F1E9] text-[11px] font-bold text-[#1E1A16]">
                      <th className="w-9 px-2 py-2 text-center">#</th>
                      <th className="px-2.5 py-2">الاسم الثلاثي</th>
                      {includePhones && <th className="px-2 py-2">رقم الهاتف</th>}
                      <th className="w-12 px-2 py-2 text-center">العمر</th>
                      <th className="px-2 py-2">الباص</th>
                      <th className="px-2 py-2">القروب</th>
                      <th className="px-2 py-2">حالة الدفع</th>
                      <th className="px-2 py-2">المستلم</th>
                      {includeCheckboxes && <th className="w-14 px-2 py-2 text-center">حضور</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6DFD3]">
                    {section.rows.map((row, idx) => (
                      <tr
                        key={`${section.id}_${row.memberId}`}
                        className={
                          row.cancelled
                            ? 'bg-red-50/40 text-red-800'
                            : idx % 2 === 1
                              ? 'bg-[#FCFBF8]'
                              : 'bg-white'
                        }
                      >
                        <td className="px-2 py-1.5 text-center font-mono-num text-[11px] font-semibold text-[#5C5349] tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="px-2.5 py-1.5 font-bold text-[#1E1A16]">
                          <span className={row.cancelled ? 'line-through text-red-700' : ''}>
                            {row.name}
                          </span>
                        </td>
                        {includePhones && (
                          <td
                            className="px-2 py-1.5 font-mono-num text-[11px] text-[#4E463D] tabular-nums whitespace-nowrap"
                            dir="ltr"
                          >
                            {row.phone}
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-center font-mono-num text-[11px] text-[#4E463D] tabular-nums">
                          {row.age !== null ? row.age : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-[11px] text-[#1E1A16] whitespace-nowrap">
                          {LABELS.buses[row.bus]}
                        </td>
                        <td className="px-2 py-1.5 text-[11px] font-semibold whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="inline-block h-2 w-2 rounded-xs shrink-0"
                              style={{ backgroundColor: COLOR_HEX_MAP[row.colorGroup] }}
                            />
                            <span>{LABELS.colors[row.colorGroup]}</span>
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[11px] font-bold whitespace-nowrap">
                          <span
                            className={
                              row.cancelled
                                ? 'text-red-700'
                                : row.paid
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                            }
                          >
                            {row.cancelled ? 'ملغي' : row.paid ? 'مدفوع' : 'لم يدفع'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-[11px] text-[#5C5349] whitespace-nowrap">
                          {row.recipientLabel}
                        </td>
                        {includeCheckboxes && (
                          <td className="px-2 py-1.5 text-center">
                            <span
                              aria-hidden="true"
                              className="inline-block h-3.5 w-3.5 rounded-xs border border-[#8C8173] bg-white align-middle"
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );

  return (
    <>
      {/* Interactive PDF Configuration & Live Preview Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-export-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E1A16]/55 p-3 backdrop-blur-xs sm:p-5"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#DFD7CA] bg-[#F9F7F3] shadow-xl">
          {/* Modal Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[#E4DDD2] bg-white px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#9A5B25]/12 text-[#7C4518]">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2
                  id="pdf-export-modal-title"
                  className="font-display text-base font-extrabold text-[#1E1A16] sm:text-lg"
                >
                  تصدير كشف المشاركين إلى ملف PDF منظم
                </h2>
                <p className="text-xs text-[#6B6155]">
                  اختر طريقة تنظيم الباصات والمجموعات اللونية ثم اضغط «حفظ / طباعة PDF»
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق نافذة تصدير PDF"
              className="rounded-lg p-1.5 text-[#6B6155] transition-colors hover:bg-[#F5F1E9] hover:text-[#1E1A16] cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Options Toolbar */}
          <div className="grid grid-cols-1 gap-3 border-b border-[#E4DDD2] bg-[#FAF8F4] px-5 py-3.5 md:grid-cols-3">
            <div>
              <label
                htmlFor="pdfGroupMode"
                className="mb-1 block text-xs font-bold text-[#4E463D]"
              >
                طريقة تنظيم الكشف
              </label>
              <select
                id="pdfGroupMode"
                value={groupMode}
                onChange={(e) => setGroupMode(e.target.value as PdfGroupMode)}
                className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 text-xs font-semibold text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
              >
                <option value="bus_then_color">حسب الباص ثم القروب اللوني</option>
                <option value="by_bus">حسب الباصات فقط (الباص 1 / الباص 2)</option>
                <option value="by_color">حسب القروبات اللونية فقط (وردي / أسود / أصفر / أخضر)</option>
                <option value="unified">جدول موحد لجميع المشاركين</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="pdfStatusScope"
                className="mb-1 block text-xs font-bold text-[#4E463D]"
              >
                حالة المشاركين المدرجين
              </label>
              <select
                id="pdfStatusScope"
                value={statusScope}
                onChange={(e) => setStatusScope(e.target.value as PdfStatusScope)}
                className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 text-xs font-semibold text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
              >
                <option value="active_only">النشطين فقط (مدفوع + لم يدفع)</option>
                <option value="paid_only">المؤكدين بالدفع فقط</option>
                <option value="all_including_cancelled">جميع المسجلين (شامل الملغيين)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="pdfDataScope"
                className="mb-1 block text-xs font-bold text-[#4E463D]"
              >
                نطاق البيانات
              </label>
              <select
                id="pdfDataScope"
                value={dataScope}
                onChange={(e) => setDataScope(e.target.value as PdfDataScope)}
                className="w-full rounded-lg border border-[#D4CBBF] bg-white px-3 py-2 text-xs font-semibold text-[#1E1A16] focus:border-[#9A5B25] focus:outline-none"
              >
                <option value="all">كل مسجلي الرحلة ({allRegistrations.length} حجز)</option>
                <option value="filtered">
                  نتائج الفرز الحالية فقط ({filteredRegistrations.length} حجز)
                </option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-xs font-semibold text-[#4E463D] md:col-span-3">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePhones}
                  onChange={(e) => setIncludePhones(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D4CBBF] accent-[#9A5B25]"
                />
                <span>إظهار أرقام الهواتف</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCheckboxes}
                  onChange={(e) => setIncludeCheckboxes(e.target.checked)}
                  className="h-4 w-4 rounded border-[#D4CBBF] accent-[#9A5B25]"
                />
                <span>إضافة عمود «حضور ☐» للنداء في الباص</span>
              </label>

              {groupMode !== 'unified' && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pageBreakBetweenSections}
                    onChange={(e) => setPageBreakBetweenSections(e.target.checked)}
                    className="h-4 w-4 rounded border-[#D4CBBF] accent-[#9A5B25]"
                  />
                  <span>بدء كل باص / قروب في صفحة PDF مستقلة</span>
                </label>
              )}
            </div>
          </div>

          {/* Live A4 Preview Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="mx-auto max-w-4xl rounded-lg border border-[#DFD7CA] bg-white p-5 shadow-xs sm:p-7">
              {renderRosterDocument(false)}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4DDD2] bg-white px-5 py-3.5">
            <p className="text-xs text-[#6B6155]">
              في نافذة الطباعة اختر <strong className="text-[#1E1A16]">حفظ بتنسيق PDF (Save as PDF)</strong> لتنزيل الملف منظماً ومقاس A4.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[40px] rounded-lg border border-[#D4CBBF] bg-white px-4 py-2 text-xs font-semibold text-[#5C5349] transition-colors hover:bg-[#F5F1E9] whitespace-nowrap cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                disabled={flatRows.length === 0}
                onClick={handlePrintToPdf}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#9A5B25] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#7C4518] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>حفظ / طباعة كملف PDF ({summaryCounts.total} فرد)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Full-Page Print Portal (rendered only during @media print) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="trip-pdf-print-root" dir="rtl">
            {renderRosterDocument(true)}
          </div>,
          document.body
        )}
    </>
  );
}
