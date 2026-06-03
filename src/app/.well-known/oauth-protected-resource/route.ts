import { NextRequest, NextResponse } from 'next/server';
import { protectedResourceMetadata } from '@/lib/auth-md';

export async function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req.nextUrl.origin), {
    headers: {
      'cache-control': 'public, max-age=300',
    },
  });
}

