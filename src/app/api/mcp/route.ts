import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { APP_ORIGIN } from '@/lib/app-origin';
import { requireApiActor } from '@/lib/api-auth';
import { wwwAuthenticateHeader } from '@/lib/auth-md';
import {
  createEventSwagOrder,
  generateSwagCodeForActor,
  listAutomationProducts,
  previewAutomatedOrder,
  previewEventSwagOrder,
  submitAutomatedOrder,
  type AutomatedOrderInput,
  type EventSwagOrderInput,
} from '@/lib/order-automation';
import {
  normalizeProductInput,
  productUpsertInputSchema,
  type ProductUpsertInput,
} from '@/lib/product-management';
import { parseInventoryDocument, type InventoryImportRow } from '@/lib/inventory-import';
import { resolveProductImageInput } from '@/lib/product-images';
import {
  applyInventoryAdjustment,
  listAdminInventory,
  listInventoryAdjustments,
  previewInventoryAdjustment,
  upsertAdminProduct,
  type InventoryAdjustmentInput,
  type InventoryAdjustmentMode,
} from '@/lib/store-db';

type JsonRpcRequest = {
  jsonrpc?: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type McpErrorData = {
  type:
    | 'UNAUTHORIZED'
    | 'PARSE_ERROR'
    | 'METHOD_NOT_FOUND'
    | 'UNKNOWN_TOOL'
    | 'VALIDATION_ERROR'
    | 'NOT_FOUND'
    | 'DISCOUNT_REDEEMED'
    | 'PAYMENT_CONFIGURATION_MISSING'
    | 'INVENTORY_UNAVAILABLE'
    | 'SERVICE_UNAVAILABLE'
    | 'INTERNAL_ERROR';
  retryable: boolean;
  userAction: string;
};

const tools = [
  {
    name: 'get_api_spec',
    title: 'Get Swag Store Agent API Spec',
    description:
      [
        'Returns the REST endpoints and MCP tool schemas available to agents.',
        'Use this when an agent needs to understand how to add or update products, generate discount codes, or submit orders.',
        'The product upsert schema is authoritative for creating and updating products via MCP or REST.',
      ].join(' '),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      type: 'object',
      required: ['rest', 'mcpTools'],
      properties: {
        rest: { type: 'object' },
        mcpTools: { type: 'object' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'list_products',
    title: 'List Swag Store Products',
    description:
      [
        'Use this first before creating or submitting an order.',
        'Returns the current public catalog with productId, slug, name, sku, priceCents, and orderable variants.',
        'Each variant includes variantId, size, color, and stock. Use the exact productId and variantId values from this response in submit_order.',
        'Do not guess product or variant IDs from product names.',
      ].join(' '),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      type: 'object',
      required: ['products'],
      properties: {
        products: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'slug', 'name', 'sku', 'priceCents', 'variants'],
            properties: {
              id: { type: 'string', description: 'Use as submit_order.items[].productId.' },
              slug: { type: 'string' },
              name: { type: 'string' },
              sku: { type: 'string' },
              priceCents: { type: 'integer' },
              variants: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'size', 'color', 'stock'],
                  properties: {
                    id: { type: 'string', description: 'Use as submit_order.items[].variantId.' },
                    size: { type: 'string' },
                    color: { type: 'string' },
                    stock: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'list_inventory',
    title: 'List Source Inventory',
    description:
      [
        'Returns the source-of-record inventory rows used by the admin dashboard and fulfillment workflow.',
        'Use this when an agent needs current stock, initial stock, product metadata, variant IDs, and last update timestamps for inventory management.',
        'Rows are sorted by product name and canonical size order: XS, S, M, L, XL, XXL, XXXL.',
      ].join(' '),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      type: 'object',
      required: ['inventory'],
      properties: {
        inventory: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'productId',
              'productName',
              'slug',
              'type',
              'sku',
              'variantId',
              'size',
              'color',
              'stock',
              'initialStock',
              'updatedAt',
            ],
            properties: {
              productId: { type: 'string' },
              productName: { type: 'string' },
              slug: { type: 'string' },
              type: { type: 'string' },
              sku: { type: 'string' },
              image: { type: 'string' },
              variantId: { type: 'string' },
              size: { type: 'string' },
              color: { type: 'string' },
              stock: { type: 'integer' },
              initialStock: { type: 'integer' },
              updatedAt: { type: 'string' },
            },
          },
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'preview_inventory_update',
    title: 'Preview Inventory Update',
    description:
      [
        'Previews a receiving shipment, audit count, or manual inventory correction without writing to the database.',
        'Use receive_shipment when new items arrive and quantities should be added to current stock.',
        'Use audit_count when someone counted physical inventory and stock should be set to the counted number.',
        'Use manual_correction for signed positive or negative quantity changes.',
        'Returns previousStock, quantityChange, newStock, and validation issues for each matched variant.',
      ].join(' '),
    inputSchema: inventoryUpdateInputSchema(),
    outputSchema: inventoryPreviewOutputSchema(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'apply_inventory_update',
    title: 'Apply Inventory Update',
    description:
      [
        'Applies a receiving shipment, audit count, or manual inventory correction and writes an inventory audit trail row for every changed variant.',
        'Call preview_inventory_update first and apply only after the user approves the preview.',
        'Requires reason so future audits can explain why stock changed.',
      ].join(' '),
    inputSchema: inventoryUpdateInputSchema(),
    outputSchema: {
      type: 'object',
      required: ['batchId', 'adjustments'],
      properties: {
        batchId: { type: 'string' },
        adjustments: { type: 'array', items: inventoryAdjustmentRecordSchema() },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: 'preview_inventory_document',
    title: 'Preview Inventory Document',
    description:
      [
        'Parses pasted CSV, TSV, shipping manifest text, email text, or document-export text into inventory update items, then previews the update.',
        'Use this when inventory numbers arrive as a CSV, Word document text, shipping manifest, email, or copied table.',
        'For receive_shipment, parsed quantity/stock values are treated as added quantities. For audit_count, they are treated as counted stock.',
        'This tool does not write inventory. After review, call apply_inventory_update with the returned proposedUpdate.',
      ].join(' '),
    inputSchema: inventoryDocumentInputSchema(),
    outputSchema: {
      type: 'object',
      required: ['sourceName', 'parsedRows', 'proposedUpdate', 'preview'],
      properties: {
        sourceName: { type: 'string' },
        parsedRows: { type: 'array', items: { type: 'object' } },
        proposedUpdate: inventoryUpdateInputSchema(),
        preview: inventoryPreviewOutputSchema(),
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'list_inventory_audits',
    title: 'List Inventory Audit Trail',
    description:
      [
        'Returns recent inventory adjustment and audit records.',
        'Use this when an agent needs to explain who changed stock, why, from which source, and what changed.',
      ].join(' '),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Defaults to 50.' },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['audits'],
      properties: {
        audits: { type: 'array', items: inventoryAdjustmentRecordSchema() },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'preview_product',
    title: 'Preview Product Create or Update',
    description:
      [
        'Validates and normalizes product input without writing to the database.',
        'Use this before upsert_product so the user or agent can inspect generated ids, slug, price cents, color defaults, size ordering, and variants.',
        'Accepts the same input as upsert_product, including preferred structured colors, sizes, variants, and tags.',
        'imageSourceUrl and imageBase64 are validated and stored only by upsert_product; preview does not fetch or store image data.',
      ].join(' '),
    inputSchema: productUpsertInputSchema,
    outputSchema: {
      type: 'object',
      required: ['product', 'nextAction'],
      properties: {
        product: productOutputSchema(),
        nextAction: {
          type: 'string',
          description: 'Recommended next step for an AX client.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'upsert_product',
    title: 'Create or Update Swag Store Product',
    description:
      [
        'Creates or updates a swag store product, including product metadata, image, price, colors, sizes, and variants.',
        'Use this when the user asks to add a new product or update product copy, images, price, or inventory variants.',
        'Call preview_product first for validation and normalized output when the user has not already approved the exact product payload.',
        'If id or slug is omitted, it is generated from name. To update an existing product, pass its existing id from list_products or get_api_spec examples.',
        'Structured variants are preferred. Legacy variantsText is newline-separated CSV with preferred format variant_id,size,color,stock.',
        'For one-size products, leave size blank: var_step-socks-one,,citrus,58.',
        'For sized products, valid sizes are XS, S, M, L, XL, XXL, XXXL and are rendered in that order.',
        'Image options: pass image as a /products/*.png path or https URL, pass imageSourceUrl as an https URL the server fetches and stores, or pass imageBase64 + imageContentType for an inline upload. Stored uploads must be png, jpeg, or webp at 4MB or smaller, are served from /api/product-images/<id>, and set product.image automatically.',
        'This tool writes to the live product database and replaces stale variants for that product.',
      ].join(' '),
    inputSchema: productUpsertInputSchema,
    outputSchema: {
      type: 'object',
      required: ['product'],
      properties: {
        product: productOutputSchema(),
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'generate_discount_code',
    title: 'Generate Single-Use Discount Code',
    description:
      [
        'Creates a new single-use swag store discount code.',
        'Use kind "sales_credit" when the user asks for $100 in store credit for a prospect, customer, giveaway, or sales motion.',
        'Use kind "devrel_comp" when the user needs a 100% off code so a devrel/order-for-workflow item still goes through the swag store.',
        'The generated code is stored server-side, max_redemptions is forced to 1, and the code cannot be reused after one completed order.',
        'Pass recipient and purpose when available so the admin dashboard records why the code exists.',
        'Returns the full discountCode object; the value to give to a shopper or pass to submit_order is discountCode.code.',
      ].join(' '),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: {
          type: 'string',
          enum: ['sales_credit', 'devrel_comp'],
          description: 'sales_credit creates a $100 code; devrel_comp creates a 100% off code.',
        },
        recipient: {
          type: 'string',
          description: 'Optional person, account, company, or event receiving the code.',
        },
        purpose: {
          type: 'string',
          description: 'Optional short reason, campaign, request, or context for the code.',
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['discountCode'],
      properties: {
        discountCode: {
          type: 'object',
          required: ['code', 'type', 'timesRedeemed', 'active'],
          properties: {
            code: { type: 'string', description: 'The single-use code to give the user or pass to submit_order.discountCode.' },
            label: { type: 'string' },
            type: { type: 'string', enum: ['amount_off', 'percent_off'] },
            amountOffCents: { type: ['integer', 'null'] },
            percentOff: { type: ['number', 'null'] },
            maxRedemptions: { type: 'integer', description: 'Always 1.' },
            timesRedeemed: { type: 'integer' },
            active: { type: 'boolean' },
          },
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: 'preview_order',
    title: 'Preview Swag Store Order',
    description:
      [
        'Validates cart items, inventory availability, and discount code eligibility without creating a Stripe Checkout Session or placing an order.',
        'Use this before submit_order to show subtotal, discount amount, total, required direct-order fields, and the safest next action.',
        'Call list_products first and use exact productId and variantId values from that response.',
      ].join(' '),
    inputSchema: orderInputSchema(),
    outputSchema: {
      type: 'object',
      required: ['status', 'subtotalCents', 'discountCode', 'discountAmountCents', 'totalCents', 'missingFields', 'items', 'nextAction'],
      properties: {
        status: {
          type: 'string',
          enum: ['ready_for_direct_submit', 'needs_customer_shipping', 'payment_required'],
        },
        subtotalCents: { type: 'integer' },
        discountCode: { type: 'string' },
        discountAmountCents: { type: 'integer' },
        totalCents: { type: 'integer' },
        missingFields: { type: 'array', items: { type: 'string' } },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['productId', 'productName', 'sku', 'variantId', 'size', 'color', 'quantity', 'unitAmountCents', 'amountTotalCents'],
            properties: {
              productId: { type: 'string' },
              productName: { type: 'string' },
              sku: { type: 'string' },
              variantId: { type: 'string' },
              size: { type: 'string' },
              color: { type: 'string' },
              quantity: { type: 'integer' },
              unitAmountCents: { type: 'integer' },
              amountTotalCents: { type: 'integer' },
            },
          },
        },
        nextAction: { type: 'string' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'preview_event_order',
    title: 'Preview Event Swag Order',
    description:
      [
        'Validates an event swag order without creating a discount code or placing an order.',
        'Use this before create_event_order when ordering 100% comped swag for an event.',
        'Returns the inventory-backed line items, full comp discount amount, missing shipping fields, and next action.',
      ].join(' '),
    inputSchema: eventOrderInputSchema(),
    outputSchema: {
      type: 'object',
      required: [
        'status',
        'eventName',
        'recipient',
        'subtotalCents',
        'discountCode',
        'discountAmountCents',
        'totalCents',
        'missingFields',
        'items',
        'nextAction',
      ],
      properties: {
        status: {
          type: 'string',
          enum: ['ready_for_direct_submit', 'needs_customer_shipping'],
        },
        eventName: { type: 'string' },
        eventDate: { type: 'string' },
        recipient: { type: 'string' },
        subtotalCents: { type: 'integer' },
        discountCode: { type: 'string', description: 'Blank during preview because no code has been created.' },
        discountAmountCents: { type: 'integer' },
        totalCents: { type: 'integer' },
        missingFields: { type: 'array', items: { type: 'string' } },
        items: orderPreviewItemsSchema(),
        nextAction: { type: 'string' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  {
    name: 'create_event_order',
    title: 'Create 100% Event Swag Order',
    description:
      [
        'Creates a single-use 100% devrel comp code and immediately submits a zero-dollar swag order for an event.',
        'Use this for the owner ordering swag for events after preview_event_order returns ready_for_direct_submit and the user approves the order.',
        'This is the event-focused path for inventory management: fulfillment runs through Inngest and decrements inventory from the source-of-record database.',
        'Requires eventName, exact productId and variantId values from list_inventory or list_products, customer details, and a full shipping address.',
      ].join(' '),
    inputSchema: eventOrderInputSchema(),
    outputSchema: {
      type: 'object',
      required: ['discountCode', 'order'],
      properties: {
        discountCode: {
          type: 'object',
          required: ['code', 'type', 'timesRedeemed', 'active'],
          properties: {
            code: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string', enum: ['percent_off'] },
            percentOff: { type: ['number', 'null'] },
            maxRedemptions: { type: 'integer' },
            timesRedeemed: { type: 'integer' },
            active: { type: 'boolean' },
          },
        },
        order: {
          type: 'object',
          required: ['status', 'orderId', 'totalCents', 'discountCode', 'discountAmountCents'],
          properties: {
            status: { type: 'string', enum: ['submitted'] },
            orderId: { type: 'string' },
            orderUrl: { type: 'string' },
            totalCents: { type: 'integer' },
            discountCode: { type: 'string' },
            discountAmountCents: { type: 'integer' },
          },
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  {
    name: 'submit_order',
    title: 'Submit Swag Store Order',
    description:
      [
        'Submits a swag store order without using the browser UI.',
        'Call list_products first and use exact productId and variantId values from that response.',
        'For a fully discounted order, pass a valid 100% discountCode plus customer.email, customer.name or shipping.name, and shipping.line1, city, state, postalCode, and country. The order is submitted directly through Inngest and inventory is reserved by the fulfillment workflow.',
        'For an order that still has a positive balance after discount, this tool does not charge the user directly; it returns status "payment_required" with checkoutUrl for Stripe-hosted payment.',
        'This tool has real side effects: it can create a Stripe Checkout Session or place a zero-dollar order. Only call it when the user has provided or approved the items, discount code, customer, and shipping details.',
        'Returns status "submitted" with orderUrl for direct fully discounted orders, or status "payment_required" with checkoutUrl for paid orders.',
      ].join(' '),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['productId', 'variantId', 'quantity'],
            properties: {
              productId: {
                type: 'string',
                description: 'Exact product id returned by list_products, not the slug or SKU.',
              },
              variantId: {
                type: 'string',
                description: 'Exact variant id returned by list_products for the selected size/color.',
              },
              quantity: { type: 'integer', minimum: 1, maximum: 99 },
              size: { type: 'string', description: 'Optional human-readable size for traceability.' },
              color: { type: 'string', description: 'Optional human-readable color for traceability.' },
            },
          },
        },
        discountCode: {
          type: 'string',
          description:
            'Optional swag discount code. For direct zero-dollar order submission, use a valid 100% devrel_comp code generated by generate_discount_code.',
        },
        customer: {
          type: 'object',
          additionalProperties: false,
          properties: {
            email: {
              type: 'string',
              description: 'Required for direct fully discounted orders; optional for paid Stripe Checkout sessions.',
            },
            name: {
              type: 'string',
              description: 'Required for direct fully discounted orders unless shipping.name is supplied.',
            },
            phone: { type: 'string' },
          },
        },
        shipping: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', description: 'Recipient name. Required if customer.name is not supplied for direct orders.' },
            line1: { type: 'string', description: 'Required for direct fully discounted orders.' },
            line2: { type: 'string' },
            city: { type: 'string', description: 'Required for direct fully discounted orders.' },
            state: { type: 'string', description: 'Required for direct fully discounted orders.' },
            postalCode: { type: 'string', description: 'Required for direct fully discounted orders.' },
            country: { type: 'string', description: 'Use US or CA. Defaults to US for direct orders when omitted.' },
          },
        },
      },
    },
    outputSchema: {
      type: 'object',
      required: ['status', 'orderId', 'totalCents', 'discountCode', 'discountAmountCents'],
      properties: {
        status: { type: 'string', enum: ['submitted', 'payment_required'] },
        orderId: { type: 'string' },
        orderUrl: { type: 'string', description: 'Present when status is submitted.' },
        checkoutUrl: { type: 'string', description: 'Present when status is payment_required.' },
        totalCents: { type: 'integer' },
        discountCode: { type: 'string' },
        discountAmountCents: { type: 'integer' },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
] as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireApiActor(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json(
      rpcError(null, -32001, message, {
        type: 'UNAUTHORIZED',
        retryable: false,
        userAction: 'Fetch the auth.md discovery documents, then provide a valid Bearer token from the swag store admin API token settings.',
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders(),
          'WWW-Authenticate': wwwAuthenticateHeader(req.nextUrl.origin),
        },
      },
    );
  }

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = (await req.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return NextResponse.json(
      rpcError(null, -32700, 'Parse error', {
        type: 'PARSE_ERROR',
        retryable: false,
        userAction: 'Send a valid JSON-RPC 2.0 request body.',
      }),
      { status: 400, headers: corsHeaders() },
    );
  }

  if (Array.isArray(payload)) {
    const responses = (
      await Promise.all(payload.map((message) => handleMessage(message, actor.email, req.nextUrl.origin)))
    ).filter(Boolean);
    if (responses.length === 0) {
      return new NextResponse(null, { status: 202, headers: corsHeaders() });
    }
    return NextResponse.json(responses, { headers: corsHeaders() });
  }

  const response = await handleMessage(payload, actor.email, req.nextUrl.origin);
  if (!response) return new NextResponse(null, { status: 202, headers: corsHeaders() });
  return NextResponse.json(response, { headers: corsHeaders() });
}

async function handleMessage(message: JsonRpcRequest, actorEmail: string, origin: string) {
  const id = message.id ?? null;
  if (message.id === undefined && message.method?.startsWith('notifications/')) return null;

  try {
    if (message.method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: String(message.params?.protocolVersion ?? '2025-03-26'),
        capabilities: { tools: {} },
        serverInfo: {
          name: 'inngest-swag-store',
          version: '0.1.0',
        },
        instructions:
          [
            'This server lets agents operate the Inngest swag store without the browser UI.',
            'Use get_api_spec for REST schemas, MCP schemas, workflow recipes, error types, and examples.',
            'Use list_inventory when the user asks for current stock or inventory management; this is the source-of-record inventory view.',
            'For new shipments or physical counts: call preview_inventory_document for messy source text or preview_inventory_update for structured rows, then apply_inventory_update after approval.',
            'For audit history: call list_inventory_audits.',
            'For product changes: call preview_product, show the normalized product to the user when needed, then call upsert_product.',
            'For orders: call list_products, call preview_order, collect missing user-approved details, then call submit_order.',
            'For event swag: call list_inventory, preview_event_order, then create_event_order after the user approves; it creates a 100% code and submits through Inngest.',
            'Never guess product or variant IDs; use exact IDs returned by list_products.',
            'Generated codes are single-use. Direct order submission is only possible when the order total is zero after discounts and complete customer/shipping details are supplied.',
            'If submit_order returns payment_required, give the user the checkoutUrl; no order has been placed until Stripe Checkout completes.',
            'Errors include machine-actionable error.data.type, retryable, and userAction fields for AX recovery.',
          ].join(' '),
      });
    }

    if (message.method === 'ping') return rpcResult(id, {});
    if (message.method === 'tools/list') return rpcResult(id, { tools });

    if (message.method === 'tools/call') {
      const params = message.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
      const result = await callTool(params?.name, params?.arguments ?? {}, actorEmail, origin);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    }

    return rpcError(id, -32601, `Method not found: ${message.method ?? ''}`, {
      type: 'METHOD_NOT_FOUND',
      retryable: false,
      userAction: 'Use initialize, ping, tools/list, or tools/call.',
    });
  } catch (err) {
    const error = classifyMcpError(err);
    return rpcError(id, error.code, error.message, error.data);
  }
}

async function callTool(
  name: string | undefined,
  args: Record<string, unknown>,
  actorEmail: string,
  origin: string,
) {
  if (name === 'list_products') {
    return { products: await listAutomationProducts() };
  }

  if (name === 'list_inventory') {
    return { inventory: await listAdminInventory() };
  }

  if (name === 'preview_inventory_update') {
    return previewInventoryAdjustment(toInventoryUpdateArgs(args));
  }

  if (name === 'apply_inventory_update') {
    const result = await applyInventoryAdjustment({
      ...toInventoryUpdateArgs(args),
      actorEmail,
    });
    await inngest.send({
      id: `inventory-changed-mcp-adjustment-${result.batchId}`,
      name: 'store/inventory.changed',
      data: {
        appOrigin: APP_ORIGIN,
        source: 'mcp-inventory-update',
        reason: stringArg(args.reason) ?? 'MCP inventory update',
        actorEmail,
        batchId: result.batchId,
        variantIds: result.adjustments.map((adjustment) => adjustment.variantId),
      },
    });
    return result;
  }

  if (name === 'preview_inventory_document') {
    const proposedUpdate = toInventoryDocumentUpdate(args);
    const preview = await previewInventoryAdjustment(proposedUpdate);
    return {
      sourceName: proposedUpdate.source,
      parsedRows: parseInventoryDocument(String(args.documentText ?? '')),
      proposedUpdate,
      preview,
    };
  }

  if (name === 'list_inventory_audits') {
    return {
      audits: await listInventoryAdjustments({
        limit: Number.isSafeInteger(args.limit) ? Number(args.limit) : 50,
      }),
    };
  }

  if (name === 'get_api_spec') {
    return getAgentApiSpec();
  }

  if (name === 'preview_product') {
    const product = normalizeProductInput(args as ProductUpsertInput);
    return {
      product,
      nextAction: 'Ask the user to confirm the normalized product payload, then call upsert_product with the same input.',
    };
  }

  if (name === 'upsert_product') {
    const input = args as ProductUpsertInput;
    const product = normalizeProductInput(input);
    const uploadedImageUrl = await resolveProductImageInput({
      productId: product.id,
      actorEmail,
      input,
    });
    if (uploadedImageUrl) product.image = uploadedImageUrl;
    await upsertAdminProduct(product);
    await inngest.send({
      id: `inventory-changed-mcp-product-${product.id}-${Date.now()}`,
      name: 'store/inventory.changed',
      data: {
        appOrigin: APP_ORIGIN,
        source: 'mcp-product-upsert',
        reason: 'MCP created or updated product inventory',
        actorEmail,
        productId: product.id,
        variantIds: product.variants.map((variant) => variant.id),
      },
    });
    return { product };
  }

  if (name === 'generate_discount_code') {
    const kind = args.kind;
    if (kind !== 'sales_credit' && kind !== 'devrel_comp') {
      throw new Error('kind must be sales_credit or devrel_comp');
    }

    return {
      discountCode: await generateSwagCodeForActor({
        actorEmail,
        kind,
        recipient: stringArg(args.recipient),
        purpose: stringArg(args.purpose),
      }),
    };
  }

  if (name === 'preview_order') {
    return previewAutomatedOrder(args as AutomatedOrderInput);
  }

  if (name === 'preview_event_order') {
    return previewEventSwagOrder({
      input: args as EventSwagOrderInput,
      actorEmail,
    });
  }

  if (name === 'create_event_order') {
    return createEventSwagOrder({
      input: args as EventSwagOrderInput,
      actorEmail,
      origin,
    });
  }

  if (name === 'submit_order') {
    return submitAutomatedOrder({
      input: args as AutomatedOrderInput,
      origin,
    });
  }

  throw new Error(`Unknown tool: ${name ?? ''}`);
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: JsonRpcRequest['id'], code: number, message: string, data?: McpErrorData) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function classifyMcpError(err: unknown): { code: number; message: string; data: McpErrorData } {
  const message = err instanceof Error ? err.message : 'Tool call failed';
  const lower = message.toLowerCase();

  if (lower.startsWith('unknown tool')) {
    return {
      code: -32602,
      message,
      data: {
        type: 'UNKNOWN_TOOL',
        retryable: false,
        userAction: 'Call tools/list and choose one of the advertised tool names.',
      },
    };
  }

  if (lower.includes('already been redeemed')) {
    return {
      code: -32010,
      message,
      data: {
        type: 'DISCOUNT_REDEEMED',
        retryable: false,
        userAction: 'Generate or ask for a fresh single-use discount code, then preview_order before submitting again.',
      },
    };
  }

  if (lower.includes('stripe') || lower.includes('checkout')) {
    return {
      code: -32020,
      message,
      data: {
        type: 'PAYMENT_CONFIGURATION_MISSING',
        retryable: false,
        userAction: 'Set Stripe environment variables or use a fully discounted order path.',
      },
    };
  }

  if (lower.includes('left in stock') || lower.includes('inventory') || lower.includes('out of stock')) {
    return {
      code: -32030,
      message,
      data: {
        type: 'INVENTORY_UNAVAILABLE',
        retryable: false,
        userAction: 'Call list_products again and select an in-stock variant or lower the quantity.',
      },
    };
  }

  if (lower.includes('not found')) {
    return {
      code: -32040,
      message,
      data: {
        type: 'NOT_FOUND',
        retryable: false,
        userAction: 'Call list_products and use the exact current productId and variantId values.',
      },
    };
  }

  if (lower.includes('database_url')) {
    return {
      code: -32050,
      message,
      data: {
        type: 'SERVICE_UNAVAILABLE',
        retryable: true,
        userAction: 'Retry after the backend database configuration is available.',
      },
    };
  }

  if (isValidationMessage(lower)) {
    return {
      code: -32602,
      message,
      data: {
        type: 'VALIDATION_ERROR',
        retryable: false,
        userAction: 'Fix the tool arguments according to get_api_spec and retry the same workflow.',
      },
    };
  }

  return {
    code: -32000,
    message,
    data: {
      type: 'INTERNAL_ERROR',
      retryable: true,
      userAction: 'Retry once; if it repeats, surface the error message to the operator.',
    },
  };
}

function isValidationMessage(message: string): boolean {
  return [
    'required',
    'must be',
    'needs a',
    'add at least',
    'cart is empty',
    'invalid cart quantity',
    'direct api order submission',
    'price',
    'variant line',
    'image',
  ].some((fragment) => message.includes(fragment));
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toInventoryUpdateArgs(args: Record<string, unknown>): {
  mode: InventoryAdjustmentMode;
  source: string;
  reason: string;
  items: InventoryAdjustmentInput[];
} {
  return {
    mode: inventoryMode(args.mode),
    source: stringArg(args.source) ?? '',
    reason: stringArg(args.reason) ?? '',
    items: Array.isArray(args.items) ? (args.items as InventoryAdjustmentInput[]) : [],
  };
}

function toInventoryDocumentUpdate(args: Record<string, unknown>): {
  mode: InventoryAdjustmentMode;
  source: string;
  reason: string;
  items: InventoryAdjustmentInput[];
} {
  const sourceName = stringArg(args.sourceName) ?? stringArg(args.source) ?? 'inventory-document';
  const rows = parseInventoryDocument(String(args.documentText ?? ''));
  return {
    mode: inventoryMode(args.mode),
    source: sourceName,
    reason: stringArg(args.reason) ?? `Parsed inventory document: ${sourceName}`,
    items: rows.map(rowToInventoryAdjustmentInput),
  };
}

function rowToInventoryAdjustmentInput(row: InventoryImportRow): InventoryAdjustmentInput {
  const quantity = numericField(row, ['quantity', 'qty', 'stock', 'on_hand', 'inventory']);
  return {
    variantId: textField(row, ['variant_id', 'variant']),
    productId: textField(row, ['product_id', 'id']),
    sku: textField(row, ['sku', 'product_sku']),
    size: textField(row, ['size', 'size_label']),
    color: textField(row, ['color', 'colour']),
    quantity,
    stock: quantity,
    note: textField(row, ['note', 'notes', 'description']),
  };
}

function inventoryMode(value: unknown): InventoryAdjustmentMode {
  if (value === 'receive_shipment' || value === 'audit_count' || value === 'manual_correction') return value;
  throw new Error('mode must be receive_shipment, audit_count, or manual_correction.');
}

function textField(row: InventoryImportRow, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function numericField(row: InventoryImportRow, keys: string[]): number | undefined {
  const value = textField(row, keys);
  if (!value) return undefined;
  const parsed = Number.parseInt(value.replace(/,/g, ''), 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function getAgentApiSpec() {
  return {
    ax: {
      sizeOrder: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      workflows: {
        productCreateOrUpdate: [
          'Call preview_product with structured colors, sizes, variants, and tags when possible.',
          'Show or internally verify product.id, slug, price, sizes, and variants from the preview.',
          'Call upsert_product with the same payload after the user approves the write.',
          'Call list_products to confirm the product is orderable and capture exact variant IDs.',
        ],
        orderSubmission: [
          'Call list_products and choose exact productId and variantId values.',
          'Call preview_order to validate stock, discount eligibility, total, and missing direct-order fields.',
          'If preview_order.status is needs_customer_shipping, collect missingFields before submit_order.',
          'If preview_order.status is payment_required, ask the user to approve a Stripe Checkout link before submit_order.',
          'Call submit_order only after the user approves the final cart, discount, customer, and shipping details.',
        ],
        eventSwagOrder: [
          'Call list_inventory to inspect the source-of-record stock and capture exact productId and variantId values.',
          'Call preview_event_order with eventName, items, customer, and shipping details.',
          'If preview_event_order.status is needs_customer_shipping, collect missingFields before creating anything.',
          'Call create_event_order only after the user approves the final event order.',
          'create_event_order creates a single-use 100% devrel comp code, submits the zero-dollar order, and lets Inngest reserve inventory.',
        ],
        receivingShipment: [
          'If the source is messy text, email, CSV, or a copied manifest, call preview_inventory_document with mode receive_shipment.',
          'If the source is already structured, call preview_inventory_update with mode receive_shipment and positive item quantities.',
          'Show previousStock, quantityChange, and newStock to the user for approval.',
          'Call apply_inventory_update with the same proposedUpdate and a clear reason.',
          'Call list_inventory_audits to confirm the ledger entry was recorded.',
        ],
        physicalInventoryAudit: [
          'Call list_inventory to get the source-of-record baseline.',
          'Convert counted physical stock into audit_count items using exact variant IDs whenever possible.',
          'Call preview_inventory_update or preview_inventory_document with mode audit_count.',
          'Review variances in quantityChange, then call apply_inventory_update after approval.',
          'Use list_inventory_audits to explain historical adjustments.',
        ],
      },
      idempotency: {
        list_products: 'Read-only and idempotent.',
        list_inventory: 'Read-only and idempotent; returns the current source-of-record inventory rows.',
        preview_inventory_update:
          'Read-only and idempotent for the current inventory state; computes previousStock, quantityChange, and newStock.',
        preview_inventory_document:
          'Read-only and idempotent for the current inventory state; parses source text into a proposed inventory update.',
        apply_inventory_update:
          'Not idempotent. Changes stock and writes an audit-trail record for each adjusted variant.',
        list_inventory_audits: 'Read-only and idempotent; returns recent inventory adjustment records.',
        preview_product: 'Read-only and idempotent; normalizes input but does not write.',
        upsert_product: 'Idempotent for the same stable product id; replaces current product and variant data for that product.',
        generate_discount_code: 'Not idempotent; every call creates a new single-use code.',
        preview_order: 'Read-only and idempotent for the current catalog, inventory, and discount state.',
        preview_event_order: 'Read-only and idempotent; validates a hypothetical 100% event comp order without creating a code.',
        create_event_order:
          'Not idempotent. Creates a new 100% single-use code and sends an Inngest order event that reserves inventory.',
        submit_order:
          'Not idempotent. Fully discounted direct orders send an Inngest event with an order id and pre-record discount redemption so a single-use code cannot be reused.',
      },
      errors: {
        shape: '{ code, message, data: { type, retryable, userAction } }',
        types: [
          'UNAUTHORIZED',
          'PARSE_ERROR',
          'METHOD_NOT_FOUND',
          'UNKNOWN_TOOL',
          'VALIDATION_ERROR',
          'NOT_FOUND',
          'DISCOUNT_REDEEMED',
          'PAYMENT_CONFIGURATION_MISSING',
          'INVENTORY_UNAVAILABLE',
          'SERVICE_UNAVAILABLE',
          'INTERNAL_ERROR',
        ],
      },
    },
    rest: {
      auth: 'Use Authorization: Bearer <token>. Tokens come from /admin API Tokens or SWAG_STORE_API_TOKEN.',
      endpoints: {
        listProducts: {
          method: 'GET',
          path: '/api/ai/products',
          response: 'Returns { products, apiSpec }. Use product.id and variant.id exactly when ordering.',
        },
        upsertProduct: {
          method: 'POST',
          path: '/api/ai/products',
          bodySchema: productUpsertInputSchema,
          response: 'Returns { product, apiSpec }. Creates or updates a product and its variants.',
          example: {
            name: 'Workflow Hoodie',
            type: 'Hoodie',
            sku: 'INN-WORKFLOW-HOODIE',
            cover: 'dark',
            priceDollars: '64',
            category: 'apparel',
            image: '/products/workflow-hoodie.png',
            colors: [{ name: 'black', hex: '#111111', label: 'Black' }],
            sizes: ['S', 'M', 'L', 'XL', 'XXL'],
            variants: [
              { id: 'var_workflow-hoodie-black-s', size: 'S', color: 'black', stock: 10 },
              { id: 'var_workflow-hoodie-black-m', size: 'M', color: 'black', stock: 12 },
              { id: 'var_workflow-hoodie-black-l', size: 'L', color: 'black', stock: 12 },
            ],
            featured: true,
            tags: ['office-stock', 'hoodie'],
          },
        },
        generateDiscountCode: {
          method: 'POST',
          path: '/api/ai/discount-codes',
          bodySchema: {
            type: 'object',
            required: ['kind'],
            properties: {
              kind: { type: 'string', enum: ['sales_credit', 'devrel_comp'] },
              recipient: { type: 'string' },
              purpose: { type: 'string' },
            },
          },
        },
        submitOrder: {
          method: 'POST',
          path: '/api/ai/orders',
          description: 'Submits fully discounted orders or returns a Stripe checkout URL for paid orders.',
        },
      },
    },
    mcpTools: {
      list_products: tools.find((tool) => tool.name === 'list_products'),
      list_inventory: tools.find((tool) => tool.name === 'list_inventory'),
      preview_inventory_update: tools.find((tool) => tool.name === 'preview_inventory_update'),
      apply_inventory_update: tools.find((tool) => tool.name === 'apply_inventory_update'),
      preview_inventory_document: tools.find((tool) => tool.name === 'preview_inventory_document'),
      list_inventory_audits: tools.find((tool) => tool.name === 'list_inventory_audits'),
      preview_product: tools.find((tool) => tool.name === 'preview_product'),
      upsert_product: tools.find((tool) => tool.name === 'upsert_product'),
      generate_discount_code: tools.find((tool) => tool.name === 'generate_discount_code'),
      preview_order: tools.find((tool) => tool.name === 'preview_order'),
      preview_event_order: tools.find((tool) => tool.name === 'preview_event_order'),
      create_event_order: tools.find((tool) => tool.name === 'create_event_order'),
      submit_order: tools.find((tool) => tool.name === 'submit_order'),
    },
  };
}

function productOutputSchema() {
  return {
    type: 'object',
    required: ['id', 'slug', 'name', 'sku', 'price', 'variants'],
    properties: {
      id: { type: 'string' },
      slug: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string' },
      sku: { type: 'string' },
      price: { type: 'integer', description: 'Price in cents.' },
      category: { type: 'string', enum: ['apparel', 'accessories'] },
      image: { type: 'string' },
      colors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'hex', 'label'],
          properties: {
            name: { type: 'string' },
            hex: { type: 'string' },
            label: { type: 'string' },
          },
        },
      },
      sizes: { type: 'array', items: { type: 'string' } },
      variants: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'stock'],
          properties: {
            id: { type: 'string' },
            size: { type: 'string' },
            color: { type: 'string' },
            stock: { type: 'integer' },
          },
        },
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
  };
}

function orderInputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['productId', 'variantId', 'quantity'],
          properties: {
            productId: {
              type: 'string',
              description: 'Exact product id returned by list_products, not the slug or SKU.',
            },
            variantId: {
              type: 'string',
              description: 'Exact variant id returned by list_products for the selected size/color.',
            },
            quantity: { type: 'integer', minimum: 1, maximum: 99 },
            size: { type: 'string', description: 'Optional human-readable size for traceability.' },
            color: { type: 'string', description: 'Optional human-readable color for traceability.' },
          },
        },
      },
      discountCode: {
        type: 'string',
        description:
          'Optional swag discount code. For direct zero-dollar order submission, use a valid 100% devrel_comp code generated by generate_discount_code.',
      },
      customer: {
        type: 'object',
        additionalProperties: false,
        properties: {
          email: {
            type: 'string',
            description: 'Required for direct fully discounted orders; optional for paid Stripe Checkout sessions.',
          },
          name: {
            type: 'string',
            description: 'Required for direct fully discounted orders unless shipping.name is supplied.',
          },
          phone: { type: 'string' },
        },
      },
      shipping: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: 'Recipient name. Required if customer.name is not supplied for direct orders.' },
          line1: { type: 'string', description: 'Required for direct fully discounted orders.' },
          line2: { type: 'string' },
          city: { type: 'string', description: 'Required for direct fully discounted orders.' },
          state: { type: 'string', description: 'Required for direct fully discounted orders.' },
          postalCode: { type: 'string', description: 'Required for direct fully discounted orders.' },
          country: { type: 'string', description: 'Use US or CA. Defaults to US for direct orders when omitted.' },
        },
      },
    },
  };
}

function eventOrderInputSchema() {
  const base = orderInputSchema();

  return {
    ...base,
    required: ['eventName', 'items'],
    properties: {
      eventName: {
        type: 'string',
        description: 'Required event, conference, meetup, campaign, or internal event name for audit labels.',
      },
      eventDate: {
        type: 'string',
        description: 'Optional event date, preferably YYYY-MM-DD when known.',
      },
      recipient: {
        type: 'string',
        description: 'Optional recipient/owner for the generated 100% code. Defaults to the API actor email.',
      },
      purpose: {
        type: 'string',
        description: 'Optional extra context for why swag is being ordered.',
      },
      ...base.properties,
    },
  };
}

function inventoryUpdateInputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'items'],
    properties: {
      mode: {
        type: 'string',
        enum: ['receive_shipment', 'audit_count', 'manual_correction'],
        description:
          'receive_shipment adds quantity to stock; audit_count sets stock to the counted value; manual_correction applies a signed quantity delta.',
      },
      source: {
        type: 'string',
        description: 'Where the numbers came from, e.g. shipping manifest, email subject, warehouse count, or vendor name.',
      },
      reason: {
        type: 'string',
        description: 'Required for apply_inventory_update. Explain why stock is changing.',
      },
      items: {
        type: 'array',
        minItems: 1,
        items: inventoryAdjustmentInputItemSchema(),
      },
    },
  };
}

function inventoryDocumentInputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['mode', 'documentText'],
    properties: {
      mode: {
        type: 'string',
        enum: ['receive_shipment', 'audit_count'],
        description: 'How parsed quantities should be interpreted.',
      },
      sourceName: {
        type: 'string',
        description: 'Filename, email subject, shipping manifest id, or human-readable source name.',
      },
      reason: {
        type: 'string',
        description: 'Audit reason to reuse when applying the returned proposedUpdate.',
      },
      documentText: {
        type: 'string',
        description:
          'CSV, TSV, copied table, shipping manifest text, email text, or document-export text containing product identifiers and quantities.',
      },
    },
  };
}

function inventoryAdjustmentInputItemSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      variantId: { type: 'string', description: 'Preferred exact variant id from list_inventory.' },
      productId: { type: 'string', description: 'Optional product id from list_inventory.' },
      sku: { type: 'string', description: 'Optional product SKU from list_inventory.' },
      size: { type: 'string', description: 'Size label, e.g. XS, S, M, L, XL, XXL, XXXL.' },
      color: { type: 'string' },
      quantity: {
        type: 'integer',
        description:
          'For receive_shipment, positive quantity to add. For manual_correction, signed delta. For audit_count, may be used as counted stock.',
      },
      stock: {
        type: 'integer',
        minimum: 0,
        description: 'For audit_count, counted on-hand stock.',
      },
      note: { type: 'string' },
    },
  };
}

function inventoryPreviewOutputSchema() {
  return {
    type: 'object',
    required: ['ok', 'mode', 'source', 'reason', 'items', 'issues'],
    properties: {
      ok: { type: 'boolean' },
      mode: { type: 'string', enum: ['receive_shipment', 'audit_count', 'manual_correction'] },
      source: { type: 'string' },
      reason: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'variantId',
            'productId',
            'productName',
            'sku',
            'size',
            'color',
            'previousStock',
            'quantityChange',
            'newStock',
            'note',
          ],
          properties: inventoryAdjustmentItemProperties(),
        },
      },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          required: ['severity', 'message'],
          properties: {
            severity: { type: 'string', enum: ['warning', 'error'] },
            message: { type: 'string' },
            item: { type: 'integer' },
          },
        },
      },
    },
  };
}

