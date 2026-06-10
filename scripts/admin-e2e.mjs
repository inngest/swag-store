import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import pg from 'pg';

const { Pool } = pg;

const cwd = process.cwd();
loadDotEnv(`${cwd}/.env.local`);
loadDotEnv(`${cwd}/.env`);

const baseUrl = process.env.ADMIN_E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const testUserId = process.env.CLERK_TEST_USER_ID ?? 'user_3EMW8NVi27PWaag3kEDCT8tHKyl';
const runId = `E2E-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const productId = `e2e-product-${runId.toLowerCase()}`;
const productSlug = productId;
const productName = `E2E Product ${runId}`;
const manualCode = `E2E${runId.replace(/[^A-Z0-9]/g, '').slice(-12)}`;
const orderId = `e2e-order-${runId.toLowerCase()}`;
const apiTokenName = `E2E API ${runId}`;
const importSource = `E2E Import ${runId}`;
const hasSheetImportConfig = Boolean(process.env.INVENTORY_SHEET_ID || process.env.ORDERS_SHEET_ID);
const inventoryImportCsv = [
  'item,S,M,L,XL,XXL,XXXL',
  'Anti Anti Infra Co.,20,24,21,23,11,7',
  'Step.run Socks,58,,,,,',
  'Durable Workflow Hoodie,8,14,16,11,5,',
  'Moss Ops Cap,42,,,,,',
  'Workflow Sticker Pack,120,,,,,',
].join('\n');
const screenshots = [];
const consoleErrors = [];
const consoleWarnings = [];
const steps = [];

let pool;
let browser;
let page;
let catalogStockSnapshot = [];

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = stripQuotes(match[2].trim());
  }
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function note(name) {
  steps.push(name);
  console.log(`ok - ${name}`);
}

function isNonFatalBrowserMessage(message) {
  return message.includes('hydrated but some attributes of the server rendered HTML') ||
    message.includes('Clerk has been loaded with development keys');
}

async function screenshot(name) {
  const file = join(tmpdir(), `swag-admin-${runId}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  screenshots.push(file);
}

async function expectVisible(locator, label, timeout = 10000) {
  await locator.waitFor({ state: 'visible', timeout });
  note(label);
}

async function clickButton(name, exact = true) {
  const button = page.getByRole('button', { name, exact });
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.click();
  note(`clicked ${name}`);
}

async function tab(name, expected) {
  await clickButton(name);
  await expectVisible(page.getByText(expected, { exact: true }), `tab ${name} shows ${expected}`);
}

async function tabWithoutTestOrder(name) {
  await clickButton(name);
  await expectVisible(page.getByText('TRACKING', { exact: true }), `tab ${name} shows orders table`);
  if ((await testOrderLink().count()) !== 0) {
    throw new Error(`Test order ${orderId} should not appear in the ${name} queue.`);
  }
  note(`tab ${name} does not list test order`);
}

function testOrderLink() {
  return page.getByRole('link', { name: orderId, exact: true });
}

function testOrderRow() {
  return testOrderLink().locator('xpath=ancestor::div[contains(@style, "grid-template-columns")][1]');
}

