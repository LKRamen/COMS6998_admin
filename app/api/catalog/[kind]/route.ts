import { NextResponse } from "next/server";
import { adminSession, AccessError } from "../../../../lib/auth";
import { isSameOriginRequest } from "../../../../lib/request-origin";
import { parseCatalogInput } from "../../../../lib/catalog";
import { isUuid } from "../../../../lib/caption-input";
export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> },
) {
  try {
    const { client } = await adminSession();
    if (!isSameOriginRequest(request))
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const raw = await request.text();
    if (raw.length > 100000)
      return NextResponse.json(
        { error: "Record is too large." },
        { status: 413 },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const { kind } = await context.params;
    let data;
    try {
      data = parseCatalogInput(kind, body.action, body.data);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid record." },
        { status: 400 },
      );
    }
    if (
      body.action !== "create" &&
      (!isUuid(body.id) || !Number.isInteger(body.version) || body.version < 1)
    )
      return NextResponse.json(
        { error: "Reload this record before saving." },
        { status: 400 },
      );
    if (body.action === "delete" && body.confirm !== "DELETE")
      return NextResponse.json(
        { error: "Type DELETE to confirm." },
        { status: 400 },
      );
    const { error } = await client.rpc("admin_catalog_write", {
      p_kind: kind,
      p_action: body.action,
      p_id: body.action === "create" ? null : body.id,
      p_data: data,
      p_version: body.action === "create" ? null : body.version,
    });
    if (error) {
      const messages: Record<string, string> = {
        "40001": "This record changed in another tab. Reload before saving.",
        "23505": "A record with this value already exists.",
        "23503":
          "This record references a missing record, or is still in use. Check its related records.",
        "23514": "One or more values are invalid. Check the fields.",
        "23502": "Complete all required fields.",
        P0002: "This record no longer exists. Reload the page.",
        "42501": "Your admin access is no longer valid. Sign in again.",
      };
      return NextResponse.json(
        {
          error:
            messages[error.code] ??
            "The change could not be saved. Please retry.",
        },
        { status: error.code === "42501" ? 403 : 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof AccessError
            ? e.message
            : "The change could not be saved. Please retry.",
      },
      { status: e instanceof AccessError ? e.status : 500 },
    );
  }
}
