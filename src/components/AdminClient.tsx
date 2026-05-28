'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { subscribe } from 'inngest/realtime';
import {
  fetchAdminDashboardAction,
  fetchAdminSubscriptionToken,
  generateApiTokenAction,
  generateSwagCodeAction,
  requestInventoryImportAction,
  revokeApiTokenAction,
  updateDiscountCodeActiveAction,
  updateInventoryAction,
  updateOrderStatusAction,
  upsertDiscountCodeAction,
} from '@/app/admin/actions';
import type {
  AdminApiToken,
  AdminDiscountCode,
  AdminInventoryRow,
  AdminOrder,
  GeneratedApiToken,
  DiscountCodeType,
  InventoryImportRun,
  OrderStatus,
} from '@/lib/store-db';

type Tab = 'inventory' | 'pending' | 'fulfilled' | 'shipped' | 'discounts' | 'api' | 'imports';

type ImportMessage = {
  importRunId?: number;
  status: 'running' | 'complete' | 'failed';
  message: string;
  ts: number;
};

export function AdminClient({
  adminEmail,
  initialInventory,
  initialOrders,
  initialImports,
  initialDiscounts,
  initialApiTokens,
  isDatabaseBacked,
}: {
  adminEmail: string;
  initialInventory: AdminInventoryRow[];
  initialOrders: AdminOrder[];
  initialImports: InventoryImportRun[];
  initialDiscounts: AdminDiscountCode[];
  initialApiTokens: AdminApiToken[];
  isDatabaseBacked: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>('inventory');
  const [inventory, setInventory] = React.useState(initialInventory);
  const [orders, setOrders] = React.useState(initialOrders);
  const [imports, setImports] = React.useState(initialImports);
  const [discounts, setDiscounts] = React.useState(initialDiscounts);
  const [apiTokens, setApiTokens] = React.useState(initialApiTokens);
  const [status, setStatus] = React.useState(() =>
    isDatabaseBacked ? 'ready' : 'read-only local catalog',
  );
  const [importPulse, setImportPulse] = React.useState<ImportMessage | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const refresh = React.useCallback(() => {
    startTransition(() => {
      void (async () => {
        const next = await fetchAdminDashboardAction();
        setInventory(next.inventory);
        setOrders(next.orders);
        setImports(next.imports);
        setDiscounts(next.discounts);
        setApiTokens(next.apiTokens);
        setStatus('refreshed');
      })();
    });
  }, []);

  React.useEffect(() => {
    if (!isDatabaseBacked) {
      return;
    }

    let cancelled = false;
    let sub: { close?: (reason?: string) => void } | undefined;

    (async () => {
      try {
        const token = await fetchAdminSubscriptionToken();
        if (cancelled) return;
        sub = await subscribe(
          {
            channel: token.channel,
            topics: [...token.topics],
            key: token.key,
            apiBaseUrl: token.apiBaseUrl,
          },
          (message) => {
            if (cancelled) return;
            if (message.topic === 'import') {
              setImportPulse(message.data as ImportMessage);
              refresh();
            }
            if (message.topic === 'order') refresh();
          },
        );
        if (!cancelled) setStatus('subscribed');
      } catch (err) {
        if (!cancelled) setStatus(`realtime error: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();

    return () => {
      cancelled = true;
      sub?.close?.('unmount');
    };
  }, [isDatabaseBacked, refresh]);

  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const fulfilledOrders = orders.filter((order) => order.status === 'fulfilled');
  const shippedOrders = orders.filter((order) => order.status === 'shipped');
  const lowStock = inventory.filter((row) => row.stock <= 5).length;
  const activeDiscounts = discounts.filter((discount) => discount.active).length;
  const activeApiTokens = apiTokens.filter((token) => token.active).length;

  const runImport = () => {
    if (!isDatabaseBacked) {
      setStatus('set DATABASE_URL to import');
      return;
    }

    setStatus('starting import');
    startTransition(() => {
      void (async () => {
        await requestInventoryImportAction();
        setStatus('import requested');
        refresh();
      })();
    });
  };

  return (
    <div>
      <div style={{ borderBottom: '1px solid var(--ink)', padding: '32px', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 32, alignItems: 'end' }}>
        <div>
          <div className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live-dot" />
            ADMIN DASHBOARD · {status} · {adminEmail}
            <UserButton />
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(56px, 8vw, 116px)', lineHeight: 0.86, fontWeight: 400, textTransform: 'uppercase', margin: 0 }}>
            Swag ops.
          </h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, maxWidth: 560, marginTop: 16, color: 'var(--muted)' }}>
            Manage live inventory, import Riley&apos;s sheet, and move orders through manual fulfillment.
          </p>
          {!isDatabaseBacked && (
            <p className="mono" style={{ fontSize: 10.5, lineHeight: 1.5, maxWidth: 680, marginTop: 14, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              READ-ONLY LOCAL CATALOG · SET DATABASE_URL TO ENABLE RAILWAY INVENTORY, IMPORTS, AND ORDER MUTATIONS.
            </p>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--ink)', border: '1px solid var(--ink)' }}>
          <Stat label="PENDING" value={pendingOrders.length} accent />
          <Stat label="LOW STOCK" value={lowStock} />
          <Stat label="FULFILLED" value={fulfilledOrders.length} />
          <Stat label="CODES / API" value={`${activeDiscounts} / ${activeApiTokens}`} />
        </div>
      </div>

      <div style={{ padding: '18px 32px', borderBottom: '1px solid var(--ink)', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {[
            ['inventory', 'Inventory'],
            ['pending', 'Pending'],
            ['fulfilled', 'Fulfilled'],
            ['shipped', 'Shipped'],
            ['discounts', 'Discounts'],
            ['api', 'API Tokens'],
            ['imports', 'Imports'],
          ].map(([id, label]) => (
            <button
              key={id}
              className="mono"
              onClick={() => setTab(id as Tab)}
              style={{
                padding: '10px 14px',
                border: '1px solid var(--ink)',
                marginLeft: -1,
                background: tab === id ? 'var(--ink)' : 'var(--paper)',
                color: tab === id ? 'var(--paper)' : 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: 10.5,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {importPulse && (
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              IMPORT {importPulse.status} · {importPulse.message}
            </span>
          )}
          <button className="btn btn-primary square" onClick={refresh} disabled={isPending}>
            REFRESH
          </button>
          <button className="btn btn-citrus square" onClick={runImport} disabled={isPending || !isDatabaseBacked}>
            IMPORT SHEET
          </button>
        </div>
      </div>

      {tab === 'inventory' && (
        <InventoryTable
          rows={inventory}
          canMutate={isDatabaseBacked}
          onSave={(row, stock, image) => {
            if (!isDatabaseBacked) {
              setStatus('set DATABASE_URL to save inventory');
              return;
            }

            startTransition(() => {
              void (async () => {
                await updateInventoryAction({ variantId: row.variantId, stock, image });
                refresh();
              })();
            });
          }}
        />
      )}
      {tab === 'pending' && <OrderTable orders={pendingOrders} canMutate={isDatabaseBacked} onStatusChange={refreshingStatusChange(startTransition, refresh)} />}
      {tab === 'fulfilled' && <OrderTable orders={fulfilledOrders} canMutate={isDatabaseBacked} onStatusChange={refreshingStatusChange(startTransition, refresh)} />}
      {tab === 'shipped' && <OrderTable orders={shippedOrders} canMutate={isDatabaseBacked} onStatusChange={refreshingStatusChange(startTransition, refresh)} />}
      {tab === 'discounts' && (
        <DiscountTable
          rows={discounts}
          canMutate={isDatabaseBacked}
          onGenerate={async (input) => {
            if (!isDatabaseBacked) {
              setStatus('set DATABASE_URL to generate discounts');
              return null;
            }

            const generated = await generateSwagCodeAction(input);
            setDiscounts((current) => [generated, ...current.filter((row) => row.code !== generated.code)]);
            setStatus(`generated ${generated.code}`);
            return generated;
          }}
          onSave={(input) => {
            if (!isDatabaseBacked) {
              setStatus('set DATABASE_URL to save discounts');
              return;
            }

            startTransition(() => {
              void (async () => {
                await upsertDiscountCodeAction(input);
                refresh();
              })();
            });
          }}
          onActiveChange={(code, active) => {
            if (!isDatabaseBacked) {
              setStatus('set DATABASE_URL to update discounts');
              return;
            }

            startTransition(() => {
              void (async () => {
                await updateDiscountCodeActiveAction({ code, active });
                refresh();
              })();
            });
          }}
        />
      )}
      {tab === 'api' && (
        <ApiTokenTable
          rows={apiTokens}
          adminEmail={adminEmail}
          canMutate={isDatabaseBacked}
          onGenerate={async (input) => {
            if (!isDatabaseBacked) {
              setStatus('set DATABASE_URL to generate API tokens');
              return null;
            }

            const generated = await generateApiTokenAction(input);
            setApiTokens((current) => [generated.apiToken, ...current.filter((row) => row.id !== generated.apiToken.id)]);
            setStatus(`generated token ${generated.apiToken.tokenPrefix}`);
            return generated;
          }}
          onRevoke={(id) => {
            if (!isDatabaseBacked) {
              setStatus('set DATABASE_URL to revoke API tokens');
              return;
            }

            startTransition(() => {
              void (async () => {
                await revokeApiTokenAction({ id });
                refresh();
              })();
            });
          }}
        />
      )}
      {tab === 'imports' && <ImportTable rows={imports} />}
    </div>
  );
}

function InventoryTable({
  rows,
  canMutate,
  onSave,
}: {
  rows: AdminInventoryRow[];
  canMutate: boolean;
  onSave: (row: AdminInventoryRow, stock: number, image: string) => void;
}) {
  return (
    <div style={{ padding: '0 32px 32px' }}>
      <HeaderGrid columns="1.3fr 0.8fr 0.7fr 0.7fr 0.6fr 1.6fr 0.5fr" labels={['ITEM', 'SKU', 'SIZE', 'COLOR', 'QTY', 'PHOTO', '']} />
      {rows.map((row) => (
        <InventoryRow key={row.variantId} row={row} canMutate={canMutate} onSave={onSave} />
      ))}
    </div>
  );
}

function InventoryRow({
  row,
  canMutate,
  onSave,
}: {
  row: AdminInventoryRow;
  canMutate: boolean;
  onSave: (row: AdminInventoryRow, stock: number, image: string) => void;
}) {
  const [stock, setStock] = React.useState(String(row.stock));
  const [image, setImage] = React.useState(row.image);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 0.7fr 0.7fr 0.6fr 1.6fr 0.5fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
      <div>
        <Link href={`/products/${row.slug}`} style={{ fontSize: 13, color: 'var(--ink)' }}>{row.productName}</Link>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{row.type}</div>
      </div>
      <span className="mono" style={{ fontSize: 11 }}>{row.sku}</span>
      <span className="mono" style={{ fontSize: 11 }}>{row.size || 'ONE'}</span>
      <span className="mono" style={{ fontSize: 11 }}>{row.color || 'DEFAULT'}</span>
      <input value={stock} onChange={(event) => setStock(event.target.value)} disabled={!canMutate} style={inputStyle} />
      <input value={image} onChange={(event) => setImage(event.target.value)} disabled={!canMutate} style={inputStyle} />
      <button className="btn btn-primary square" onClick={() => onSave(row, Number(stock), image)} disabled={!canMutate}>
        SAVE
      </button>
    </div>
  );
}

function OrderTable({
  orders,
  canMutate,
  onStatusChange,
}: {
  orders: AdminOrder[];
  canMutate: boolean;
  onStatusChange: (orderId: string, status: OrderStatus, tracking: string, notes: string) => void;
}) {
  return (
    <div style={{ padding: '0 32px 32px' }}>
      <HeaderGrid columns="0.8fr 1.2fr 1.6fr 0.9fr 0.8fr 1fr 1fr" labels={['ORDER', 'CUSTOMER', 'ITEMS', 'TOTAL', 'STATUS', 'TRACKING', '']} />
      {orders.length === 0 && <EmptyState label="No orders in this queue." />}
      {orders.map((order) => (
        <OrderRow key={order.orderId} order={order} canMutate={canMutate} onStatusChange={onStatusChange} />
      ))}
    </div>
  );
}

function OrderRow({
  order,
  canMutate,
  onStatusChange,
}: {
  order: AdminOrder;
  canMutate: boolean;
  onStatusChange: (orderId: string, status: OrderStatus, tracking: string, notes: string) => void;
}) {
  const [status, setStatus] = React.useState<OrderStatus>(order.status);
  const [tracking, setTracking] = React.useState(order.tracking);
  const [notes, setNotes] = React.useState(order.notes);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 1.6fr 0.9fr 0.8fr 1fr 1fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
      <Link href={`/orders/${order.orderId}`} className="mono" style={{ fontSize: 11 }}>{order.orderId}</Link>
      <div>
        <div style={{ fontSize: 12 }}>{order.name || 'Unknown'}</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)' }}>{order.email}</div>
      </div>
      <span style={{ fontSize: 12, lineHeight: 1.4 }}>{order.items || '-'}</span>
      <div>
        <span className="mono" style={{ fontSize: 11 }}>${(order.totalCents / 100).toFixed(2)}</span>
        {order.discountCode && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
            {order.discountCode} · -${(order.discountAmountCents / 100).toFixed(2)}
          </div>
        )}
      </div>
      <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)} disabled={!canMutate} style={inputStyle}>
        <option value="pending">pending</option>
        <option value="fulfilled">fulfilled</option>
        <option value="shipped">shipped</option>
      </select>
      <input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking" disabled={!canMutate} style={inputStyle} />
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" disabled={!canMutate} style={inputStyle} />
        <button className="btn btn-primary square" onClick={() => onStatusChange(order.orderId, status, tracking, notes)} disabled={!canMutate}>
          SAVE
        </button>
      </div>
    </div>
  );
}

function DiscountTable({
  rows,
  canMutate,
  onGenerate,
  onSave,
  onActiveChange,
}: {
  rows: AdminDiscountCode[];
  canMutate: boolean;
  onGenerate: (input: {
    recipient?: string;
    purpose?: string;
    kind: 'sales_credit' | 'devrel_comp';
  }) => Promise<AdminDiscountCode | null>;
  onSave: (input: {
    code: string;
    label?: string;
    type: DiscountCodeType;
    amountOffCents?: number | null;
    percentOff?: number | null;
    maxRedemptions?: number | null;
    active?: boolean;
  }) => void;
  onActiveChange: (code: string, active: boolean) => void;
}) {
  const [code, setCode] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [type, setType] = React.useState<DiscountCodeType>('amount_off');
  const [value, setValue] = React.useState('100');
  const [recipient, setRecipient] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [latestCode, setLatestCode] = React.useState<AdminDiscountCode | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);

  const generate = async (kind: 'sales_credit' | 'devrel_comp') => {
    setIsGenerating(true);
    try {
      const generated = await onGenerate({ recipient, purpose, kind });
      if (generated) {
        setLatestCode(generated);
        setRecipient('');
        setPurpose('');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const submit = () => {
    const numericValue = Number(value);
    onSave({
      code,
      label,
      type,
      amountOffCents: type === 'amount_off' ? Math.round(numericValue * 100) : null,
      percentOff: type === 'percent_off' ? numericValue : null,
      maxRedemptions: 1,
      active: true,
    });
    setCode('');
    setLabel('');
    setValue(type === 'amount_off' ? '100' : '100');
  };

  return (
    <div style={{ padding: '0 32px 32px' }}>
      <div className="mono" style={{ padding: '18px 0 0', fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        SWAG CODE AGENT
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, padding: '18px 0', borderBottom: '1px solid var(--ink)', alignItems: 'end' }}>
        <LabeledInput label="RECIPIENT" value={recipient} onChange={setRecipient} disabled={!canMutate || isGenerating} placeholder="Name or account" />
        <LabeledInput label="PURPOSE" value={purpose} onChange={setPurpose} disabled={!canMutate || isGenerating} placeholder="Campaign, event, request" />
        <button className="btn btn-citrus square" onClick={() => void generate('sales_credit')} disabled={!canMutate || isGenerating}>
          $100 AGENT
        </button>
        <button className="btn btn-primary square" onClick={() => void generate('devrel_comp')} disabled={!canMutate || isGenerating}>
          100% AGENT
        </button>
      </div>

      {latestCode && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
          <div>
            <div className="mono" style={labelStyle}>LATEST SINGLE-USE CODE</div>
            <div className="display" style={{ fontSize: 24, lineHeight: 1, fontWeight: 500 }}>{latestCode.code}</div>
          </div>
          <button
            className="btn btn-primary square"
            onClick={() => void navigator.clipboard?.writeText(latestCode.code)}
          >
            COPY
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr 0.7fr auto', gap: 10, padding: '18px 0', borderBottom: '1px solid var(--ink)', alignItems: 'end' }}>
        <LabeledInput label="CODE" value={code} onChange={setCode} disabled={!canMutate} placeholder="SALES100" />
        <LabeledInput label="LABEL" value={label} onChange={setLabel} disabled={!canMutate} placeholder="Sales credit" />
        <div>
          <div className="mono" style={labelStyle}>TYPE</div>
          <select value={type} onChange={(event) => setType(event.target.value as DiscountCodeType)} disabled={!canMutate} style={inputStyle}>
            <option value="amount_off">$ off</option>
            <option value="percent_off">% off</option>
          </select>
        </div>
        <LabeledInput label={type === 'amount_off' ? 'DOLLARS' : 'PERCENT'} value={value} onChange={setValue} disabled={!canMutate} placeholder="100" />
        <button className="btn btn-citrus square" onClick={submit} disabled={!canMutate || !code.trim()}>
          ADD SINGLE-USE CODE
        </button>
      </div>

      <HeaderGrid columns="1fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr" labels={['CODE', 'LABEL', 'VALUE', 'USES', 'STATUS', 'UPDATED', '']} />
      {rows.length === 0 && <EmptyState label="No discount codes yet." />}
      {rows.map((row) => (
        <div key={row.code} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.8fr 0.8fr 0.8fr 0.8fr 0.8fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 11 }}>{row.code}</span>
          <span style={{ fontSize: 12 }}>{row.label || '-'}</span>
          <span className="mono" style={{ fontSize: 11 }}>
            {row.type === 'amount_off'
              ? `$${((row.amountOffCents ?? 0) / 100).toFixed(2)}`
              : `${row.percentOff ?? 0}%`}
          </span>
          <span className="mono" style={{ fontSize: 11 }}>
            {row.timesRedeemed}{row.maxRedemptions === null ? '' : ` / ${row.maxRedemptions}`}
          </span>
          <span className="mono" style={{ fontSize: 11 }}>{row.active ? 'active' : 'inactive'}</span>
          <span className="mono" style={{ fontSize: 10.5 }}>{new Date(row.updatedAt).toLocaleDateString()}</span>
          <button className="btn btn-primary square" onClick={() => onActiveChange(row.code, !row.active)} disabled={!canMutate}>
            {row.active ? 'PAUSE' : 'ENABLE'}
          </button>
        </div>
      ))}
    </div>
  );
}

function ApiTokenTable({
  rows,
  adminEmail,
  canMutate,
  onGenerate,
  onRevoke,
}: {
  rows: AdminApiToken[];
  adminEmail: string;
  canMutate: boolean;
  onGenerate: (input: { name: string; actorEmail?: string }) => Promise<GeneratedApiToken | null>;
  onRevoke: (id: number) => void;
}) {
  const [name, setName] = React.useState('');
  const [actorEmail, setActorEmail] = React.useState(adminEmail);
  const [latestToken, setLatestToken] = React.useState<GeneratedApiToken | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);

  const generate = async () => {
    setIsGenerating(true);
    try {
      const generated = await onGenerate({ name, actorEmail });
      if (generated) {
        setLatestToken(generated);
        setName('');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ padding: '0 32px 32px' }}>
      <div className="mono" style={{ padding: '18px 0 0', fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        MCP / AI ACCESS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, padding: '18px 0', borderBottom: '1px solid var(--ink)', alignItems: 'end' }}>
        <LabeledInput label="TOKEN NAME" value={name} onChange={setName} disabled={!canMutate || isGenerating} placeholder="Codex MCP" />
        <LabeledInput label="ACTOR EMAIL" value={actorEmail} onChange={setActorEmail} disabled={!canMutate || isGenerating} placeholder="ai-assistant@inngest.com" />
        <button className="btn btn-citrus square" onClick={() => void generate()} disabled={!canMutate || isGenerating || !name.trim()}>
          GENERATE TOKEN
        </button>
      </div>

      {latestToken && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
          <div>
            <div className="mono" style={labelStyle}>COPY NOW · SHOWN ONCE</div>
            <div className="mono" style={{ fontSize: 12, lineHeight: 1.5, wordBreak: 'break-all' }}>{latestToken.token}</div>
          </div>
          <button
            className="btn btn-primary square"
            onClick={() => void navigator.clipboard?.writeText(latestToken.token)}
          >
            COPY
          </button>
        </div>
      )}

      <HeaderGrid columns="1fr 0.8fr 1.2fr 0.8fr 0.8fr 1fr 0.7fr" labels={['NAME', 'TOKEN', 'ACTOR', 'STATUS', 'LAST USED', 'CREATED', '']} />
      {rows.length === 0 && <EmptyState label="No API tokens yet." />}
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 1.2fr 0.8fr 0.8fr 1fr 0.7fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
          <span style={{ fontSize: 12 }}>{row.name}</span>
          <span className="mono" style={{ fontSize: 11 }}>{row.tokenPrefix}</span>
          <span className="mono" style={{ fontSize: 10.5 }}>{row.actorEmail}</span>
          <span className="mono" style={{ fontSize: 11 }}>{row.active ? 'active' : 'revoked'}</span>
          <span className="mono" style={{ fontSize: 10.5 }}>{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : '-'}</span>
          <span className="mono" style={{ fontSize: 10.5 }}>
            {new Date(row.createdAt).toLocaleDateString()} · {row.createdBy || '-'}
          </span>
          <button className="btn btn-primary square" onClick={() => onRevoke(row.id)} disabled={!canMutate || !row.active}>
            REVOKE
          </button>
        </div>
      ))}
    </div>
  );
}

function ImportTable({ rows }: { rows: InventoryImportRun[] }) {
  return (
    <div style={{ padding: '0 32px 32px' }}>
      <HeaderGrid columns="0.4fr 0.8fr 1fr 1fr 1.8fr" labels={['ID', 'STATUS', 'STARTED', 'ACTOR', 'SUMMARY']} />
      {rows.length === 0 && <EmptyState label="No inventory imports yet." />}
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '0.4fr 0.8fr 1fr 1fr 1.8fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
          <span className="mono">{row.id}</span>
          <span className="mono">{row.status}</span>
          <span className="mono" style={{ fontSize: 11 }}>{new Date(row.startedAt).toLocaleString()}</span>
          <span className="mono" style={{ fontSize: 11 }}>{row.actorEmail || '-'}</span>
          <span className="mono" style={{ fontSize: 11 }}>{row.error || JSON.stringify(row.summary)}</span>
        </div>
      ))}
    </div>
  );
}

function refreshingStatusChange(
  startTransition: (callback: () => void) => void,
  refresh: () => void,
) {
  return (orderId: string, status: OrderStatus, tracking: string, notes: string) => {
    startTransition(() => {
      void (async () => {
        await updateOrderStatusAction({ orderId, status, tracking, notes });
        refresh();
      })();
    });
  };
}

function HeaderGrid({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div className="mono" style={{ display: 'grid', gridTemplateColumns: columns, gap: 12, padding: '16px 0', borderBottom: '1px solid var(--ink)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
      {labels.map((label) => <span key={label}>{label}</span>)}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mono" style={{ padding: '32px 0', color: 'var(--muted)', fontSize: 12 }}>
      {label}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? 'var(--citrus)' : 'var(--paper)', padding: '18px 20px' }}>
      <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent ? 'var(--nebula)' : 'var(--muted)' }}>
        {label}
      </div>
      <div className="display tabnum" style={{ fontSize: 38, fontWeight: 400, marginTop: 6, color: accent ? 'var(--nebula)' : 'var(--ink)' }}>
        {value}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mono" style={labelStyle}>{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  border: '1px solid var(--ink)',
  background: 'var(--paper)',
  padding: '8px 10px',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
};
