import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/api-auth';
import {
  generateSwagCodeForActor,
  listAutomationProducts,
  submitAutomatedOrder,
  type AutomatedOrderInput,
} from '@/lib/order-automation';

type JsonRpcRequest = {
  jsonrpc?: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const tools = [
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
    return NextResponse.json(
      rpcError(null, -32001, err instanceof Error ? err.message : 'Unauthorized'),
      { status: 401, headers: corsHeaders() },
    );
  }

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = (await req.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: corsHeaders() });
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
            'Use list_products first, then generate_discount_code if the user needs a single-use code, then submit_order.',
            'Generated codes are single-use. Direct order submission is only possible when the order total is zero after discounts and complete customer/shipping details are supplied.',
            'If submit_order returns payment_required, give the user the checkoutUrl; no order has been placed until Stripe Checkout completes.',
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

    return rpcError(id, -32601, `Method not found: ${message.method ?? ''}`);
  } catch (err) {
    return rpcError(id, -32000, err instanceof Error ? err.message : 'Tool call failed');
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

function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
    'Access-Control-Expose-Headers': 'mcp-session-id',
  };
}
