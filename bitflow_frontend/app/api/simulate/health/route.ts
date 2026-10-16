import { NextResponse } from "next/server";
import { backendUrl } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${backendUrl()}/health`, { cache: "no-store" });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { status: "unreachable", error: text.trim() || res.statusText };
    }
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { status: "unreachable", error: err?.message },
      { status: 502 }
    );
  }
}
