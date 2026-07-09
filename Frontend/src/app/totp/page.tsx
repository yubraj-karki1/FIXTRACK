import { Suspense } from 'react';
import { TotpLoginPage } from '@/components/FixTrackScreens';

export default function Page() {
  return (
    <Suspense>
      <TotpLoginPage />
    </Suspense>
  );
}
