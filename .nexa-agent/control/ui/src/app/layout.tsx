import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Bot, LayoutDashboard, MessageSquare } from "lucide-react";

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

        {/*
          Chat is the primary tab, not "new task". The raw create form is still
          reachable at /new, but it is the lever that turned a greeting into a
          git branch -- the conversation is the safe way in.
        */}
        <nav className="fixed bottom-0 left-0 w-full glass-panel border-t border-app-border z-50">
          <div className="flex items-center justify-around p-3 max-w-md mx-auto">
            <Link href="/" className="flex flex-col items-center gap-1 text-app-text-muted hover:text-app-text transition-colors">
              <MessageSquare className="size-6" />
              <span className="text-xs font-medium">Chat</span>
            </Link>
            <Link href="/tasks" className="flex flex-col items-center gap-1 text-app-text-muted hover:text-app-text transition-colors">
              <LayoutDashboard className="size-6" />
              <span className="text-xs font-medium">Tasks</span>
            </Link>
          </div>
        </nav>
      </body>
    </html>
  );
}
