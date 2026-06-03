import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/inngest/client';
import { requireAdmin } from '@/lib/admin-auth';
import { isStoreDatabaseEnabled } from '@/lib/store-db';

export const runtime = 'nodejs';

const MAX_IMPORT_BYTES = 256_000;

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (!isStoreDatabaseEnabled()) {
      return NextResponse.json({ error: 'DATABASE_URL is required for inventory imports.' }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const pastedText = String(formData.get('text') ?? '').trim();
    const sourceName = String(formData.get('sourceName') ?? '').trim();

    let documentText = pastedText;
    let filename = sourceName || 'pasted-inventory';
    let contentType = 'text/plain';

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMPORT_BYTES) {
        return NextResponse.json({ error: 'Inventory import files must be 256KB or smaller.' }, { status: 413 });
      }
      documentText = await file.text();
      filename = sourceName || file.name || 'uploaded-inventory';
      contentType = file.type || 'text/plain';
    }

    if (!documentText.trim()) {
      return NextResponse.json({ error: 'Upload a CSV/text file or paste inventory rows.' }, { status: 400 });
    }

    const eventId = createHash('sha256')
      .update(`${admin.email}:${filename}:${documentText}`)
      .digest('hex')
      .slice(0, 32);

    await inngest.send({
      id: `inventory-document-import-${eventId}`,
      name: 'admin/inventory.document_import.requested',
      data: {
        actorEmail: admin.email,
        sourceName: filename,
        contentType,
        documentText: documentText.slice(0, MAX_IMPORT_BYTES),
      },
    });

    return NextResponse.json({ ok: true, sourceName: filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not request inventory import';
    const status = message.includes('Admin access') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