function createSignInUrl() {
  if (process.env.CLERK_SIGN_IN_URL) return process.env.CLERK_SIGN_IN_URL;
  const body = JSON.stringify({ user_id: testUserId });
  const raw = execFileSync('clerk', ['api', '/sign_in_tokens', '-d', body, '--yes'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(raw);
  const ticket = encodeURIComponent(parsed.token);
  const redirect = encodeURIComponent(`${baseUrl}/admin`);
  return `${baseUrl}/sign-in?__clerk_ticket=${ticket}&redirect_url=${redirect}`;
}

async function openAdmin() {
  if (process.env.ADMIN_E2E_BYPASS === '1') {
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    return;
  }

  const signInUrl = createSignInUrl();
  await page.goto(signInUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/admin/, { timeout: 30000 }).catch(async () => {
    await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
  });
}

async function setupDb() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for admin E2E setup.');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false },
  });
  await cleanupDb();
  await pool.query(
    `insert into orders (
       order_id, created_at, customer_email, customer_name, customer_phone,
       items, total_cents, currency, ship_address, ship_city, ship_state,
       ship_zip, ship_country, status, tracking, notes, stripe_session_id,
       discount_code, discount_amount_cents, updated_at
     )
     values ($1, now(), 'e2e@inngest.com', 'E2E Tester', '', 'E2E Product x 1',
       1234, 'USD', '1 Test Way', 'San Francisco', 'CA', '94107', 'US',
       'pending', '', 'seeded by admin e2e', $2, '', 0, now())`,
    [orderId, `e2e-${runId}`],
  );
}

async function cleanupDb() {
  if (!pool) return;
  await pool.query('delete from order_items where order_id = $1', [orderId]);
  await pool.query('delete from orders where order_id = $1', [orderId]);
  await pool.query('delete from product_variants where product_id = $1', [productId]);
  await pool.query('delete from products where id = $1 or slug = $2', [productId, productSlug]);
  await pool.query("delete from discount_codes where code = $1 or label like $2 or label like $3", [
    manualCode,
    `%${runId}%`,
    '%E2E Tester%',
  ]);
  await pool.query("update api_tokens set active = false, revoked_at = coalesce(revoked_at, now()) where name = $1", [
    apiTokenName,
  ]);
  await pool.query("delete from inventory_import_runs where source like $1", [`%${runId}%`]);
  await restoreCatalogStock();
}

async function snapshotCatalogStock() {
  if (!pool) return;
  const res = await pool.query('select id, stock from product_variants');
  catalogStockSnapshot = res.rows.map((row) => ({
    id: String(row.id),
    stock: Number(row.stock ?? 0),
  }));
}

async function restoreCatalogStock() {
  if (!pool || catalogStockSnapshot.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const row of catalogStockSnapshot) {
      await client.query(
        'update product_variants set stock = $1, updated_at = now() where id = $2',
        [row.stock, row.id],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
    });
  }
}

async function authenticate() {
  await openAdmin();
  await expectVisible(page.getByRole('heading', { name: 'Swag ops.', exact: true }), 'authenticated admin page loaded');
  await screenshot('admin-home');
}

async function testNavigationAndTopButtons() {
  await tab('Inventory', 'ITEM');
  await tab('Products', 'NEW PRODUCT');
  await tab('Pending', orderId);
  await tabWithoutTestOrder('Fulfilled');
  await tabWithoutTestOrder('Shipped');
  await tab('Discounts', 'SWAG CODE AGENT');
  await tab('API Tokens', 'MCP / AI ACCESS');
  await tab('Imports', 'LLM REVIEWED DOCUMENT IMPORT');
  await clickButton('REFRESH');
  await expectVisible(page.getByText(/ADMIN DASHBOARD/i), 'refresh completed');
  if (hasSheetImportConfig) {
    await clickButton('IMPORT SHEET');
    await expectVisible(page.getByText(/import requested|starting import|subscribed|realtime error/i), 'import sheet request surfaced status');
  } else {
    const importSheetButton = page.getByRole('button', { name: 'IMPORT SHEET', exact: true });
    if (await importSheetButton.isEnabled()) {
      throw new Error('IMPORT SHEET should be disabled when INVENTORY_SHEET_ID and ORDERS_SHEET_ID are missing.');
    }
    note('skipped sheet import: INVENTORY_SHEET_ID or ORDERS_SHEET_ID not configured');
  }
}

async function testInventory() {
  await tab('Inventory', 'ITEM');
  const stockInput = page.locator('input').first();
  await stockInput.waitFor({ state: 'visible', timeout: 10000 });
  const current = await stockInput.inputValue();
  await stockInput.fill(current);
  await page.getByRole('button', { name: 'SAVE', exact: true }).first().click();
  note('inventory row save clicked');
}

