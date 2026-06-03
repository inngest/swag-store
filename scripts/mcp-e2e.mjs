import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const { Pool } = pg;

loadDotEnv(`${process.cwd()}/.env.local`);
loadDotEnv(`${process.cwd()}/.env`);

const baseUrl = process.env.MCP_E2E_BASE_URL ?? 'http://localhost:3000';
const runId = `MCP-E2E-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const runSlug = runId.toLowerCase();
const productId = `mcp_e2e_product_${runSlug.replace(/-/g, '_')}`;
const productSlug = `mcp-e2e-product-${runSlug}`;
const productName = `MCP E2E Product ${runId}`;
const directCustomerEmail = 'mcp-e2e-direct@inngest.com';
const eventCustomerEmail = 'mcp-e2e-event@inngest.com';
const token = await resolveApiToken();
const databaseUrl = await resolveDatabaseUrl();
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('railway.internal') ? false : { rejectUnauthorized: false },
});
const steps = [];
const artifacts = {
  directOrderId: '',
  devrelCode: '',
  salesCode: '',
  eventCode: '',
  eventOrderId: '',
  paidOrderId: '',
};

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

function note(step) {
  steps.push(step);
  console.log(`ok - ${step}`);
}

async function resolveApiToken() {
  if (process.env.SWAG_STORE_API_TOKEN) return process.env.SWAG_STORE_API_TOKEN;
  try {
    const vars = JSON.parse(execFileSync('railway', ['variables', '--json'], { encoding: 'utf8' }));
    if (vars.SWAG_STORE_API_TOKEN) return vars.SWAG_STORE_API_TOKEN;
  } catch {
    // Fall through to a clear error below.
  }
  throw new Error('SWAG_STORE_API_TOKEN is required for MCP E2E.');
}

async function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const vars = JSON.parse(execFileSync('railway', ['variables', '--service', 'Postgres', '--json'], { encoding: 'utf8' }));
    if (vars.DATABASE_PUBLIC_URL) return vars.DATABASE_PUBLIC_URL;
    if (vars.DATABASE_URL) return vars.DATABASE_URL;
  } catch {
    // Fall through to a clear error below.
  }
  throw new Error('DATABASE_URL or Railway Postgres DATABASE_PUBLIC_URL is required for MCP E2E cleanup.');
}

async function mcp(method, params = undefined, { expectError } = {}) {
  const id = `${runId}-${steps.length + 1}`;
  const res = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status} for ${method}: ${JSON.stringify(data)}`);
  }
  if (data.error) {
    if (expectError) return data;
    throw new Error(`MCP error for ${method}: ${data.error.message}`);
  }
  if (expectError) {
    throw new Error(`Expected MCP error for ${method}, received success.`);
  }
  return data.result;
}

async function callTool(name, args = {}, options = {}) {
  const result = await mcp('tools/call', { name, arguments: args }, options);
  return result?.structuredContent;
}

