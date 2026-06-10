import {
  generateSingleUseDiscountCodes,
  type AdminDiscountCode,
} from './store-db';

export type SwagCodeAgentKind = 'sales_credit' | 'devrel_comp';

export async function runSwagCodeAgent(input: {
  actorEmail: string;
  recipient?: string;
  purpose?: string;
  kind: SwagCodeAgentKind;
}): Promise<AdminDiscountCode> {
  const [code] = await runSwagCodeAgentBatch({ ...input, count: 1 });
  return code;
}

export async function runSwagCodeAgentBatch(input: {
  actorEmail: string;
  recipient?: string;
  purpose?: string;
  kind: SwagCodeAgentKind;
  count?: number;
}): Promise<AdminDiscountCode[]> {
  if (input.kind !== 'sales_credit' && input.kind !== 'devrel_comp') {
    throw new Error('Unknown swag code kind.');
  }

  const recipient = String(input.recipient ?? '').trim();
  const purpose = String(input.purpose ?? '').trim();
  const labelParts = [
    input.kind === 'sales_credit' ? 'Sales credit' : 'Devrel comp',
    recipient && `for ${recipient}`,
    purpose && `- ${purpose}`,
  ].filter(Boolean);

  return generateSingleUseDiscountCodes({
    prefix: input.kind === 'sales_credit' ? 'SALES' : 'DEVREL',
    label: `${labelParts.join(' ')} · ${input.actorEmail}`,
    type: input.kind === 'sales_credit' ? 'amount_off' : 'percent_off',
    amountOffCents: input.kind === 'sales_credit' ? 10000 : null,
    percentOff: input.kind === 'devrel_comp' ? 100 : null,
    count: input.count ?? 1,
    createdBy: input.actorEmail,
  });
}
