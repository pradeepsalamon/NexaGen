import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Bot, PlusCircle, LayoutDashboard } from "lucide-react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexa Agent UI",
  description: "Mobile-first orchestrator control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <header className="sticky top-0 z-50 glass-panel border-b border-app-border">
          <div className="flex items-center justify-between p-4 max-w-md mx-auto w-full">
            <Link href="/" className="flex items-center gap-2 text-app-text font-semibold text-lg hover:text-app-primary transition-colors">
              <Bot className="text-app-primary size-6" />
              <span>Nexa Agent Control</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 flex flex-col w-full max-w-md mx-auto p-4 pb-24">
          {children}
        </main>

        <nav className="fixed bottom-0 left-0 w-full glass-panel border-t border-app-border z-50">
          <div className="flex items-center justify-around p-3 max-w-md mx-auto">
            <Link href="/" className="flex flex-col items-center gap-1 text-app-text-muted hover:text-app-text transition-colors">
              <LayoutDashboard className="size-6" />
              <span className="text-xs font-medium">Tasks</span>
            </Link>
            <Link href="/new" className="flex flex-col items-center gap-1 text-app-text-muted hover:text-app-text transition-colors">
              <div className="bg-app-primary text-white p-2 rounded-full shadow-lg shadow-app-primary/30 -mt-6 border-4 border-app-bg">
                <PlusCircle className="size-6" />
              </div>
              <span className="text-xs font-medium">New</span>
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
