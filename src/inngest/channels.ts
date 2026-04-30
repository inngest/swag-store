import { channel } from 'inngest/realtime';
import { z } from 'zod';

export const orderChannel = channel({
  name: (orderId: string) => `order:${orderId}`,
  topics: {
    step: {
      schema: z.object({
        name: z.string(),
        status: z.enum(['running', 'complete', 'failed']),
        output: z.record(z.string(), z.unknown()).optional(),
        ts: z.number(),
      }),
    },
  },
});

export const adminChannel = channel({
  name: 'admin',
  topics: {
    order: {
      schema: z.object({
        orderId: z.string(),
        customerEmail: z.string().optional(),
        amount: z.number().optional(),
        currency: z.string().optional(),
        items: z
          .array(z.object({ name: z.string(), quantity: z.number() }))
          .optional(),
        step: z.string(),
        status: z.enum(['running', 'complete', 'failed']),
        ts: z.number(),
      }),
    },
  },
});