async function testProducts() {
  await tab('Products', 'NEW PRODUCT');
  await page.getByPlaceholder('Anti Anti Infra Co.').fill(productName);
  await page.getByPlaceholder('INN-TEE-01').fill(`E2E-${runId.slice(-6)}`);
  await page.getByPlaceholder('anti-anti-infra-tee').fill(productSlug);
  await page.getByPlaceholder('T-Shirt').fill('T-Shirt');
  await page.getByPlaceholder('28').fill('19.50');
  await page.getByPlaceholder('/products/shirt-grey.png').fill('/products/e2e.png');
  await page.getByPlaceholder('linear-gradient(...)').fill('linear-gradient(135deg, #f6f3ed, #ff7300)');
  await page.getByPlaceholder('Office stock for customers').fill('E2E tagline');
  await page.getByPlaceholder('Short product card copy').fill('E2E card blurb');
  await page.getByPlaceholder('Cotton jersey').fill('E2E cotton');
  await page.getByPlaceholder('Unisex, true to size').fill('E2E fit');
  await page.getByPlaceholder('01 / TEE').fill('E2E');
  await page.getByPlaceholder('office-stock, launch').fill(`e2e, ${runId.toLowerCase()}`);
  await page.locator('textarea').first().fill('E2E product description');
  await page.getByPlaceholder('grey,#B8B5AE,Heather Grey\ncitrus,#FF7300,Citrus Glow').fill('grey,#B8B5AE,Heather Grey');
  await page.getByPlaceholder('S, M, L, XL, XXL, XXXL').fill('XS, S, M, L, XL, XXL, XXXL');
  await page.getByPlaceholder('var_aai-tee-grey-s,S,grey,20\nvar_aai-tee-grey-m,M,grey,24\nvar_step-socks-one,,citrus,58')
    .fill(`${productId}-xs,XS,grey,1\n${productId}-s,S,grey,2\n${productId}-m,M,grey,3`);
  await clickButton('CREATE PRODUCT');
  await expectVisible(page.getByRole('link', { name: productName, exact: true }), 'created product listed');

  const productRow = page
    .getByRole('link', { name: productName, exact: true })
    .locator('xpath=ancestor::div[contains(@style, "grid-template-columns")][1]');
  await productRow.getByRole('button', { name: 'EDIT', exact: true }).click();
  note('product edit clicked');
  await page.getByPlaceholder('28').fill('21.25');
  await page.getByPlaceholder('/products/shirt-grey.png').fill('/products/e2e-updated.png');
  await clickButton('SAVE PRODUCT');
  await expectVisible(page.getByText('$21.25', { exact: true }), 'product update saved');
  await clickButton('NEW');
}

async function testOrders() {
  await tab('Pending', orderId);
  const row = testOrderRow();
  await row.locator('select').selectOption('fulfilled');
  await row.getByPlaceholder('Tracking').fill(`TRACK-${runId}`);
  await row.getByPlaceholder('Notes').fill(`E2E note ${runId}`);
  await row.getByRole('button', { name: 'SAVE', exact: true }).click();
  note('order status save clicked');
}

