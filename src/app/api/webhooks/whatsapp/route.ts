import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { storeInboundMessage } from "@/lib/inbound";
import { parseWebhook } from "@/lib/whatsapp";

// Meta calls this once with hub.* params to verify the webhook URL.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const token = params.get("hub.verify_token");
  if (params.get("hub.mode") !== "subscribe" || !token) return new NextResponse("forbidden", { status: 403 });
  const channel = await db.channel.findFirst({ where: { verifyToken: token } });
  if (!channel) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret && !validSignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
  for (const message of parseWebhook(payload)) await storeInboundMessage(message);
  return NextResponse.json({ ok: true });
}

function validSignature(body: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const given = header.slice("sha256=".length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
