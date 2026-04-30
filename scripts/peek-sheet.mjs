import { google } from 'googleapis';

const KEY_PATH = new URL('../secrets/swag-store-sheets-key.json', import.meta.url);
const SPREADSHEET_ID = '1NUefLPL4rJknu1sjjAeQ6Xd6qMBwdFAIL2eExvJVCxA';

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_PATH.pathname,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: SPREADSHEET_ID,
  range: 'Sheet1!A1:P10',
});

console.log(JSON.stringify(res.data.values, null, 2));