async function fetchJson(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} returned ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function cleanupDb() {
  const client = await pool.connect();
  try {
    const hasAdjustmentTable = Boolean((await client.query("select to_regclass('inventory_adjustments') as table")).rows[0]?.table);
    const hasLowStockTable = Boolean((await client.query("select to_regclass('low_stock_notifications') as table")).rows[0]?.table);
    await client.query('begin');
    if (hasAdjustmentTable) {
      await client.query('delete from inventory_adjustments where source like $1 or reason like $1', [`%${runId}%`]);
    }
    if (hasLowStockTable) {
      await client.query('delete from low_stock_notifications where variant_id like $1', [`${productId}%`]);
    }
    await client.query("delete from order_items where order_id in (select order_id from orders where customer_email = any($1::text[]))", [
      [directCustomerEmail, eventCustomerEmail],
    ]);
    await client.query('delete from orders where customer_email = any($1::text[])', [
      [directCustomerEmail, eventCustomerEmail],
    ]);
    await client.query('delete from discount_redemptions where code = any($1::text[])', [
      [artifacts.devrelCode, artifacts.salesCode, artifacts.eventCode].filter(Boolean),
    ]);
    await client.query('delete from discount_codes where code = any($1::text[]) or label like $2', [
      [artifacts.devrelCode, artifacts.salesCode, artifacts.eventCode].filter(Boolean),
      `%${runId}%`,
    ]);
    await client.query('delete from product_variants where product_id = $1', [productId]);
    await client.query('delete from products where id = $1 or slug = $2', [productId, productSlug]);
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

async function waitForOrder(orderId, customerEmail) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const res = await pool.query(
      `select order_id, discount_code, discount_amount_cents
       from orders
       where order_id = $1 and customer_email = $2
       limit 1`,
      [orderId, customerEmail],
    );
    if (res.rows[0]) return res.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Order ${orderId} was not recorded by Inngest within timeout.`);
}

async function verifyNoArtifacts() {
  const checks = await Promise.all([
    pool.query('select count(*)::int as count from products where id = $1 or slug = $2', [productId, productSlug]),
    pool.query('select count(*)::int as count from orders where customer_email = any($1::text[])', [
      [directCustomerEmail, eventCustomerEmail],
    ]),
    pool.query('select count(*)::int as count from discount_codes where label like $1', [`%${runId}%`]),
    pool.query('select count(*)::int as count from discount_redemptions where code = any($1::text[])', [
      [artifacts.devrelCode, artifacts.salesCode, artifacts.eventCode].filter(Boolean),
    ]),
    pool.query("select count(*)::int as count from inventory_adjustments where source like $1 or reason like $1", [
      `%${runId}%`,
    ]),
    pool.query('select count(*)::int as count from low_stock_notifications where variant_id like $1', [`${productId}%`]),
  ]);
  return {
    products: checks[0].rows[0].count,
    orders: checks[1].rows[0].count,
    discountCodes: checks[2].rows[0].count,
    redemptions: checks[3].rows[0].count,
    inventoryAdjustments: checks[4].rows[0].count,
    lowStockNotifications: checks[5].rows[0].count,
  };
}

function productInput(priceDollars) {
  return {
    id: productId,
    slug: productSlug,
    name: productName,
    type: 'T-Shirt',
    sku: `MCP-${runId.slice(-6)}`,
    tagline: 'MCP-tested product',
    blurb: 'Created and updated through the MCP server.',
    description: 'MCP E2E product description.',
    fabric: 'Cotton',
    fit: 'True to size',
    cornerTag: 'MCP',
    cover: 'light',
    priceDollars,
    category: 'apparel',
    image: '/products/mcp-e2e.png',
    imagePlaceholder: 'linear-gradient(135deg, #f6f3ed, #ff7300)',
    colors: [{ name: 'grey', hex: '#B8B5AE', label: 'Heather Grey' }],
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    variants: [
      { id: `${productId}-xs`, size: 'XS', color: 'grey', stock: 5 },
      { id: `${productId}-s`, size: 'S', color: 'grey', stock: 5 },
      { id: `${productId}-m`, size: 'M', color: 'grey', stock: 5 },
    ],
    featured: false,
    tags: ['mcp-e2e', runId.toLowerCase()],
  };
}

try {
  await cleanupDb();

  const authMd = await fetch(`${baseUrl}/auth.md`);
  const authMdText = await authMd.text();
  if (!authMd.ok || !authMdText.includes('Inngest Swag Store auth.md')) {
    throw new Error(`auth.md discovery document missing or invalid: ${authMd.status}`);
  }
  const protectedResource = await fetchJson('/.well-known/oauth-protected-resource');
  const authServer = await fetchJson('/.well-known/oauth-authorization-server');
  if (!protectedResource.resource || !protectedResource.authorization_servers?.length || authServer.agent_auth?.skill !== 'https://workos.com/auth.md') {
    throw new Error(`auth.md metadata missing expected fields: ${JSON.stringify({ protectedResource, authServer })}`);
  }
  const unauthorized = await fetch(`${baseUrl}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${runId}-unauthorized`, method: 'tools/list' }),
  });
  if (unauthorized.status !== 401 || !unauthorized.headers.get('www-authenticate')?.includes('/.well-known/oauth-protected-resource')) {
    throw new Error(`Unauthorized MCP response did not include auth.md WWW-Authenticate hint.`);
  }
  note('verified auth.md discovery for MCP');

  const initialized = await mcp('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'swag-store-mcp-e2e', version: '0.1.0' },
  });
  if (initialized.serverInfo?.name !== 'inngest-swag-store') {
    throw new Error(`Unexpected MCP serverInfo: ${JSON.stringify(initialized.serverInfo)}`);
  }
  note('initialized MCP server');

  const listedTools = await mcp('tools/list');
  for (const name of ['get_api_spec', 'list_products', 'list_inventory', 'preview_inventory_update', 'apply_inventory_update', 'preview_inventory_document', 'list_inventory_audits', 'preview_product', 'upsert_product', 'generate_discount_code', 'preview_order', 'preview_event_order', 'create_event_order', 'submit_order']) {
    if (!listedTools.tools?.some((tool) => tool.name === name)) {
      throw new Error(`Missing MCP tool ${name}`);
    }
  }
  note('listed all expected MCP tools');

  const spec = await callTool('get_api_spec');
  if (!spec?.mcpTools?.list_inventory || !spec?.mcpTools?.preview_inventory_update || !spec?.mcpTools?.apply_inventory_update || !spec?.mcpTools?.preview_inventory_document || !spec?.mcpTools?.list_inventory_audits || !spec?.mcpTools?.preview_product || !spec?.mcpTools?.upsert_product || !spec?.mcpTools?.preview_order || !spec?.mcpTools?.preview_event_order || !spec?.mcpTools?.create_event_order || !spec?.mcpTools?.submit_order) {
    throw new Error('MCP API spec did not include preview/product/order tools.');
  }
  note('retrieved MCP API spec');

  const beforeProducts = await callTool('list_products');
  if (!Array.isArray(beforeProducts.products) || beforeProducts.products.length === 0) {
    throw new Error('list_products returned no products.');
  }
  note('listed catalog products');

  const productPreview = await callTool('preview_product', productInput('25.00'));
  if (productPreview.product.id !== productId || productPreview.product.sizes.join(',') !== 'XS,S,M,L,XL,XXL,XXXL') {
    throw new Error(`Unexpected product preview: ${JSON.stringify(productPreview)}`);
  }
  note('previewed structured product input through MCP');

  const created = await callTool('upsert_product', productInput('25.00'));
  if (created.product.id !== productId || created.product.price !== 2500) {
    throw new Error(`Unexpected created product: ${JSON.stringify(created.product)}`);
  }
  note('created product through MCP');

  const updated = await callTool('upsert_product', {
    ...productInput('32.50'),
    image: '/products/mcp-e2e-updated.png',
    blurb: 'Updated through the MCP server.',
  });
  if (updated.product.price !== 3250 || updated.product.image !== '/products/mcp-e2e-updated.png') {
    throw new Error(`Unexpected updated product: ${JSON.stringify(updated.product)}`);
  }
  note('updated product through MCP');

  const afterProducts = await callTool('list_products');
  const orderProduct = afterProducts.products.find((product) => product.id === productId);
  if (!orderProduct) throw new Error('Updated MCP product was not returned by list_products.');
  const orderVariant = orderProduct.variants.find((variant) => variant.id === `${productId}-s`);
  if (!orderVariant || orderVariant.stock < 2) {
    throw new Error(`Orderable MCP variant missing or out of stock: ${JSON.stringify(orderProduct.variants)}`);
  }
  note('verified updated product in catalog listing');

  const inventory = await callTool('list_inventory');
  const inventoryRow = inventory.inventory.find((row) => row.variantId === orderVariant.id);
  if (!inventoryRow || inventoryRow.size !== 'S' || inventoryRow.stock < 2) {
    throw new Error(`Updated MCP variant was not returned by list_inventory: ${JSON.stringify(inventory.inventory)}`);
  }
  note('listed source inventory through MCP');

  const shipmentUpdate = {
    mode: 'receive_shipment',
    source: `MCP shipment ${runId}`,
    reason: `MCP E2E shipment ${runId}`,
    items: [{ variantId: orderVariant.id, quantity: 2, note: 'Received from MCP E2E manifest' }],
  };
  const shipmentPreview = await callTool('preview_inventory_update', shipmentUpdate);
  if (!shipmentPreview.ok || shipmentPreview.items[0]?.previousStock !== 5 || shipmentPreview.items[0]?.newStock !== 7) {
    throw new Error(`Unexpected shipment preview: ${JSON.stringify(shipmentPreview)}`);
  }
  note('previewed shipment inventory update through MCP');

  const shipmentApplied = await callTool('apply_inventory_update', shipmentUpdate);
  if (!shipmentApplied.batchId || shipmentApplied.adjustments[0]?.newStock !== 7) {
    throw new Error(`Unexpected shipment apply result: ${JSON.stringify(shipmentApplied)}`);
  }
  note('applied shipment inventory update through MCP');

  const auditDocument = [
    'sku,size,color,stock,note',
    `${orderProduct.sku},S,grey,8,physical count ${runId}`,
  ].join('\n');
  const auditPreview = await callTool('preview_inventory_document', {
    mode: 'audit_count',
    sourceName: `MCP audit ${runId}`,
    reason: `MCP E2E physical count ${runId}`,
    documentText: auditDocument,
  });
  if (!auditPreview.preview.ok || auditPreview.preview.items[0]?.previousStock !== 7 || auditPreview.preview.items[0]?.newStock !== 8) {
    throw new Error(`Unexpected audit document preview: ${JSON.stringify(auditPreview)}`);
  }
  note('previewed audit document inventory update through MCP');

  const auditApplied = await callTool('apply_inventory_update', auditPreview.proposedUpdate);
  if (!auditApplied.batchId || auditApplied.adjustments[0]?.newStock !== 8) {
    throw new Error(`Unexpected audit apply result: ${JSON.stringify(auditApplied)}`);
  }
  note('applied audit count inventory update through MCP');

  const inventoryAudits = await callTool('list_inventory_audits', { limit: 10 });
  if (!inventoryAudits.audits.some((audit) => audit.reason.includes(runId) && audit.variantId === orderVariant.id)) {
    throw new Error(`Inventory audit trail did not include MCP adjustments: ${JSON.stringify(inventoryAudits)}`);
  }
  note('listed inventory audit trail through MCP');

  const salesDiscount = await callTool('generate_discount_code', {
    kind: 'sales_credit',
    recipient: runId,
    purpose: 'MCP E2E sales credit',
  });
  artifacts.salesCode = salesDiscount.discountCode.code;
  if (salesDiscount.discountCode.type !== 'amount_off' || salesDiscount.discountCode.maxRedemptions !== 1) {
    throw new Error(`Unexpected sales discount: ${JSON.stringify(salesDiscount.discountCode)}`);
  }
  note('generated $100 single-use discount through MCP');

  const devrelDiscount = await callTool('generate_discount_code', {
    kind: 'devrel_comp',
    recipient: runId,
    purpose: 'MCP E2E direct order',
  });
  artifacts.devrelCode = devrelDiscount.discountCode.code;
  if (devrelDiscount.discountCode.type !== 'percent_off' || Number(devrelDiscount.discountCode.percentOff) !== 100) {
    throw new Error(`Unexpected devrel discount: ${JSON.stringify(devrelDiscount.discountCode)}`);
  }
  note('generated 100% single-use discount through MCP');

  const directOrderInput = {
    items: [{ productId, variantId: orderVariant.id, quantity: 1, size: orderVariant.size, color: orderVariant.color }],
    discountCode: artifacts.devrelCode,
    customer: { email: directCustomerEmail, name: 'MCP E2E Buyer' },
    shipping: {
      name: 'MCP E2E Buyer',
      line1: '1 Test Way',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94107',
      country: 'US',
    },
  };

  const missingShippingPreview = await callTool('preview_order', {
    items: directOrderInput.items,
    discountCode: artifacts.devrelCode,
  });
  if (missingShippingPreview.status !== 'needs_customer_shipping' || !missingShippingPreview.missingFields.includes('customer.email')) {
    throw new Error(`Preview did not report missing direct-order fields: ${JSON.stringify(missingShippingPreview)}`);
  }
  note('previewed direct order missing-fields recovery through MCP');

  const directOrderPreview = await callTool('preview_order', directOrderInput);
  if (directOrderPreview.status !== 'ready_for_direct_submit' || directOrderPreview.totalCents !== 0) {
    throw new Error(`Unexpected direct order preview: ${JSON.stringify(directOrderPreview)}`);
  }
  note('previewed fully-discounted order through MCP');

  const directOrder = await callTool('submit_order', directOrderInput);
  artifacts.directOrderId = directOrder.orderId;
  if (directOrder.status !== 'submitted' || directOrder.totalCents !== 0 || directOrder.discountCode !== artifacts.devrelCode) {
    throw new Error(`Unexpected direct order result: ${JSON.stringify(directOrder)}`);
  }
  note('submitted fully-discounted order through MCP');

  const duplicateOrder = await mcp('tools/call', {
    name: 'submit_order',
    arguments: directOrderInput,
  }, { expectError: true });
  if (!duplicateOrder.error?.message?.includes('already been redeemed') || duplicateOrder.error?.data?.type !== 'DISCOUNT_REDEEMED') {
    throw new Error(`Duplicate discount was not rejected synchronously: ${JSON.stringify(duplicateOrder)}`);
  }
  note('rejected reused discount through MCP');

  const unknownTool = await mcp('tools/call', { name: 'not_a_real_tool', arguments: {} }, { expectError: true });
  if (unknownTool.error?.data?.type !== 'UNKNOWN_TOOL' || !unknownTool.error.data.userAction) {
    throw new Error(`Unknown tool error was not AX-friendly: ${JSON.stringify(unknownTool)}`);
  }
  note('returned typed recovery guidance for MCP errors');

  const recordedOrder = await waitForOrder(artifacts.directOrderId, directCustomerEmail);
  if (recordedOrder.discount_code !== artifacts.devrelCode || Number(recordedOrder.discount_amount_cents) !== 3250) {
    throw new Error(`Recorded order did not include expected discount: ${JSON.stringify(recordedOrder)}`);
  }
  note('verified Inngest recorded direct MCP order');

  const eventOrderInput = {
    eventName: `MCP E2E Event ${runId}`,
    eventDate: '2026-06-01',
    recipient: 'Sterling',
    purpose: 'MCP E2E event inventory workflow',
    items: [{ productId, variantId: orderVariant.id, quantity: 1, size: orderVariant.size, color: orderVariant.color }],
    customer: { email: eventCustomerEmail, name: 'MCP Event Owner' },
    shipping: {
      name: 'MCP Event Owner',
      line1: '2 Event Way',
      city: 'San Francisco',
      state: 'CA',
      postalCode: '94107',
      country: 'US',
    },
  };

  const eventPreview = await callTool('preview_event_order', eventOrderInput);
  if (eventPreview.status !== 'ready_for_direct_submit' || eventPreview.totalCents !== 0 || eventPreview.discountAmountCents !== 3250) {
    throw new Error(`Unexpected event order preview: ${JSON.stringify(eventPreview)}`);
  }
  note('previewed event swag order through MCP');

  const eventOrder = await callTool('create_event_order', eventOrderInput);
  artifacts.eventCode = eventOrder.discountCode.code;
  artifacts.eventOrderId = eventOrder.order.orderId;
  if (eventOrder.discountCode.type !== 'percent_off' || eventOrder.order.status !== 'submitted' || eventOrder.order.totalCents !== 0) {
    throw new Error(`Unexpected event order result: ${JSON.stringify(eventOrder)}`);
  }
  note('created 100% event swag order through MCP');

  const recordedEventOrder = await waitForOrder(artifacts.eventOrderId, eventCustomerEmail);
  if (recordedEventOrder.discount_code !== artifacts.eventCode || Number(recordedEventOrder.discount_amount_cents) !== 3250) {
    throw new Error(`Recorded event order did not include expected discount: ${JSON.stringify(recordedEventOrder)}`);
  }
  note('verified Inngest recorded event MCP order');

  try {
    const paidOrder = await callTool('submit_order', {
      items: [{ productId, variantId: orderVariant.id, quantity: 1, size: orderVariant.size, color: orderVariant.color }],
      customer: { email: 'mcp-e2e-paid@inngest.com', name: 'MCP Paid Buyer' },
    });
    artifacts.paidOrderId = paidOrder.orderId;
    if (paidOrder.status !== 'payment_required' || !paidOrder.checkoutUrl) {
      throw new Error(`Unexpected paid order result: ${JSON.stringify(paidOrder)}`);
    }
    note('created paid checkout session through MCP');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('STRIPE') && !message.includes('Stripe') && !message.includes('checkout')) {
      throw err;
    }
    note(`skipped paid checkout session: ${message}`);
  }

  console.log(JSON.stringify({ ok: true, runId, steps }, null, 2));
} catch (err) {
  console.error(err);
  console.log(JSON.stringify({ ok: false, runId, steps, error: err instanceof Error ? err.message : String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  try {
    await cleanupDb();
    const cleanup = await verifyNoArtifacts();
    console.log(JSON.stringify({ cleanup }, null, 2));
  } finally {
    await pool.end();
  }
}