async function testDiscounts() {
  await tab('Discounts', 'SWAG CODE AGENT');
  await page.getByPlaceholder('Name or account').fill(`E2E Tester ${runId}`);
  await page.getByPlaceholder('Campaign, event, request').fill(`E2E ${runId}`);
  await clickButton('$100 AGENT');
  await expectVisible(page.getByText('LATEST SINGLE-USE CODE', { exact: true }), '$100 agent generated code');
  await clickButton('COPY');

  await page.getByPlaceholder('Name or account').fill(`E2E Tester ${runId}`);
  await page.getByPlaceholder('Campaign, event, request').fill(`E2E percent ${runId}`);
  await clickButton('100% AGENT');
  await expectVisible(page.getByText('LATEST SINGLE-USE CODE', { exact: true }), '100% agent generated code');

  await page.getByPlaceholder('SALES100').fill(manualCode);
  await page.getByPlaceholder('Sales credit').fill(`E2E manual ${runId}`);
  await page.locator('select').first().selectOption('percent_off');
  await page.getByPlaceholder('100', { exact: true }).fill('15');
  await clickButton('ADD SINGLE-USE CODE');
  await expectVisible(page.getByText(manualCode, { exact: true }), 'manual discount listed');

  const codeRow = page
    .getByText(manualCode, { exact: true })
    .locator('xpath=ancestor::div[contains(@style, "grid-template-columns")][1]');
  await codeRow.getByRole('button', { name: 'PAUSE', exact: true }).click();
  note('manual discount pause clicked');
  await page.waitForTimeout(1000);
  await codeRow.getByRole('button', { name: 'ENABLE', exact: true }).click();
  note('manual discount enable clicked');
}

async function testApiTokens() {
  await tab('API Tokens', 'MCP / AI ACCESS');
  await page.getByPlaceholder('Codex MCP').fill(apiTokenName);
  await page.getByPlaceholder('ai-assistant@inngest.com').fill('e2e-agent@inngest.com');
  await clickButton('GENERATE TOKEN');
  await expectVisible(page.getByText('COPY NOW', { exact: false }), 'api token generated');
  await clickButton('COPY');
  const tokenRow = page
    .getByText(apiTokenName, { exact: true })
    .locator('xpath=ancestor::div[contains(@style, "grid-template-columns")][1]');
  await tokenRow.getByRole('button', { name: 'REVOKE', exact: true }).click();
  note('api token revoke clicked');
}

async function testDocumentImport() {
  await tab('Imports', 'LLM REVIEWED DOCUMENT IMPORT');
  const filePath = join(tmpdir(), `swag-admin-${runId}.csv`);
  writeFileSync(filePath, `${inventoryImportCsv}\n`);
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.getByPlaceholder('Swag inventory export').fill(importSource);
  await page.getByPlaceholder('item,S,M,L,XL,XXL,XXXL\nAnti Anti Infra Co.,20,24,21,23,11,7\nStep.run Socks,58')
    .fill(inventoryImportCsv);
  await clickButton('IMPORT DOC');
  await expectVisible(page.getByText(/document import requested|uploading inventory document/i), 'document import requested');
}

async function run() {
  await setupDb();
  browser = await launchBrowser();
  const context = await browser.newContext({
    baseURL: baseUrl,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  page = await context.newPage();
  page.on('pageerror', (err) => {
    if (isNonFatalBrowserMessage(err.message)) {
      consoleWarnings.push(err.message.split('\n')[0]);
      return;
    }
    consoleErrors.push(err.message);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isNonFatalBrowserMessage(text)) {
      consoleWarnings.push(text.split('\n')[0]);
      return;
    }
    consoleErrors.push(text);
  });

  try {
    await authenticate();
    await snapshotCatalogStock();
    await testNavigationAndTopButtons();
    await testInventory();
    await testProducts();
    await testOrders();
    await testDiscounts();
    await testApiTokens();
    await testDocumentImport();
    await screenshot('final');
    if (consoleErrors.length) {
      throw new Error(`Browser console/page errors:\n${consoleErrors.join('\n')}`);
    }
    console.log(JSON.stringify({ ok: true, runId, steps, screenshots, consoleWarnings }, null, 2));
  } catch (err) {
    if (page) await screenshot('failure').catch(() => {});
    throw err;
  } finally {
    await browser?.close();
    await cleanupDb();
    await pool?.end();
  }
}

run().catch((err) => {
  console.error(err);
  console.log(JSON.stringify({ ok: false, runId, steps, screenshots, consoleWarnings, error: err.message }, null, 2));
  process.exit(1);
});
