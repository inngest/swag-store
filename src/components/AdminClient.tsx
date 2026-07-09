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
  mintEventDiscountCodesAction,
  requestInventoryImportAction,
  revokeApiTokenAction,
  updateApiTokenAction,
  updateDiscountCodeActiveAction,
  updateInventoryAction,
  updateOrderStatusAction,
  uploadProductImageAction,
  upsertDiscountCodeAction,
  upsertProductAction,
} from '@/app/admin/actions';
import type { Product, ProductSize } from '@/lib/catalog';
import type { ProductUpsertInput } from '@/lib/product-management';
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

type Tab = 'inventory' | 'products' | 'pending' | 'fulfilled' | 'shipped' | 'cancelled' | 'discounts' | 'api' | 'imports';

// Mirrors ORDER_STATUS_TRANSITIONS in store-db (which can't be imported into
// a client component). Cancelling restocks the reserved units and refunds the
// Stripe payment; shipped and cancelled are terminal.
const STATUS_OPTIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['pending', 'fulfilled', 'cancelled'],
  fulfilled: ['fulfilled', 'shipped', 'cancelled'],
  shipped: ['shipped'],
  cancelled: ['cancelled'],
};

type ImportMessage = {
  importRunId?: number;
  status: 'running' | 'complete' | 'failed';
  message: string;
  ts: number;
};

type SaveState = {
  status: 'idle' | 'saving' | 'saved' | 'error';
  message?: string;
};

const idleSaveState: SaveState = { status: 'idle' };

export function AdminClient({
  adminEmail,
  initialInventory,
  initialOrders,
  initialImports,
  initialDiscounts,
  initialApiTokens,
  initialProducts,
  isDatabaseBacked,
  canImportSheet,
}: {
  adminEmail: string;
  initialInventory: AdminInventoryRow[];
  initialOrders: AdminOrder[];
  initialImports: InventoryImportRun[];
  initialDiscounts: AdminDiscountCode[];
  initialApiTokens: AdminApiToken[];
  initialProducts: Product[];
  isDatabaseBacked: boolean;
  canImportSheet: boolean;
}) {
  const [tab, setTab] = React.useState<Tab>('inventory');
  const [inventory, setInventory] = React.useState(initialInventory);
  const [orders, setOrders] = React.useState(initialOrders);
  const [imports, setImports] = React.useState(initialImports);
  const [discounts, setDiscounts] = React.useState(initialDiscounts);
  const [apiTokens, setApiTokens] = React.useState(initialApiTokens);
  const [products, setProducts] = React.useState(initialProducts);
  const [status, setStatus] = React.useState(() =>
    isDatabaseBacked ? 'ready' : 'read-only local catalog',
  );
  const [importPulse, setImportPulse] = React.useState<ImportMessage | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const loadDashboard = React.useCallback(async () => {
    const next = await fetchAdminDashboardAction();
    setInventory(next.inventory);
    setOrders(next.orders);
    setImports(next.imports);
    setDiscounts(next.discounts);
    setApiTokens(next.apiTokens);
    setProducts(next.products);
    return next;
  }, []);

  const refresh = React.useCallback(() => {
    setStatus('refreshing');
    startTransition(() => {
      void loadDashboard()
        .then(() => setStatus('refreshed'))
        .catch((err) => setStatus(messageFromError(err)));
    });
  }, [loadDashboard]);

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
  const cancelledOrders = orders.filter((order) => order.status === 'cancelled');
  const lowStock = inventory.filter((row) => row.stock <= 5).length;
  const activeDiscounts = discounts.filter((discount) => discount.active).length;
  const activeApiTokens = apiTokens.filter((token) => token.active).length;

  const runImport = () => {
    if (!isDatabaseBacked) {
      setStatus('set DATABASE_URL to import');
      return;
    }
    if (!canImportSheet) {
      setStatus('set INVENTORY_SHEET_ID or ORDERS_SHEET_ID to import sheet');
      return;
    }

    setStatus('starting import');
    startTransition(() => {
      void (async () => {
        try {
          await requestInventoryImportAction();
          setStatus('import requested');
          await loadDashboard();
        } catch (err) {
          setStatus(messageFromError(err));
        }
      })();
    });
  };

  const requireLiveAdmin = React.useCallback((action: string) => {
    if (isDatabaseBacked) return;
    const message = `set DATABASE_URL to ${action}`;
    setStatus(message);
    throw new Error(message);
  }, [isDatabaseBacked]);

  const saveOrderStatus = React.useCallback(async (
    orderId: string,
    nextStatus: OrderStatus,
    tracking: string,
    notes: string,
  ) => {
    requireLiveAdmin('update orders');
    await updateOrderStatusAction({ orderId, status: nextStatus, tracking, notes });
    await loadDashboard();
    setStatus(`saved order ${orderId}`);
  }, [loadDashboard, requireLiveAdmin]);

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
            ['products', 'Products'],
            ['pending', 'Pending'],
            ['fulfilled', 'Fulfilled'],
            ['shipped', 'Shipped'],
            ['cancelled', 'Cancelled'],
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
          <button className="btn btn-citrus square" onClick={runImport} disabled={isPending || !isDatabaseBacked || !canImportSheet}>
            IMPORT SHEET
          </button>
        </div>
      </div>

      {tab === 'inventory' && (
        <InventoryTable
          rows={inventory}
          canMutate={isDatabaseBacked}
          onSave={async (row, stock, image) => {
            requireLiveAdmin('save inventory');
            await updateInventoryAction({ variantId: row.variantId, stock, image });
            await loadDashboard();
            setStatus(`saved ${row.productName} ${row.size || row.color || 'inventory'}`);
          }}
        />
      )}
      {tab === 'products' && (
        <ProductManager
          rows={products}
          canMutate={isDatabaseBacked}
          onSave={async (input) => {
            requireLiveAdmin('save products');
            const saved = await upsertProductAction(input);
            await loadDashboard();
            setStatus(`saved ${saved.name}`);
            return saved;
          }}
        />
      )}
      {tab === 'pending' && <OrderTable orders={pendingOrders} canMutate={isDatabaseBacked} onStatusChange={saveOrderStatus} />}
      {tab === 'fulfilled' && <OrderTable orders={fulfilledOrders} canMutate={isDatabaseBacked} onStatusChange={saveOrderStatus} />}
      {tab === 'shipped' && <OrderTable orders={shippedOrders} canMutate={isDatabaseBacked} onStatusChange={saveOrderStatus} />}
      {tab === 'cancelled' && <OrderTable orders={cancelledOrders} canMutate={isDatabaseBacked} onStatusChange={saveOrderStatus} />}
      {tab === 'discounts' && (
        <DiscountTable
          rows={discounts}
          canMutate={isDatabaseBacked}
          onGenerate={async (input) => {
            requireLiveAdmin('generate discounts');

            const generated = await generateSwagCodeAction(input);
            setDiscounts((current) => [generated, ...current.filter((row) => row.code !== generated.code)]);
            setStatus(`generated ${generated.code}`);
            return generated;
          }}
          onMintBatch={async (input) => {
            requireLiveAdmin('mint event codes');

            const minted = await mintEventDiscountCodesAction(input);
            setDiscounts((current) => {
              const mintedCodes = new Set(minted.map((row) => row.code));
              return [...minted, ...current.filter((row) => !mintedCodes.has(row.code))];
            });
            setStatus(`minted ${minted.length} ${minted.length === 1 ? 'code' : 'codes'}`);
            return minted;
          }}
          onSave={async (input) => {
            requireLiveAdmin('save discounts');
            await upsertDiscountCodeAction(input);
            await loadDashboard();
            setStatus(`saved discount ${input.code}`);
          }}
          onActiveChange={async (code, active) => {
            requireLiveAdmin('update discounts');
            await updateDiscountCodeActiveAction({ code, active });
            await loadDashboard();
            setStatus(`${active ? 'enabled' : 'paused'} ${code}`);
          }}
        />
      )}
      {tab === 'api' && (
        <ApiTokenTable
          rows={apiTokens}
          adminEmail={adminEmail}
          canMutate={isDatabaseBacked}
          onGenerate={async (input) => {
            requireLiveAdmin('generate API tokens');

            const generated = await generateApiTokenAction(input);
            setApiTokens((current) => [generated.apiToken, ...current.filter((row) => row.id !== generated.apiToken.id)]);
            setStatus(`generated token ${generated.apiToken.tokenPrefix}`);
            return generated;
          }}
          onRevoke={async (id) => {
            requireLiveAdmin('revoke API tokens');
            await revokeApiTokenAction({ id });
            await loadDashboard();
            setStatus('revoked API token');
          }}
          onUpdate={async (input) => {
            requireLiveAdmin('update API tokens');
            await updateApiTokenAction(input);
            await loadDashboard();
            setStatus(`saved API token ${input.name}`);
          }}
        />
      )}
      {tab === 'imports' && (
        <div>
          <DocumentImportPanel
            canMutate={isDatabaseBacked}
            isPending={isPending}
            onRequested={() => {
              setStatus('document import requested');
              refresh();
            }}
            onStatus={setStatus}
          />
          <ImportTable rows={imports} />
        </div>
      )}
    </div>
  );
}

