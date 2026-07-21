/**
 * excel.js — SheetJS wrapper for reading and writing Excel files
 * Supports .xlsx, .xls formats with full UTF-8 & Arabic support.
 */

/**
 * Read an Excel file and return array of row objects.
 * @param {File} file
 * @returns {Promise<{ headers: string[], rows: Object[] }>}
 */
export async function readExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellText: true, cellDates: true });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];

        // Pre-process cells to format dates as DD/MM/YYYY strings
        for (const key in sheet) {
          if (key.startsWith('!')) continue;
          const cell = sheet[key];
          if (cell && (cell.t === 'd' || cell.v instanceof Date)) {
            const d = cell.v;
            if (d instanceof Date && !isNaN(d.getTime())) {
              // Extract UTC components if SheetJS parsed it in UTC to avoid timezone shift,
              // or handle standard date component extraction.
              // SheetJS typically parses excel dates as UTC Date objects to avoid local time shifts.
              // Let's use getUTCDate/getUTCMonth/getUTCFullYear if the date represents a pure date.
              // In SheetJS with cellDates: true, dates are parsed as UTC to preserve the visual date.
              const day   = String(d.getUTCDate()).padStart(2, '0');
              const month = String(d.getUTCMonth() + 1).padStart(2, '0');
              const year  = d.getUTCFullYear();
              const formatted = `${day}/${month}/${year}`;
              cell.t = 's';
              cell.v = formatted;
              cell.w = formatted;
            }
          }
        }

        // Get rows as objects (header = first row)
        const rows = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw:    false,  // Convert everything to string for safe handling
        });

        // Get headers from the first row
        const range   = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        const headers = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c });
          headers.push(sheet[cellAddr] ? String(sheet[cellAddr].v) : `Column${c + 1}`);
        }

        resolve({ headers, rows });
      } catch (err) {
        reject(new Error(`Failed to parse Excel file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Create and download a new Excel file with Card_URL column added.
 * @param {Object[]} rows        - Original rows from input Excel
 * @param {string[]} headers     - Original headers
 * @param {Map<string, string>} urlMap - Map of Member_ID → Card_URL
 * @param {string=} filename     - Output filename
 */
export function writeExcel(rows, headers, urlMap, colMap, filename = 'members_output.xlsx') {
  // Build output rows with Card_URL column
  const outputRows = rows.map((row) => {
    // Extract memberId using the detected column mapping
    const memberId = String(row[colMap.memberCol] || '').trim();
    const url      = urlMap.get(memberId) || '';
    return { ...row, Card_URL: url };
  });

  // Ensure Card_URL is the last header
  const outHeaders = [...headers.filter(h => !['Card_URL','card_url','CARD_URL'].includes(h)), 'Card_URL'];

  // Create workbook
  const wb   = XLSX.utils.book_new();
  const ws   = XLSX.utils.json_to_sheet(outputRows, { header: outHeaders });

  // Style header row (bold) — SheetJS CE only supports basic styling via cell properties
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) {
      ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: '1e3a5f' } } };
    }
  }

  // Auto-size columns (approximate)
  const colWidths = outHeaders.map(h => ({ wch: Math.max(h.length + 2, 18) }));
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  XLSX.writeFile(wb, filename);
}

/**
 * Detect the actual column names for Name, Member_ID, Expiry
 * (case-insensitive, handles variations)
 * @param {string[]} headers
 * @returns {{ nameCol: string, memberCol: string, expiryCol: string }}
 */
export function detectColumns(headers) {
  const normalize = (s) => String(s).toLowerCase().replace(/[_\s-]/g, '');

  const find = (...candidates) => {
    for (const cand of candidates) {
      const match = headers.find(h => normalize(h) === normalize(cand));
      if (match) return match;
    }
    return null;
  };

  return {
    nameCol:   find('Name', 'الاسم', 'CustomerName', 'FullName', 'full_name') || headers[0] || 'Name',
    memberCol: find('Member_ID', 'MemberID', 'MemberId', 'member_id', 'ID', 'رقم العضوية', 'رقم_العضوية') || headers[1] || 'Member_ID',
    expiryCol: find('Expiry', 'ExpiryDate', 'Expiry_Date', 'expiry', 'تاريخ الانتهاء', 'تاريخ_الانتهاء') || headers[2] || 'Expiry',
    phoneCol:  find('Phone', 'Mobile', 'رقم الهاتف', 'الموبايل', 'الهاتف', 'phone_number') || headers[3] || 'Phone',
  };
}

/**
 * Generate and download a sample template Excel file.
 */
export function downloadTemplateExcel() {
  const headers = ['Name', 'Member_ID', 'Expiry', 'Phone'];
  const templateRows = [
    { Name: 'أحمد محمد', Member_ID: 'MEM-001', Expiry: '31/12/2025', Phone: '01012345678' },
    { Name: 'سارة أحمد', Member_ID: 'MEM-002', Expiry: '30/06/2026', Phone: '01087654321' }
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateRows, { header: headers });
  
  // Set column widths
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'members_template.xlsx');
}

