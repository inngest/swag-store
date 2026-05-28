import { SignIn } from '@clerk/nextjs';

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <div style={{ minHeight: 620, display: 'grid', placeItems: 'center', padding: 32 }}>
      <SignIn routing="path" path="/sign-in" fallbackRedirectUrl="/admin" signUpUrl="/sign-up" />
    </div>
  );
}
