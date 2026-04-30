import { google, type sheets_v4 } from 'googleapis';

export type OrderRow = {
  orderId: string;
  createdAt: string;
  email: string;
  name: string;
  items: string;
  totalCents: number;
  currency: string;
  shipAddress: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
  phone: string;
  status: string;
  tracking: string;
  notes: string;
};

const HEADERS: Array<keyof OrderRow> = [
  'orderId',
  'createdAt',
  'email',
  'name',
  'items',
  'totalCents',
  'currency',
  'shipAddress',
  'shipCity',
  'shipState',
  'shipZip',
  'shipCountry',
  'phone',
  'status',
  'tracking',
  'notes',
];

let cached: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (cached) return cached;

  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = new google.auth.GoogleAuth({
    ...(credentialsJson
      ? {
          credentials: JSON.parse(
            credentialsJson.startsWith('{')
              ? credentialsJson
              : Buffer.from(credentialsJson, 'base64').toString('utf-8'),
          ),
        }
      : {}),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  cached = google.sheets({ version: 'v4', auth });
  return cached;
}

function sheetId(): string {
  const id = process.env.ORDERS_SHEET_ID;
  if (!id) throw new Error('ORDERS_SHEET_ID is not set');
  return id;
}

function sheetName(): string {
  return process.env.ORDERS_SHEET_NAME ?? 'Sheet1';
}

export async function appendOrder(row: OrderRow): Promise<void> {
  const sheets = getSheets();
  const values = [HEADERS.map((h) => String(row[h] ?? ''))];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range: `${sheetName()}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

export async function fetchPublicOrders(limit = 50): Promise<
  Array<{
    orderId: string;
    createdAt: string;
    items: string;
    status: string;
    tracking: string;
  }>
> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${sheetName()}!A2:P`,
  });

  const rows = res.data.values ?? [];
  return rows.slice(-limit).reverse().map((r) => ({
    orderId: String(r[0] ?? ''),
    createdAt: String(r[1] ?? ''),
    items: String(r[4] ?? ''),
    status: String(r[13] ?? ''),
    tracking: String(r[14] ?? ''),
  }));
}

export type OrderDetail = {
  orderId: string;
  createdAt: string;
  email: string;
  name: string;
  items: string;
  totalCents: number;
  currency: string;
  status: string;
  tracking: string;
};

export async function fetchOrder(orderId: string): Promise<OrderDetail | null> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId(),
    range: `${sheetName()}!A2:P`,
  });

  const rows = res.data.values ?? [];
  const row = rows.find((r) => String(r[0] ?? '') === orderId);
  if (!row) return null;

  return {
    orderId: String(row[0] ?? ''),
    createdAt: String(row[1] ?? ''),
    email: String(row[2] ?? ''),
    name: String(row[3] ?? ''),
    items: String(row[4] ?? ''),
    totalCents: Number(row[5] ?? 0),
    currency: String(row[6] ?? 'USD'),
    status: String(row[13] ?? ''),
    tracking: String(row[14] ?? ''),
  };
}