function inventoryAdjustmentRecordSchema() {
  return {
    type: 'object',
    required: [
      'id',
      'batchId',
      'mode',
      'source',
      'reason',
      'actorEmail',
      'createdAt',
      'variantId',
      'productId',
      'productName',
      'sku',
      'size',
      'color',
      'previousStock',
      'quantityChange',
      'newStock',
      'note',
    ],
    properties: {
      id: { type: 'integer' },
      batchId: { type: 'string' },
      mode: { type: 'string', enum: ['receive_shipment', 'audit_count', 'manual_correction'] },
      source: { type: 'string' },
      reason: { type: 'string' },
      actorEmail: { type: 'string' },
      createdAt: { type: 'string' },
      ...inventoryAdjustmentItemProperties(),
    },
  };
}

function inventoryAdjustmentItemProperties() {
  return {
    variantId: { type: 'string' },
    productId: { type: 'string' },
    productName: { type: 'string' },
    sku: { type: 'string' },
    size: { type: 'string' },
    color: { type: 'string' },
    previousStock: { type: 'integer' },
    quantityChange: { type: 'integer' },
    newStock: { type: 'integer' },
    note: { type: 'string' },
  };
}

function orderPreviewItemsSchema() {
  return {
    type: 'array',
    items: {
      type: 'object',
      required: [
        'productId',
        'productName',
        'sku',
        'variantId',
        'size',
        'color',
        'quantity',
        'unitAmountCents',
        'amountTotalCents',
      ],
      properties: {
        productId: { type: 'string' },
        productName: { type: 'string' },
        sku: { type: 'string' },
        variantId: { type: 'string' },
        size: { type: 'string' },
        color: { type: 'string' },
        quantity: { type: 'integer' },
        unitAmountCents: { type: 'integer' },
        amountTotalCents: { type: 'integer' },
      },
    },
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
    'Access-Control-Expose-Headers': 'mcp-session-id, www-authenticate',
  };
}
