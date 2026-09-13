import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import GlobalAnnouncementBanner from '@/components/chat/GlobalAnnouncementBanner';
import AutoPWAInstallPrompt from '@/components/chat/AutoPWAInstallPrompt';

const inter = Inter({ subsets: ['latin'] });

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
  themeColor: '#07080b',
};

export const metadata: Metadata = {
  title: 'Onyx - Fast. Private. Borderless.',
  description: 'Onyx — Ultra-premium, dark-mode real-time communication platform engineered by Hammad. Featuring instant messaging, voice notes, code blocks, and granular privacy.',
  keywords: ['onyx', 'chat', 'realtime', 'nextjs', 'supabase', 'messenger', 'private-chat', 'hammad'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Onyx',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full w-full overflow-hidden">
      <body className={`${inter.className} fixed inset-0 w-full h-full h-[100dvh] bg-[#07080b] text-slate-100 antialiased selection:bg-brand-500 selection:text-white flex flex-col overflow-hidden`}>
        <GlobalAnnouncementBanner />
        <AutoPWAInstallPrompt />
        <div className="flex-1 min-h-0 w-full h-full flex flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
