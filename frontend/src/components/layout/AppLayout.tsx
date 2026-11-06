"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useAuth } from "@/context/AuthContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Pages that don't need the sidebar and header (auth pages)
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>;
  }

  if (isAuthPage) {
    return <>{children}</>;
  }

  // If not auth page and no user, we render nothing because AuthContext will redirect
  if (!user) return null;

  return (
    <>
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