function ProductManager({
  rows,
  canMutate,
  onSave,
}: {
  rows: Product[];
  canMutate: boolean;
  onSave: (input: ProductUpsertInput) => Promise<Product>;
}) {
  const [draft, setDraft] = React.useState<ProductUpsertInput>(() => emptyProductInput());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);
  const [uploadState, setUploadState] = React.useState<SaveState>(idleSaveState);
  const imageFileRef = React.useRef<HTMLInputElement>(null);
  const isSaving = saveState.status === 'saving';
  const isUploading = uploadState.status === 'saving';

  const editProduct = (product: Product) => {
    setEditingId(product.id);
    setDraft(productToInput(product));
    setSaveState(idleSaveState);
    setUploadState(idleSaveState);
  };

  const reset = () => {
    setEditingId(null);
    setDraft(emptyProductInput());
    setSaveState(idleSaveState);
    setUploadState(idleSaveState);
  };

  const cancelEdit = () => {
    const currentProduct = rows.find((product) => product.id === editingId);
    if (currentProduct) {
      editProduct(currentProduct);
      return;
    }
    reset();
  };

  const update = (patch: Partial<ProductUpsertInput>) => setDraft((current) => ({ ...current, ...patch }));
  const fieldsDisabled = !canMutate || isSaving;

  const uploadImage = async () => {
    if (!canMutate) {
      setUploadState({ status: 'error', message: 'Connect a database before uploading images.' });
      return;
    }
    const file = imageFileRef.current?.files?.[0];
    if (!file) {
      setUploadState({ status: 'error', message: 'Choose an image file first.' });
      return;
    }

    setUploadState({ status: 'saving', message: 'Uploading image.' });
    try {
      const formData = new FormData();
      formData.set('file', file);
      if (editingId) formData.set('productId', editingId);
      const uploaded = await uploadProductImageAction(formData);
      update({ image: uploaded.url });
      setUploadState({ status: 'saved', message: 'Image uploaded. Save the product to apply it.' });
      if (imageFileRef.current) imageFileRef.current.value = '';
    } catch (err) {
      setUploadState({ status: 'error', message: messageFromError(err) });
    }
  };

  const submit = async () => {
    if (!canMutate) {
      setSaveState({ status: 'error', message: 'Connect a database before saving products.' });
      return;
    }
    if (!draft.name.trim()) {
      setSaveState({ status: 'error', message: 'Product name is required.' });
      return;
    }
    if (!draft.sku.trim()) {
      setSaveState({ status: 'error', message: 'Product SKU is required.' });
      return;
    }

    setSaveState({ status: 'saving', message: editingId ? 'Saving product.' : 'Creating product.' });
    try {
      const saved = await onSave(draft);
      setEditingId(saved.id);
      setDraft(productToInput(saved));
      setSaveState({ status: 'saved', message: `Saved ${saved.name}.` });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

  return (
    <div style={{ padding: '0 32px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, paddingTop: 18, alignItems: 'start' }}>
        <div>
          <div className="mono" style={{ paddingBottom: 12, fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {editingId ? 'EDIT PRODUCT' : 'NEW PRODUCT'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr', gap: 10 }}>
            <LabeledInput label="NAME" value={draft.name} onChange={(value) => update({ name: value })} disabled={fieldsDisabled} placeholder="Anti Anti Infra Co." />
            <LabeledInput label="SKU" value={draft.sku} onChange={(value) => update({ sku: value.toUpperCase() })} disabled={fieldsDisabled} placeholder="INN-TEE-01" />
            <LabeledInput label="SLUG" value={draft.slug ?? ''} onChange={(value) => update({ slug: value })} disabled={fieldsDisabled} placeholder="anti-anti-infra-tee" />
            <LabeledInput label="TYPE" value={draft.type} onChange={(value) => update({ type: value })} disabled={fieldsDisabled} placeholder="T-Shirt" />
            <LabeledInput label="PRICE" value={draft.priceDollars} onChange={(value) => update({ priceDollars: value })} disabled={fieldsDisabled} placeholder="28" />
            <div>
              <div className="mono" style={labelStyle}>CATEGORY</div>
              <select value={draft.category} onChange={(event) => update({ category: event.target.value as Product['category'] })} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)}>
                <option value="apparel">apparel</option>
                <option value="accessories">accessories</option>
              </select>
            </div>
            <div>
              <div className="mono" style={labelStyle}>COVER</div>
              <select value={draft.cover} onChange={(event) => update({ cover: event.target.value as Product['cover'] })} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)}>
                <option value="light">light</option>
                <option value="dark">dark</option>
                <option value="citrus">citrus</option>
              </select>
            </div>
            <label className="mono" style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <input
                type="checkbox"
                checked={Boolean(draft.featured)}
                disabled={fieldsDisabled}
                onChange={(event) => update({ featured: event.target.checked })}
              />
              FEATURED
            </label>
          </div>

          <div style={{ display: 'grid', gap: 10, paddingTop: 10 }}>
            <LabeledInput label="IMAGE PATH / URL" value={draft.image ?? ''} onChange={(value) => update({ image: value })} disabled={fieldsDisabled} placeholder="/products/anti-anti-infra-shirt.png" />
            <div>
              <div className="mono" style={labelStyle}>UPLOAD IMAGE (PNG / JPEG / WEBP, MAX 4MB)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  ref={imageFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={fieldsDisabled || isUploading}
                  onChange={() => setUploadState(idleSaveState)}
                  style={{ ...fieldStyle(fieldsDisabled || isUploading), flex: '1 1 220px', width: 'auto' }}
                />
                <button className="btn btn-primary square" onClick={() => void uploadImage()} disabled={fieldsDisabled || isUploading}>
                  {isUploading ? 'UPLOADING' : 'UPLOAD'}
                </button>
                <ActionStatus state={uploadState} />
              </div>
            </div>
            <LabeledInput label="IMAGE PLACEHOLDER" value={draft.imagePlaceholder ?? ''} onChange={(value) => update({ imagePlaceholder: value })} disabled={fieldsDisabled} placeholder="linear-gradient(...)" />
            <LabeledInput label="TAGLINE" value={draft.tagline ?? ''} onChange={(value) => update({ tagline: value })} disabled={fieldsDisabled} placeholder="Office stock for customers" />
            <LabeledInput label="CARD BLURB" value={draft.blurb ?? ''} onChange={(value) => update({ blurb: value })} disabled={fieldsDisabled} placeholder="Short product card copy" />
            <LabeledInput label="FABRIC" value={draft.fabric ?? ''} onChange={(value) => update({ fabric: value })} disabled={fieldsDisabled} placeholder="Cotton jersey" />
            <LabeledInput label="FIT" value={draft.fit ?? ''} onChange={(value) => update({ fit: value })} disabled={fieldsDisabled} placeholder="Unisex, true to size" />
            <LabeledInput label="CORNER TAG" value={draft.cornerTag ?? ''} onChange={(value) => update({ cornerTag: value })} disabled={fieldsDisabled} placeholder="01 / TEE" />
            <LabeledInput label="TAGS" value={draft.tagsText ?? ''} onChange={(value) => update({ tagsText: value })} disabled={fieldsDisabled} placeholder="office-stock, launch" />
          </div>
        </div>

        <div>
          <div className="mono" style={{ paddingBottom: 12, fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            DETAILS / VARIANTS
          </div>
          <TextAreaInput label="DESCRIPTION" value={draft.description ?? ''} onChange={(value) => update({ description: value })} disabled={fieldsDisabled} rows={5} />
          <TextAreaInput
            label="COLORS"
            value={draft.colorsText ?? ''}
            onChange={(value) => update({ colorsText: value })}
            disabled={fieldsDisabled}
            rows={4}
            placeholder={'grey,#B8B5AE,Heather Grey\ncitrus,#FF7300,Citrus Glow'}
          />
          <LabeledInput label="SIZES" value={draft.sizesText ?? ''} onChange={(value) => update({ sizesText: value })} disabled={fieldsDisabled} placeholder="S, M, L, XL, XXL, XXXL" />
          <TextAreaInput
            label="VARIANTS"
            value={draft.variantsText ?? ''}
            onChange={(value) => update({ variantsText: value })}
            disabled={fieldsDisabled}
            rows={8}
            placeholder={'var_aai-tee-grey-s,S,grey,20\nvar_aai-tee-grey-m,M,grey,24\nvar_black-step-socks-one,,black,1'}
          />
          <div style={{ display: 'flex', gap: 8, paddingTop: 12 }}>
            <button className="btn btn-citrus square" onClick={() => void submit()} disabled={!canMutate || isSaving || !draft.name.trim() || !draft.sku.trim()}>
              {editingId ? 'SAVE PRODUCT' : 'CREATE PRODUCT'}
            </button>
            {editingId && (
              <button className="btn btn-ghost square" onClick={cancelEdit} disabled={isSaving}>
                CANCEL
              </button>
            )}
            <button className="btn btn-primary square" onClick={reset} disabled={isSaving}>
              NEW
            </button>
            <ActionStatus state={saveState} />
          </div>
        </div>
      </div>

      <HeaderGrid columns="1.4fr 0.8fr 0.7fr 0.8fr 1fr 0.6fr" labels={['PRODUCT', 'SKU', 'PRICE', 'CATEGORY', 'VARIANTS', '']} />
      {rows.length === 0 && <EmptyState label="No products yet." />}
      {rows.map((product) => (
        <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.7fr 0.8fr 1fr 0.6fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
          <div>
            <Link href={`/products/${product.slug}`} style={{ fontSize: 13, color: 'var(--ink)' }}>{product.name}</Link>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{product.type} · {product.slug}</div>
          </div>
          <span className="mono" style={{ fontSize: 11 }}>{product.sku}</span>
          <span className="mono" style={{ fontSize: 11 }}>${(product.price / 100).toFixed(2)}</span>
          <span className="mono" style={{ fontSize: 11 }}>{product.category}</span>
          <span className="mono" style={{ fontSize: 10.5 }}>{variantSummary(product)}</span>
          <button className="btn btn-primary square" onClick={() => editProduct(product)} disabled={!canMutate}>
            EDIT
          </button>
        </div>
      ))}
    </div>
  );
}

function TextAreaInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="mono" style={labelStyle}>{label}</div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        style={{ ...fieldStyle(disabled), resize: 'vertical', lineHeight: 1.5 }}
      />
    </div>
  );
}

function productToInput(product: Product): ProductUpsertInput {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    type: product.type,
    sku: product.sku,
    tagline: product.tagline,
    blurb: product.blurb,
    description: product.description,
    fabric: product.fabric,
    fit: product.fit,
    cornerTag: product.cornerTag,
    cover: product.cover,
    priceDollars: (product.price / 100).toFixed(2),
    category: product.category,
    image: product.image,
    imagePlaceholder: product.imagePlaceholder,
    colorsText: (product.colors ?? []).map((color) => [color.name, color.hex, color.label].join(',')).join('\n'),
    sizesText: (product.sizes ?? []).join(', '),
    variantsText: product.variants.map((variant) => [variant.id, variant.size ?? '', variant.color ?? '', variant.stock].join(',')).join('\n'),
    featured: product.featured,
    tagsText: product.tags.join(', '),
  };
}

function emptyProductInput(): ProductUpsertInput {
  return {
    name: '',
    type: 'Swag',
    sku: '',
    cover: 'light',
    priceDollars: '0',
    category: 'apparel',
    variantsText: '',
    featured: true,
  };
}

function variantSummary(product: Product): string {
  const sizes = product.variants
    .map((variant) => variant.size)
    .filter((size): size is ProductSize => Boolean(size));
  if (sizes.length) return Array.from(new Set(sizes)).join(' / ');
  return `${product.variants.length} one-size`;
}

function InventoryTable({
  rows,
  canMutate,
  onSave,
}: {
  rows: AdminInventoryRow[];
  canMutate: boolean;
  onSave: (row: AdminInventoryRow, stock: number, image: string) => Promise<void>;
}) {
  return (
    <div style={{ padding: '0 32px 32px' }}>
      <HeaderGrid columns="1.3fr 0.8fr 0.7fr 0.7fr 0.6fr 1.6fr 1fr" labels={['ITEM', 'SKU', 'SIZE', 'COLOR', 'QTY', 'PHOTO', '']} />
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
  onSave: (row: AdminInventoryRow, stock: number, image: string) => Promise<void>;
}) {
  const [stock, setStock] = React.useState(String(row.stock));
  const [image, setImage] = React.useState(row.image);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);
  const isSaving = saveState.status === 'saving';
  const fieldsDisabled = !canMutate || isSaving;
  const parsedStock = Number(stock);
  const stockIsValid = Number.isSafeInteger(parsedStock) && parsedStock >= 0;
  const isDirty = stock !== String(row.stock) || image !== row.image;

  const cancel = () => {
    setStock(String(row.stock));
    setImage(row.image);
    setSaveState(idleSaveState);
  };

  const save = async () => {
    if (!stockIsValid) {
      setSaveState({ status: 'error', message: 'Quantity must be a whole number at or above 0.' });
      return;
    }

    setSaveState({ status: 'saving', message: 'Saving inventory row.' });
    try {
      await onSave(row, parsedStock, image);
      setSaveState({ status: 'saved', message: 'Inventory saved.' });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.8fr 0.7fr 0.7fr 0.6fr 1.6fr 1fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
      <div>
        <Link href={`/products/${row.slug}`} style={{ fontSize: 13, color: 'var(--ink)' }}>{row.productName}</Link>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{row.type}</div>
      </div>
      <span className="mono" style={{ fontSize: 11 }}>{row.sku}</span>
      <span className="mono" style={{ fontSize: 11 }}>{row.size || 'ONE'}</span>
      <span className="mono" style={{ fontSize: 11 }}>{row.color || 'DEFAULT'}</span>
      <input value={stock} onChange={(event) => setStock(event.target.value)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
      <input value={image} onChange={(event) => setImage(event.target.value)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
      <div style={rowActionStyle}>
        <button className="btn btn-primary square" onClick={() => void save()} disabled={!canMutate || isSaving || !stockIsValid}>
          SAVE
        </button>
        {isDirty && (
          <button className="btn btn-ghost square" onClick={cancel} disabled={isSaving}>
            CANCEL
          </button>
        )}
        <ActionStatus state={saveState} />
      </div>
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
  onStatusChange: (orderId: string, status: OrderStatus, tracking: string, notes: string) => Promise<void>;
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
  onStatusChange: (orderId: string, status: OrderStatus, tracking: string, notes: string) => Promise<void>;
}) {
  const [status, setStatus] = React.useState<OrderStatus>(order.status);
  const [tracking, setTracking] = React.useState(order.tracking);
  const [notes, setNotes] = React.useState(order.notes);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);
  const isSaving = saveState.status === 'saving';
  const fieldsDisabled = !canMutate || isSaving;
  const isDirty = status !== order.status || tracking !== order.tracking || notes !== order.notes;

  const cancel = () => {
    setStatus(order.status);
    setTracking(order.tracking);
    setNotes(order.notes);
    setSaveState(idleSaveState);
  };

  const save = async () => {
    setSaveState({ status: 'saving', message: 'Saving order.' });
    try {
      await onStatusChange(order.orderId, status, tracking, notes);
      setSaveState({ status: 'saved', message: 'Order saved.' });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

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
      <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)}>
        {(STATUS_OPTIONS[order.status] ?? ['pending', 'fulfilled', 'shipped', 'cancelled']).map((option) => (
          <option key={option} value={option}>
            {option === 'cancelled' ? 'cancelled (restock + refund)' : option}
          </option>
        ))}
      </select>
      <input value={tracking} onChange={(event) => setTracking(event.target.value)} placeholder="Tracking" disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={rowActionStyle}>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
          <button className="btn btn-primary square" onClick={() => void save()} disabled={!canMutate || isSaving || !isDirty}>
            SAVE
          </button>
          {isDirty && (
            <button className="btn btn-ghost square" onClick={cancel} disabled={isSaving}>
              CANCEL
            </button>
          )}
        </div>
        <ActionStatus state={saveState} />
      </div>
    </div>
  );
}

function DiscountTable({
  rows,
  canMutate,
  onGenerate,
  onMintBatch,
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
  onMintBatch: (input: {
    prefix: string;
    label?: string;
    type: DiscountCodeType;
    amountOffCents?: number | null;
    percentOff?: number | null;
    count: number;
  }) => Promise<AdminDiscountCode[] | null>;
  onSave: (input: {
    code: string;
    label?: string;
    type: DiscountCodeType;
    amountOffCents?: number | null;
    percentOff?: number | null;
    maxRedemptions?: number | null;
    active?: boolean;
  }) => Promise<void>;
  onActiveChange: (code: string, active: boolean) => Promise<void>;
}) {
  const [code, setCode] = React.useState('');
  const [label, setLabel] = React.useState('');
  const [type, setType] = React.useState<DiscountCodeType>('amount_off');
  const [value, setValue] = React.useState('100');
  const [recipient, setRecipient] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [latestCode, setLatestCode] = React.useState<AdminDiscountCode | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [batchPrefix, setBatchPrefix] = React.useState('');
  const [batchLabel, setBatchLabel] = React.useState('');
  const [batchType, setBatchType] = React.useState<DiscountCodeType>('percent_off');
  const [batchValue, setBatchValue] = React.useState('100');
  const [batchCount, setBatchCount] = React.useState('1');
  const [latestBatch, setLatestBatch] = React.useState<AdminDiscountCode[]>([]);
  const [isMinting, setIsMinting] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);
  const isSaving = saveState.status === 'saving';
  const fieldsDisabled = !canMutate || isSaving;

  const generate = async (kind: 'sales_credit' | 'devrel_comp') => {
    setIsGenerating(true);
    setSaveState({ status: 'saving', message: 'Generating code.' });
    try {
      const generated = await onGenerate({ recipient, purpose, kind });
      if (generated) {
        setLatestCode(generated);
        setRecipient('');
        setPurpose('');
        setSaveState({ status: 'saved', message: `Generated ${generated.code}.` });
      }
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    } finally {
      setIsGenerating(false);
    }
  };

  const mintBatch = async () => {
    const numericValue = parseMoneyInput(batchValue);
    const count = Math.floor(Number(batchCount));
    if (!batchPrefix.trim()) {
      setSaveState({ status: 'error', message: 'Prefix is required.' });
      return;
    }
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setSaveState({ status: 'error', message: 'Discount value must be greater than 0.' });
      return;
    }
    if (batchType === 'percent_off' && numericValue > 100) {
      setSaveState({ status: 'error', message: 'Percent discounts must be 100 or less.' });
      return;
    }
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      setSaveState({ status: 'error', message: 'Count must be between 1 and 100.' });
      return;
    }

    setIsMinting(true);
    setSaveState({ status: 'saving', message: `Minting ${count} ${count === 1 ? 'code' : 'codes'}.` });
    try {
      const minted = await onMintBatch({
        prefix: batchPrefix,
        label: batchLabel,
        type: batchType,
        amountOffCents: batchType === 'amount_off' ? Math.round(numericValue * 100) : null,
        percentOff: batchType === 'percent_off' ? numericValue : null,
        count,
      });
      if (minted) {
        setLatestBatch(minted);
        setSaveState({ status: 'saved', message: `Minted ${minted.length} ${minted.length === 1 ? 'code' : 'codes'}.` });
      }
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    } finally {
      setIsMinting(false);
    }
  };

  const resetNewCode = () => {
    setCode('');
    setLabel('');
    setType('amount_off');
    setValue('100');
    setSaveState(idleSaveState);
  };

  const submit = async () => {
    const numericValue = parseMoneyInput(value);
    if (!code.trim()) {
      setSaveState({ status: 'error', message: 'Code is required.' });
      return;
    }
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setSaveState({ status: 'error', message: 'Discount value must be greater than 0.' });
      return;
    }
    if (type === 'percent_off' && numericValue > 100) {
      setSaveState({ status: 'error', message: 'Percent discounts must be 100 or less.' });
      return;
    }

    setSaveState({ status: 'saving', message: 'Saving code.' });
    try {
      await onSave({
        code,
        label,
        type,
        amountOffCents: type === 'amount_off' ? Math.round(numericValue * 100) : null,
        percentOff: type === 'percent_off' ? numericValue : null,
        maxRedemptions: 1,
        active: true,
      });
      setSaveState({ status: 'saved', message: `Saved ${code.toUpperCase()}.` });
      setCode('');
      setLabel('');
      setValue('100');
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
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

      <div className="mono" style={{ padding: '18px 0 0', fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        EVENT CODES
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr 0.7fr 0.6fr auto', gap: 10, padding: '18px 0', borderBottom: '1px solid var(--ink)', alignItems: 'end' }}>
        <LabeledInput label="PREFIX" value={batchPrefix} onChange={(value) => setBatchPrefix(value.toUpperCase())} disabled={!canMutate || isMinting} placeholder="AIEWF" />
        <LabeledInput label="CAMPAIGN" value={batchLabel} onChange={setBatchLabel} disabled={!canMutate || isMinting} placeholder="AI Engineer World's Fair" />
        <div>
          <div className="mono" style={labelStyle}>TYPE</div>
          <select value={batchType} onChange={(event) => setBatchType(event.target.value as DiscountCodeType)} disabled={!canMutate || isMinting} style={fieldStyle(!canMutate || isMinting)}>
            <option value="percent_off">% off</option>
            <option value="amount_off">$ off</option>
          </select>
        </div>
        <LabeledInput label={batchType === 'amount_off' ? 'DOLLARS' : 'PERCENT'} value={batchValue} onChange={setBatchValue} disabled={!canMutate || isMinting} placeholder="100" />
        <LabeledInput label="COUNT" value={batchCount} onChange={setBatchCount} disabled={!canMutate || isMinting} placeholder="12" />
        <button className="btn btn-citrus square" onClick={() => void mintBatch()} disabled={!canMutate || isMinting || !batchPrefix.trim()}>
          MINT BATCH
        </button>
      </div>

      {latestBatch.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'start' }}>
          <div>
            <div className="mono" style={labelStyle}>LATEST BATCH ({latestBatch.length})</div>
            <div className="mono" style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {latestBatch.map((row) => row.code).join('\n')}
            </div>
          </div>
          <button
            className="btn btn-primary square"
            onClick={() => void navigator.clipboard?.writeText(latestBatch.map((row) => row.code).join('\n'))}
          >
            COPY ALL
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr 0.7fr auto', gap: 10, padding: '18px 0', borderBottom: '1px solid var(--ink)', alignItems: 'end' }}>
        <LabeledInput label="CODE" value={code} onChange={(value) => setCode(value.toUpperCase())} disabled={fieldsDisabled} placeholder="SALES100" />
        <LabeledInput label="LABEL" value={label} onChange={setLabel} disabled={fieldsDisabled} placeholder="Sales credit" />
        <div>
          <div className="mono" style={labelStyle}>TYPE</div>
          <select value={type} onChange={(event) => setType(event.target.value as DiscountCodeType)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)}>
            <option value="amount_off">$ off</option>
            <option value="percent_off">% off</option>
          </select>
        </div>
        <LabeledInput label={type === 'amount_off' ? 'DOLLARS' : 'PERCENT'} value={value} onChange={setValue} disabled={fieldsDisabled} placeholder="100" />
        <div style={rowActionStyle}>
          <button className="btn btn-citrus square" onClick={() => void submit()} disabled={!canMutate || isSaving || !code.trim()}>
            ADD SINGLE-USE CODE
          </button>
          {(code || label || value !== '100' || type !== 'amount_off') && (
            <button className="btn btn-ghost square" onClick={resetNewCode} disabled={isSaving}>
              CANCEL
            </button>
          )}
          <ActionStatus state={saveState} />
        </div>
      </div>

      <HeaderGrid columns="1fr 1.2fr 0.7fr 0.6fr 0.7fr 1fr 0.7fr 0.8fr" labels={['CODE', 'LABEL', 'VALUE', 'USES', 'STATUS', 'CREATED BY', 'UPDATED', '']} />
      {rows.length === 0 && <EmptyState label="No discount codes yet." />}
      {rows.map((row) => (
        <DiscountRow
          key={row.code}
          row={row}
          canMutate={canMutate}
          onSave={onSave}
          onActiveChange={onActiveChange}
        />
      ))}
    </div>
  );
}

