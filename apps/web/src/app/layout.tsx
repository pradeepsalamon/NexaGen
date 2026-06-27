import type { Metadata } from "next";
import { AppProviders } from "../providers/AppProviders";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "NexaGen Chess",
  description: "Online Chess Learning Management System"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
