import type { Metadata } from 'next';
import { FixTrackProvider } from '@/context/FixTrackContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'FixTrack - Hostel Maintenance Reporting',
  description: 'Hostel maintenance reporting and management system'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <FixTrackProvider>{children}</FixTrackProvider>
      </body>
    </html>
  );
}
