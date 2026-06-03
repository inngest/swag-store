import { NextRequest, NextResponse } from 'next/server';
import { authorizationServerMetadata } from '@/lib/auth-md';

export async function GET(req: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(req.nextUrl.origin), {
    headers: {
      'cache-control': 'public, max-age=300',
    },
  });
}

