/**
 * ARMS – Premium Tenant Report Excel Export
 * Uses ExcelJS for full styling support: colors, borders, fonts, merges
 */

export interface TenantExportRow {
  no: number;
  name: string;
  phone: string;
  email: string;
  idNumber: string;
  unit: string;
  location: string;
  moveInDate: string;
  status: string;
  monthlyRent: number;
  totalOwed: number;
  totalPaid: number;
  outstandingBalance: number;
  penalty: number;
  monthsBehind: number;
}

export async function exportTenantsToExcel(
  rows: TenantExportRow[],
  reportTitle = 'Tenant Outstanding Balance Report',
  generatedBy = 'ARMS System'
) {
  // Dynamic import so it only loads client-side
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ARMS – Apartment & Rental Management System';
  wb.created = new Date();

  const ws = wb.addWorksheet('Tenant Report', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 5 }],
  });

  // ── Column definitions ──────────────────────────────────────────────────────
  const COLS = [
    { key: 'no',          header: '#',              width: 5  },
    { key: 'name',        header: 'Tenant Name',    width: 28 },
    { key: 'phone',       header: 'Phone',          width: 16 },
    { key: 'email',       header: 'Email',          width: 28 },
    { key: 'idNumber',    header: 'ID Number',      width: 14 },
    { key: 'unit',        header: 'Unit / Room',    width: 14 },
    { key: 'location',    header: 'Location',       width: 16 },
    { key: 'moveInDate',  header: 'Move-In Date',   width: 14 },
    { key: 'monthsBehind',header: 'Months Behind',  width: 14 },
    { key: 'monthlyRent', header: 'Rent/Month',     width: 15 },
    { key: 'totalOwed',   header: 'Total Owed',     width: 15 },
    { key: 'totalPaid',   header: 'Total Paid',     width: 15 },
    { key: 'penalty',     header: 'Penalty',        width: 12 },
    { key: 'outstandingBalance', header: 'Outstanding Balance', width: 20 },
    { key: 'status',      header: 'Status',         width: 12 },
  ];

  ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));
  const TOTAL_COLS = COLS.length; // 15
  const lastColLetter = 'O'; // col 15

  // ── Helper: border style ───────────────────────────────────────────────────
  const thinBorder = (color = 'FFBFBFBF') => ({
    top:    { style: 'thin' as const, color: { argb: color } },
    left:   { style: 'thin' as const, color: { argb: color } },
    bottom: { style: 'thin' as const, color: { argb: color } },
    right:  { style: 'thin' as const, color: { argb: color } },
  });
  const medBorder = (color = 'FF334155') => ({
    top:    { style: 'medium' as const, color: { argb: color } },
    left:   { style: 'medium' as const, color: { argb: color } },
    bottom: { style: 'medium' as const, color: { argb: color } },
    right:  { style: 'medium' as const, color: { argb: color } },
  });

  // ── ROW 1: Main title banner ───────────────────────────────────────────────
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleRow = ws.getRow(1);
  titleRow.height = 44;
  const titleCell = ws.getCell('A1');
  titleCell.value = '🏢  ARMS – Apartment & Rental Management System';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = medBorder('FF1E293B');

  // ── ROW 2: Report subtitle ─────────────────────────────────────────────────
  ws.mergeCells(`A2:${lastColLetter}2`);
  const subTitleRow = ws.getRow(2);
  subTitleRow.height = 28;
  const subCell = ws.getCell('A2');
  subCell.value = reportTitle.toUpperCase();
  subCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  subCell.border = medBorder('FF2563EB');

  // ── ROW 3: Meta info ───────────────────────────────────────────────────────
  ws.mergeCells(`A3:H3`);
  ws.mergeCells(`I3:${lastColLetter}3`);
  const metaRow = ws.getRow(3);
  metaRow.height = 20;
  const metaFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDBEAFE' } };
  const metaFont = { name: 'Calibri', size: 10, color: { argb: 'FF1E3A5F' } };

  const dateCell = ws.getCell('A3');
  dateCell.value = `📅 Generated: ${new Date().toLocaleString('en-KE', { dateStyle: 'full', timeStyle: 'short' })}`;
  dateCell.font = metaFont;
  dateCell.fill = metaFill;
  dateCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  dateCell.border = thinBorder('FFB3C6E7');

  const byCell = ws.getCell('I3');
  byCell.value = `👤 Generated by: ${generatedBy}     |     Total Tenants: ${rows.length}`;
  byCell.font = metaFont;
  byCell.fill = metaFill;
  byCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  byCell.border = thinBorder('FFB3C6E7');

  // ── ROW 4: Summary KPI strip ───────────────────────────────────────────────
  const kpiSplit = Math.floor(TOTAL_COLS / 3);
  ws.mergeCells(`A4:E4`);
  ws.mergeCells(`F4:J4`);
  ws.mergeCells(`K4:${lastColLetter}4`);
  const kpiRow = ws.getRow(4);
  kpiRow.height = 22;

  const totalOutstanding = rows.reduce((s, r) => s + r.outstandingBalance, 0);
  const totalPaidAll     = rows.reduce((s, r) => s + r.totalPaid, 0);
  const totalRent        = rows.reduce((s, r) => s + r.monthlyRent, 0);

  const kpiStyle = (fgColor: string, textColor: string) => ({
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: fgColor } },
    font: { name: 'Calibri', size: 10, bold: true, color: { argb: textColor } } as const,
    alignment: { horizontal: 'center' as const, vertical: 'middle' as const },
    border: thinBorder('FFCBD5E1'),
  });

  const kpi1 = ws.getCell('A4');
  kpi1.value = `💰 Total Outstanding: KES ${totalOutstanding.toLocaleString()}`;
  Object.assign(kpi1, kpiStyle('FFFEF2F2', 'FFB91C1C'));

  const kpi2 = ws.getCell('F4');
  kpi2.value = `✅ Total Paid All-Time: KES ${totalPaidAll.toLocaleString()}`;
  Object.assign(kpi2, kpiStyle('FFF0FDF4', 'FF15803D'));

  const kpi3 = ws.getCell('K4');
  kpi3.value = `🏠 Monthly Rent Roll: KES ${totalRent.toLocaleString()}`;
  Object.assign(kpi3, kpiStyle('FFEFF6FF', 'FF1D4ED8'));

  // ── ROW 5: Column headers ──────────────────────────────────────────────────
  const headerRow = ws.getRow(5);
  headerRow.height = 30;

  const HEADER_COLORS: Record<string, string> = {
    no:               'FFDDD6FE',
    name:             'FFC7D2FE',
    phone:            'FF99F6E4',
    email:            'FFA5F3FC',
    idNumber:         'FFFDE68A',
    unit:             'FFE9D5FF',
    location:         'FFE2E8F0',
    moveInDate:       'FFFDE68A',
    monthsBehind:     'FFFECDD3',
    monthlyRent:      'FFBBF7D0',
    totalOwed:        'FFFDE68A',
    totalPaid:        'FFA7F3D0',
    penalty:          'FFFECACA',
    outstandingBalance:'FFFCA5A5',
    status:           'FFA7F3D0',
  };

  COLS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLORS[col.key] || 'FFE2E8F0' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top:    { style: 'medium', color: { argb: 'FF334155' } },
      left:   { style: 'thin',   color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF334155' } },
      right:  { style: 'thin',   color: { argb: 'FF94A3B8' } },
    };
  });

  // ── DATA ROWS ──────────────────────────────────────────────────────────────
  const ROW_FILLS = ['FFFAFAFA', 'FFFFFFFF']; // alternating

  rows.forEach((r, idx) => {
    const dataRow = ws.addRow({
      no:               r.no,
      name:             r.name,
      phone:            r.phone,
      email:            r.email,
      idNumber:         r.idNumber,
      unit:             r.unit,
      location:         r.location,
      moveInDate:       r.moveInDate,
      monthsBehind:     r.monthsBehind,
      monthlyRent:      r.monthlyRent,
      totalOwed:        r.totalOwed,
      totalPaid:        r.totalPaid,
      penalty:          r.penalty,
      outstandingBalance: r.outstandingBalance,
      status:           r.status,
    });
    dataRow.height = 20;
    const altFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: ROW_FILLS[idx % 2] } };

    dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const key = COLS[colNum - 1]?.key;
      // Currency columns
      if (['monthlyRent','totalOwed','totalPaid','penalty','outstandingBalance'].includes(key)) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (key === 'no' || key === 'monthsBehind') {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }
      cell.font = { name: 'Calibri', size: 9.5 };

      // Outstanding balance cell: red highlight if > 0
      if (key === 'outstandingBalance') {
        const val = r.outstandingBalance;
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: val > 0 ? 'FFFFF0F0' : 'FFF0FFF4' },
        };
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: val > 0 ? 'FFB91C1C' : 'FF15803D' } };
      } else if (key === 'status') {
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: r.status === 'Active' ? 'FFF0FFF4' : 'FFFFF0F0' },
        };
        cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: r.status === 'Active' ? 'FF15803D' : 'FFB91C1C' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (key === 'monthsBehind') {
        const mb = r.monthsBehind;
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: mb >= 3 ? 'FFFEE2E2' : mb >= 1 ? 'FFFEF9C3' : 'FFF0FDF4' },
        };
        cell.font = { name: 'Calibri', size: 9.5, bold: mb > 0, color: { argb: mb >= 3 ? 'FFB91C1C' : mb >= 1 ? 'FF92400E' : 'FF15803D' } };
      } else {
        cell.fill = altFill;
      }

      cell.border = thinBorder('FFE2E8F0');
    });
  });

  // ── TOTALS ROW ─────────────────────────────────────────────────────────────
  const totalsRow = ws.addRow({
    no:               '',
    name:             `TOTAL  (${rows.length} tenants)`,
    phone:            '',
    email:            '',
    idNumber:         '',
    unit:             '',
    location:         '',
    moveInDate:       '',
    monthsBehind:     '',
    monthlyRent:      rows.reduce((s, r) => s + r.monthlyRent, 0),
    totalOwed:        rows.reduce((s, r) => s + r.totalOwed, 0),
    totalPaid:        rows.reduce((s, r) => s + r.totalPaid, 0),
    penalty:          rows.reduce((s, r) => s + r.penalty, 0),
    outstandingBalance: totalOutstanding,
    status:           '',
  });
  totalsRow.height = 26;
  totalsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const key = COLS[colNum - 1]?.key;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.border = medBorder('FF0F172A');
    if (['monthlyRent','totalOwed','totalPaid','penalty','outstandingBalance'].includes(key)) {
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (key === 'outstandingBalance') cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFBBF24' } };
    } else if (key === 'name') {
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    } else {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  // ── FOOTER ROW ─────────────────────────────────────────────────────────────
  ws.addRow([]);
  const footerRowNum = ws.rowCount + 1;
  ws.mergeCells(`A${footerRowNum}:${lastColLetter}${footerRowNum}`);
  const footerRow = ws.getRow(footerRowNum);
  footerRow.height = 18;
  const footerCell = ws.getCell(`A${footerRowNum}`);
  footerCell.value = `ARMS – Apartment & Rental Management System  |  Confidential  |  Generated ${new Date().toLocaleString('en-KE')}`;
  footerCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF94A3B8' } };
  footerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  footerCell.border = thinBorder('FFE2E8F0');

  // ── Auto-filter on header row ──────────────────────────────────────────────
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: TOTAL_COLS } };

  // ── Print settings ─────────────────────────────────────────────────────────
  ws.headerFooter.oddHeader = `&C&"Calibri,Bold"&14ARMS – Tenant Report`;
  ws.headerFooter.oddFooter = `&L&8Confidential&C&8Page &P of &N&R&8Generated: ${new Date().toLocaleDateString('en-KE')}`;

  // ── Download ───────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ARMS_Tenant_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
