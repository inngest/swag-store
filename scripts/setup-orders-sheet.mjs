// One-off: writes the canonical header row to the Inngest Swag Orders sheet.
// Run: node scripts/setup-orders-sheet.mjs <spreadsheetId>

import { google } from 'googleapis';

const SPREADSHEET_ID = process.argv[2];
if (!SPREADSHEET_ID) {
  console.error('Usage: node scripts/setup-orders-sheet.mjs <spreadsheetId>');
  process.exit(1);
}

const KEY_PATH = new URL('../secrets/swag-store-sheets-key.json', import.meta.url);

const HEADERS = [
  'order_id',
  'created_at',
  'email',
  'name',
  'items',
  'total_cents',
  'currency',
  'ship_address',
  'ship_city',
  'ship_state',
  'ship_zip',
  'ship_country',
  'phone',
  'status',
  'tracking',
  'notes',
];

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_PATH.pathname,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
const firstSheet = meta.data.sheets?.[0]?.properties;
const sheetTitle = firstSheet?.title ?? 'Sheet1';
const sheetId = firstSheet?.sheetId ?? 0;

await sheets.spreadsheets.values.update({
  spreadsheetId: SPREADSHEET_ID,
  range: `${sheetTitle}!A1`,
  valueInputOption: 'RAW',
  requestBody: { values: [HEADERS] },
});

await sheets.spreadsheets.batchUpdate({
  spreadsheetId: SPREADSHEET_ID,
  requestBody: {
    requests: [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.95, green: 0.95, blue: 0.92 },
            },
          },
          fields: 'userEnteredFormat(textFormat,backgroundColor)',
        },
      },
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
          fields: 'gridProperties.frozenRowCount',
        },
      },
    ],
  },
});

console.log(JSON.stringify({ spreadsheetId: SPREADSHEET_ID, sheetTitle, ok: true }, null, 2));