function DiscountRow({
  row,
  canMutate,
  onSave,
  onActiveChange,
}: {
  row: AdminDiscountCode;
  canMutate: boolean;
  onSave: (input: {
    code: string;
    label?: string;
    type: DiscountCodeType;
    amountOffCents?: number | null;
    percentOff?: number | null;
    maxRedemptions?: number | null;
    active?: boolean;
  }) => Promise<void>;
  onActiveChange: (code: string, active: boolean) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [label, setLabel] = React.useState(row.label);
  const [type, setType] = React.useState<DiscountCodeType>(row.type);
  const [value, setValue] = React.useState(discountValue(row));
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);
  const isSaving = saveState.status === 'saving';
  const fieldsDisabled = !canMutate || isSaving || !isEditing;
  const isDirty = label !== row.label || type !== row.type || value !== discountValue(row);

  const cancel = () => {
    setLabel(row.label);
    setType(row.type);
    setValue(discountValue(row));
    setIsEditing(false);
    setSaveState(idleSaveState);
  };

  const save = async () => {
    const numericValue = parseMoneyInput(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setSaveState({ status: 'error', message: 'Discount value must be greater than 0.' });
      return;
    }
    if (type === 'percent_off' && numericValue > 100) {
      setSaveState({ status: 'error', message: 'Percent discounts must be 100 or less.' });
      return;
    }

    setSaveState({ status: 'saving', message: 'Saving discount.' });
    try {
      await onSave({
        code: row.code,
        label,
        type,
        amountOffCents: type === 'amount_off' ? Math.round(numericValue * 100) : null,
        percentOff: type === 'percent_off' ? numericValue : null,
        maxRedemptions: 1,
        active: row.active,
      });
      setIsEditing(false);
      setSaveState({ status: 'saved', message: 'Discount saved.' });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

  const toggleActive = async () => {
    setSaveState({ status: 'saving', message: row.active ? 'Pausing code.' : 'Enabling code.' });
    try {
      await onActiveChange(row.code, !row.active);
      setSaveState({ status: 'saved', message: row.active ? 'Code paused.' : 'Code enabled.' });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 0.7fr 0.6fr 0.7fr 1fr 0.7fr 0.8fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
      <span className="mono" style={isEditing ? readonlyTextStyle : { fontSize: 11 }}>{row.code}</span>
      {isEditing ? (
        <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
      ) : (
        <span style={{ fontSize: 12 }}>{row.label || '-'}</span>
      )}
      {isEditing ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <select value={type} onChange={(event) => setType(event.target.value as DiscountCodeType)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)}>
            <option value="amount_off">$ off</option>
            <option value="percent_off">% off</option>
          </select>
          <input value={value} onChange={(event) => setValue(event.target.value)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
        </div>
      ) : (
        <span className="mono" style={{ fontSize: 11 }}>
          {row.type === 'amount_off'
            ? `$${((row.amountOffCents ?? 0) / 100).toFixed(2)}`
            : `${row.percentOff ?? 0}%`}
        </span>
      )}
      <span className="mono" style={{ fontSize: 11 }}>
        {row.timesRedeemed}{row.maxRedemptions === null ? '' : ` / ${row.maxRedemptions}`}
      </span>
      <span className="mono" style={{ fontSize: 11 }}>{row.active ? 'active' : 'inactive'}</span>
      <span className="mono" style={{ fontSize: 10.5, overflowWrap: 'anywhere' }}>{row.createdBy || '-'}</span>
      <span className="mono" style={{ fontSize: 10.5 }}>{new Date(row.updatedAt).toLocaleDateString()}</span>
      <div style={rowActionStyle}>
        {isEditing ? (
          <>
            <button className="btn btn-citrus square" onClick={() => void save()} disabled={!canMutate || isSaving || !isDirty}>
              SAVE
            </button>
            <button className="btn btn-ghost square" onClick={cancel} disabled={isSaving}>
              CANCEL
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary square" onClick={() => setIsEditing(true)} disabled={!canMutate || isSaving}>
              EDIT
            </button>
            <button className="btn btn-primary square" onClick={() => void toggleActive()} disabled={!canMutate || isSaving}>
              {row.active ? 'PAUSE' : 'ENABLE'}
            </button>
          </>
        )}
        <ActionStatus state={saveState} />
      </div>
    </div>
  );
}

function ApiTokenTable({
  rows,
  adminEmail,
  canMutate,
  onGenerate,
  onRevoke,
  onUpdate,
}: {
  rows: AdminApiToken[];
  adminEmail: string;
  canMutate: boolean;
  onGenerate: (input: { name: string; actorEmail?: string }) => Promise<GeneratedApiToken | null>;
  onRevoke: (id: number) => Promise<void>;
  onUpdate: (input: { id: number; name: string; actorEmail: string }) => Promise<void>;
}) {
  const [name, setName] = React.useState('');
  const [actorEmail, setActorEmail] = React.useState(adminEmail);
  const [latestToken, setLatestToken] = React.useState<GeneratedApiToken | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);

  const generate = async () => {
    if (!name.trim()) {
      setSaveState({ status: 'error', message: 'Token name is required.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail.trim())) {
      setSaveState({ status: 'error', message: 'Actor email must be a valid email address.' });
      return;
    }

    setIsGenerating(true);
    setSaveState({ status: 'saving', message: 'Generating token.' });
    try {
      const generated = await onGenerate({ name, actorEmail });
      if (generated) {
        setLatestToken(generated);
        setName('');
        setSaveState({ status: 'saved', message: `Generated ${generated.apiToken.name}.` });
      }
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
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
        <div style={rowActionStyle}>
          <button className="btn btn-citrus square" onClick={() => void generate()} disabled={!canMutate || isGenerating || !name.trim()}>
            GENERATE TOKEN
          </button>
          {(name || actorEmail !== adminEmail) && (
            <button
              className="btn btn-ghost square"
              onClick={() => {
                setName('');
                setActorEmail(adminEmail);
                setSaveState(idleSaveState);
              }}
              disabled={isGenerating}
            >
              CANCEL
            </button>
          )}
          <ActionStatus state={saveState} />
        </div>
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
        <ApiTokenRow
          key={row.id}
          row={row}
          canMutate={canMutate}
          onRevoke={onRevoke}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

function ApiTokenRow({
  row,
  canMutate,
  onRevoke,
  onUpdate,
}: {
  row: AdminApiToken;
  canMutate: boolean;
  onRevoke: (id: number) => Promise<void>;
  onUpdate: (input: { id: number; name: string; actorEmail: string }) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [name, setName] = React.useState(row.name);
  const [actorEmail, setActorEmail] = React.useState(row.actorEmail);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);
  const isSaving = saveState.status === 'saving';
  const fieldsDisabled = !canMutate || isSaving || !isEditing || !row.active;
  const isDirty = name !== row.name || actorEmail !== row.actorEmail;

  const cancel = () => {
    setName(row.name);
    setActorEmail(row.actorEmail);
    setIsEditing(false);
    setSaveState(idleSaveState);
  };

  const save = async () => {
    if (!name.trim()) {
      setSaveState({ status: 'error', message: 'Token name is required.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail.trim())) {
      setSaveState({ status: 'error', message: 'Actor email must be a valid email address.' });
      return;
    }

    setSaveState({ status: 'saving', message: 'Saving token.' });
    try {
      await onUpdate({ id: row.id, name, actorEmail });
      setIsEditing(false);
      setSaveState({ status: 'saved', message: 'Token saved.' });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

  const revoke = async () => {
    setSaveState({ status: 'saving', message: 'Revoking token.' });
    try {
      await onRevoke(row.id);
      setIsEditing(false);
      setSaveState({ status: 'saved', message: 'Token revoked.' });
    } catch (err) {
      setSaveState({ status: 'error', message: messageFromError(err) });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 1.2fr 0.8fr 0.8fr 1fr 0.7fr', gap: 12, padding: '14px 0', borderBottom: '1px solid var(--rule-soft)', alignItems: 'center' }}>
      {isEditing ? (
        <input value={name} onChange={(event) => setName(event.target.value)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
      ) : (
        <span style={{ fontSize: 12 }}>{row.name}</span>
      )}
      <span className="mono" style={isEditing ? readonlyTextStyle : { fontSize: 11 }}>{row.tokenPrefix}</span>
      {isEditing ? (
        <input value={actorEmail} onChange={(event) => setActorEmail(event.target.value)} disabled={fieldsDisabled} style={fieldStyle(fieldsDisabled)} />
      ) : (
        <span className="mono" style={{ fontSize: 10.5 }}>{row.actorEmail}</span>
      )}
      <span className="mono" style={{ fontSize: 11 }}>{row.active ? 'active' : 'revoked'}</span>
      <span className="mono" style={{ fontSize: 10.5 }}>{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : '-'}</span>
      <span className="mono" style={{ fontSize: 10.5 }}>
        {new Date(row.createdAt).toLocaleDateString()} · {row.createdBy || '-'}
      </span>
      <div style={rowActionStyle}>
        {isEditing ? (
          <>
            <button className="btn btn-citrus square" onClick={() => void save()} disabled={!canMutate || isSaving || !isDirty || !row.active}>
              SAVE
            </button>
            <button className="btn btn-ghost square" onClick={cancel} disabled={isSaving}>
              CANCEL
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-primary square" onClick={() => setIsEditing(true)} disabled={!canMutate || isSaving || !row.active}>
              EDIT
            </button>
            <button className="btn btn-primary square" onClick={() => void revoke()} disabled={!canMutate || isSaving || !row.active}>
              REVOKE
            </button>
          </>
        )}
        <ActionStatus state={saveState} />
      </div>
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

function DocumentImportPanel({
  canMutate,
  isPending,
  onRequested,
  onStatus,
}: {
  canMutate: boolean;
  isPending: boolean;
  onRequested: () => void;
  onStatus: (status: string) => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [sourceName, setSourceName] = React.useState('');
  const [text, setText] = React.useState('');
  const [isUploading, setIsUploading] = React.useState(false);
  const [fileInputKey, setFileInputKey] = React.useState(0);
  const [saveState, setSaveState] = React.useState<SaveState>(idleSaveState);

  const reset = () => {
    setFile(null);
    setSourceName('');
    setText('');
    setFileInputKey((key) => key + 1);
    setSaveState(idleSaveState);
  };

  const submit = async () => {
    if (!canMutate) {
      onStatus('set DATABASE_URL to import documents');
      setSaveState({ status: 'error', message: 'Connect a database before importing.' });
      return;
    }

    if (!file && !text.trim()) {
      onStatus('choose a file or paste inventory rows');
      setSaveState({ status: 'error', message: 'Choose a file or paste inventory rows.' });
      return;
    }

    setIsUploading(true);
    onStatus('uploading inventory document');
    setSaveState({ status: 'saving', message: 'Requesting import.' });
    try {
      const formData = new FormData();
      if (file) formData.set('file', file);
      if (sourceName.trim()) formData.set('sourceName', sourceName.trim());
      if (text.trim()) formData.set('text', text.trim());

      const res = await fetch('/api/admin/inventory/import', {
        method: 'POST',
        body: formData,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not request document import');

      reset();
      setSaveState({ status: 'saved', message: 'Document import requested.' });
      onRequested();
    } catch (err) {
      const message = messageFromError(err);
      onStatus(message);
      setSaveState({ status: 'error', message });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ padding: '18px 32px 0' }}>
      <div className="mono" style={{ paddingBottom: 12, fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        LLM REVIEWED DOCUMENT IMPORT
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, paddingBottom: 18, borderBottom: '1px solid var(--ink)', alignItems: 'end' }}>
        <div>
          <div className="mono" style={labelStyle}>CSV / TEXT FILE</div>
          <input
            key={fileInputKey}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            disabled={!canMutate || isUploading || isPending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            style={fieldStyle(!canMutate || isUploading || isPending)}
          />
        </div>
        <LabeledInput
          label="SOURCE NAME"
          value={sourceName}
          onChange={setSourceName}
          disabled={!canMutate || isUploading || isPending}
          placeholder="Swag inventory export"
        />
        <div style={rowActionStyle}>
          <button className="btn btn-citrus square" onClick={() => void submit()} disabled={!canMutate || isUploading || isPending}>
            {isUploading ? 'REQUESTING' : 'IMPORT DOC'}
          </button>
          {(file || sourceName || text) && (
            <button className="btn btn-ghost square" onClick={reset} disabled={isUploading}>
              CANCEL
            </button>
          )}
          <ActionStatus state={saveState} />
        </div>
      </div>
      <div style={{ padding: '12px 0 18px', borderBottom: '1px solid var(--rule-soft)' }}>
        <div className="mono" style={labelStyle}>PASTE ROWS</div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!canMutate || isUploading || isPending}
          placeholder={'item,one,S,M,L,XL,XXL,XXXL\nAnti Anti Infra Co.,,20,24,21,23,11,7\nAnti Anti Infra Co. Hoodie,,8,14,16,11,5,\nBlack Step.run Socks,1,,,,,,\nCream Step.run Socks,1,,,,,,\nInsulated Coffee Mug 12 oz,13,,,,,,\nBaseball Cap,15,,,,,,'}
          rows={4}
          style={{ ...fieldStyle(!canMutate || isUploading || isPending), resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>
    </div>
  );
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

function ActionStatus({ state }: { state: SaveState }) {
  if (state.status === 'idle') return null;

  const color =
    state.status === 'error'
      ? 'var(--citrus)'
      : state.status === 'saved'
        ? 'var(--matcha)'
        : 'var(--muted)';

  return (
    <div
      className="mono"
      role={state.status === 'error' ? 'alert' : 'status'}
      style={{
        fontSize: 10.5,
        lineHeight: 1.45,
        color,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {state.message ?? state.status}
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
        style={fieldStyle(disabled)}
      />
    </div>
  );
}

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseMoneyInput(value: string): number {
  return Number(String(value).replace(/[$,\s]/g, ''));
}

function discountValue(row: AdminDiscountCode): string {
  return row.type === 'amount_off'
    ? ((row.amountOffCents ?? 0) / 100).toFixed(2)
    : String(row.percentOff ?? 0);
}

function fieldStyle(disabled?: boolean): React.CSSProperties {
  if (!disabled) return inputStyle;

  return {
    ...inputStyle,
    background: 'var(--bone)',
    color: 'var(--muted)',
    border: '1px solid var(--rule-soft)',
    cursor: 'not-allowed',
  };
}

const readonlyTextStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 34,
  width: '100%',
  minWidth: 0,
  border: '1px solid var(--rule-soft)',
  background: 'var(--bone)',
  color: 'var(--muted)',
  padding: '8px 10px',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
};

const rowActionStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
};

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
