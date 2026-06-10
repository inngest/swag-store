import { NextRequest, NextResponse } from 'next/server';
import { getProductImage } from '@/lib/product-images';

// Public storefront image serving. Ids are unique per upload, so responses are
// immutable and cache busting happens automatically when an image changes.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let image;
  try {
    image = await getProductImage(id);
  } catch {
    return NextResponse.json({ error: 'Image lookup failed.' }, { status: 503 });
  }

  if (!image) {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      'Content-Type': image.contentType,
      'Content-Length': String(image.bytes.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
