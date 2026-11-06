"use client";

import { useAuth } from "@/context/AuthContext";
import { useMode } from "@/context/ModeContext";

export default function Header() {
  const { user, logout } = useAuth();
  const { mode, setMode } = useMode();
  
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="md:hidden">
        <h1 className="text-lg font-semibold text-gray-900">WhatsApp Bot</h1>
      </div>
      
      <div className="flex-1 flex justify-end items-center gap-4">
        {/* Mode Switcher */}
        <div className="flex items-center bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setMode("personal")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mode === "personal" 
                ? "bg-white shadow-sm text-gray-900" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Personal
          </button>
          <button 
            onClick={() => setMode("professional")}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mode === "professional" 
                ? "bg-wa-green shadow-sm text-white" 
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            Professional
          </button>
        </div>
        
        {/* Profile / Logout */}
        <div className="flex items-center border-l pl-4 ml-2">
          <span className="text-sm text-gray-700 mr-4">{user?.email}</span>
          <button onClick={logout} className="text-sm text-red-600 hover:text-red-800">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
