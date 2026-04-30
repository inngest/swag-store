import { Inngest } from 'inngest';
import { encryptionMiddleware } from '@inngest/middleware-encryption';

const middleware = process.env.INNGEST_ENCRYPTION_KEY
  ? [encryptionMiddleware({ key: process.env.INNGEST_ENCRYPTION_KEY })]
  : [];

export const inngest = new Inngest({
  id: 'inngest-swag-store',
  middleware,
});
