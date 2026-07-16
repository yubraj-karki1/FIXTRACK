import { Suspense } from 'react';
import { UpdateExpiredPasswordPage } from '@/components/auth';

export default function Page() {
  return (
    <Suspense>
      <UpdateExpiredPasswordPage />
    </Suspense>
  );
}
