"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface User {
  id: string;
  email: string;
  org_id: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Attempt to fetch current user
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setLoading(false);
        if (pathname !== "/login" && pathname !== "/register") {
          router.push("/login");
        }
        return;
      }
      
      try {
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else if (res.status === 401) {
          // Attempt refresh
          const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
          if (refreshRes.ok) {
            const data = await refreshRes.json();
            localStorage.setItem("token", data.access_token);
            // Retry fetch
            const retryRes = await fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${data.access_token}` }
            });
            if (retryRes.ok) {
              setUser(await retryRes.json());
            } else {
              throw new Error("Retry failed");
            }
          } else {
            throw new Error("Refresh failed");
          }
        } else {
          throw new Error("Fetch failed");
        }
      } catch (err) {
        console.error("Auth error:", err);
        localStorage.removeItem("token");
        setUser(null);
        if (pathname !== "/login" && pathname !== "/register") {
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchUser();
  }, [pathname, router]);

  const login = (token: string, userData: User) => {
    localStorage.setItem("token", token);
    setUser(userData);
    router.push("/");
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {
      // Ignored
    }
    localStorage.removeItem("token");
    setUser(null);
    router.push("/login");
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
