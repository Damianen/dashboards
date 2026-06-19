import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AppShell } from "@/components/app-shell/app-shell";
import { MotionProvider } from "@/components/providers/motion-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

// Follows the OS color scheme before hydration, so there is no light flash on
// dark devices. No toggle UI — system preference is the single source.
const darkModeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var apply=function(){document.documentElement.classList.toggle('dark',m.matches);};apply();m.addEventListener('change',apply);}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tasks",
  description: "Single-user task manager",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tasks",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  // Lets the layout extend under notches/home bars; safe-area-inset
  // padding in the shell keeps content out of them.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkModeScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">
        <QueryProvider>
          <MotionProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </MotionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
