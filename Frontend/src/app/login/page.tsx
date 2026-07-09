import { Suspense } from 'react';
import { LoginPage } from '@/components/FixTrackScreens';

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
