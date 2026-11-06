"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type MessagingMode = "personal" | "professional";

interface ModeContextType {
  mode: MessagingMode;
  setMode: (mode: MessagingMode) => void;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<MessagingMode>("personal");

  // Load from local storage initially
  useEffect(() => {
    const savedMode = localStorage.getItem("messaging_mode") as MessagingMode;
    if (savedMode === "personal" || savedMode === "professional") {
      setMode(savedMode);
    }
  }, []);

  const handleSetMode = (newMode: MessagingMode) => {
    setMode(newMode);
    localStorage.setItem("messaging_mode", newMode);
  };

  return (
    <ModeContext.Provider value={{ mode, setMode: handleSetMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export const useMode = () => {
  const context = useContext(ModeContext);
  if (context === undefined) {
    throw new Error("useMode must be used within a ModeProvider");
  }
  return context;
};
