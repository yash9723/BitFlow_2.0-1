"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface UserProfile {
  id: string;
  username: string;
  role: "STUDENT" | "ADMIN";
  createdAt: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (username: string, password: string, role: "STUDENT" | "ADMIN") => Promise<{ error?: string }>;
  register: (username: string, password: string, role: "STUDENT" | "ADMIN", secretPassword?: string,
             botFields?: { formToken: string; website: string }) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to check auth session:", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Auth Guard / Redirection logic
// Auth Guard / Redirection logic
// Auth Guard / Redirection logic


  const login = async (username: string, password: string, role: "STUDENT" | "ADMIN") => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        router.push("/");
        return {};
      } else {
        return { error: data.error || "Login failed" };
      }
    } catch (err) {
      return { error: "An unexpected network error occurred." };
    }
  };

  const register = async (
    username: string,
    password: string,
    role: "STUDENT" | "ADMIN",
    secretPassword?: string,
    botFields?: { formToken: string; website: string }
  ) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role, secretPassword, ...botFields }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        router.push("/");
        return {};
      } else {
        return { error: data.error || "Registration failed" };
      }
    } catch (err) {
      return { error: "An unexpected network error occurred." };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      router.push("/login");
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
