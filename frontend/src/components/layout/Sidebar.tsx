"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode } from "@/context/ModeContext";

export default function Sidebar() {
  const pathname = usePathname();
  const { mode, setMode } = useMode();

  return (
    <aside className="w-64 border-r border-wa-teal-light bg-wa-teal hidden md:flex flex-col h-full shrink-0 text-white">
      <div className="p-6">
        <h1 className="text-xl font-semibold tracking-tight text-white">WhatsApp Bot</h1>
      </div>
      
      <div className="px-4 mb-6">
        <div className="flex bg-wa-teal-light p-1 rounded-lg">
          <button
            onClick={() => setMode("personal")}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              mode === "personal" ? "bg-white text-wa-teal shadow-sm" : "text-teal-100 hover:text-white"
            }`}
          >
            Personal
          </button>
          <button
            onClick={() => setMode("professional")}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              mode === "professional" ? "bg-white text-wa-teal shadow-sm" : "text-teal-100 hover:text-white"
            }`}
          >
            Professional
          </button>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        <Link href="/" className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${pathname === "/" ? "bg-wa-teal-light text-white" : "text-teal-100 hover:bg-wa-teal-light hover:text-white"}`}>
          Dashboard
        </Link>
        <Link href="/campaigns" className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${pathname.startsWith("/campaigns") ? "bg-wa-teal-light text-white" : "text-teal-100 hover:bg-wa-teal-light hover:text-white"}`}>
          Campaigns
        </Link>
        <Link href="/recipients" className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${pathname.startsWith("/recipients") ? "bg-wa-teal-light text-white" : "text-teal-100 hover:bg-wa-teal-light hover:text-white"}`}>
          Recipients
        </Link>
        <Link href="/templates" className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md hidden md:flex ${pathname.startsWith("/templates") ? "bg-wa-teal-light text-white" : "text-teal-100 hover:bg-wa-teal-light hover:text-white"}`}>
          Templates
        </Link>
        <Link href="/reports" className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${pathname.startsWith("/reports") ? "bg-wa-teal-light text-white" : "text-teal-100 hover:bg-wa-teal-light hover:text-white"}`}>
          Reports
        </Link>
        <Link href="/settings" className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${pathname.startsWith("/settings") ? "bg-wa-teal-light text-white" : "text-teal-100 hover:bg-wa-teal-light hover:text-white"}`}>
          Settings
        </Link>
      </nav>

      <div className="p-4 border-t border-wa-teal-light">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-wa-green flex items-center justify-center text-white font-bold">
            U
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Current User</p>
            <p className="text-xs font-medium text-teal-100 capitalize">{mode.toLowerCase()} Mode</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
