"use client";
/** components/LessonSync.tsx — once per sign-in, brings Lab and Academy progress in step with the account (lib/lesson-sync.ts). */
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { syncLessons } from "@/lib/lesson-sync";

export default function LessonSync() {
  const { user } = useAuth();
  const id = user?.id;
  useEffect(() => { if (id) void syncLessons(id); }, [id]);
  return null;
}
