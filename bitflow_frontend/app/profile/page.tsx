"use client";

import { useEffect, useState } from "react";
import AuthGate from "@/components/AuthGate";
import ProfileView from "@/components/ProfileView";
import type { ProfileData } from "@/lib/profile";

function ProfileContent() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((json) => setData(json?.user ? json : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-void text-bright flex items-center justify-center">
        <span className="text-ghost text-sm">
          <span className="text-phosphor">►</span> loading profile
          <span className="animate-blink">_</span>
        </span>
      </div>
    );
  }
  return <ProfileView data={data} own />;
}

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileContent />
    </AuthGate>
  );
}
