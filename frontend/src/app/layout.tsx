import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ModeProvider } from "@/context/ModeContext";
import AppLayout from "@/components/layout/AppLayout";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WhatsApp Bot Platform",
  description: "A scalable production WhatsApp bot platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 h-screen flex overflow-hidden`}>
        <AuthProvider>
          <ModeProvider>
            <AppLayout>
              {children}
            </AppLayout>
          </ModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
