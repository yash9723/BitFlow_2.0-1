/** GET /api/layout/<id>/files/<name> — a finished job's layout picture (.webp) or GDS, streamed from the service. */
import { NextResponse } from "next/server";
import { LAYOUT_FILES, isJobId, layoutFetch } from "@/lib/layout";
import { getSessionUser, signInRequired } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string; name: string } }) {
  const user = await getSessionUser();
  if (!user) return signInRequired();
  if (!isJobId(params.id) || !(LAYOUT_FILES as readonly string[]).includes(params.name)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const res = await layoutFetch(`/jobs/${params.id}/files/${params.name}`, user.id);
    if (!res.ok || !res.body) return NextResponse.json({ error: "Not found." }, { status: res.status === 200 ? 404 : res.status });
    const gds = params.name.endsWith(".gds");
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": gds ? "application/octet-stream" : "image/webp",
        "Cache-Control": "private, max-age=86400, immutable",   // a job id is a hash of its inputs: the file never changes
        ...(gds ? { "Content-Disposition": `attachment; filename="${params.id.slice(0, 8)}.gds"` } : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "The layout service didn't answer." }, { status: 502 });
  }
}
