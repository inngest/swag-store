import { SignUp } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default function SignUpPage() {
  return (
    <div style={{ minHeight: 620, display: 'grid', placeItems: 'center', padding: 32 }}>
      <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/admin" signInUrl="/sign-in" />
    </div>
  );
}
