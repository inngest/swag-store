export async function GET() {
  return Response.json({
    ok: true,
    service: 'swag-store',
    checkedAt: new Date().toISOString(),
  });
}
