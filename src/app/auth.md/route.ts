import { NextRequest, NextResponse } from 'next/server';
import { renderAuthMd } from '@/lib/auth-md';

export async function GET(req: NextRequest) {
  return new NextResponse(renderAuthMd(req.nextUrl.origin), {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

