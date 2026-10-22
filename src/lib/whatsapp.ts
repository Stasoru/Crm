// WhatsApp Business Cloud API (official). Docs: developers.facebook.com/docs/whatsapp/cloud-api
const GRAPH_URL = "https://graph.facebook.com/v21.0";

export type InboundMessage = {
  phoneNumberId: string;
  from: string;
  profileName: string | null;
  externalId: string;
  body: string;
  timestamp: Date;
};

type WaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};

type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: WaMessage[];
      };
    }[];
  }[];
};

// Flattens a webhook call into the messages it carries. Status updates are ignored.
export function parseWebhook(payload: unknown): InboundMessage[] {
  const result: InboundMessage[] = [];
  for (const entry of (payload as WebhookPayload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const m of value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const contact = value?.contacts?.find((c) => c.wa_id === m.from);
        result.push({
          phoneNumberId,
          from: m.from,
          profileName: contact?.profile?.name ?? null,
          externalId: m.id,
          body: messageText(m),
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }
    }
  }
  return result;
}

function messageText(m: WaMessage): string {
  if (m.type === "text") return m.text?.body ?? "";
  if (m.type === "button") return m.button?.text ?? "";
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
  return `[${m.type ?? "mensagem"} não suportada]`;
}

export async function sendText(channel: { phoneNumberId: string; accessToken: string }, to: string, body: string) {
  let res: Response;
  try {
    res = await fetch(`${GRAPH_URL}/${channel.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { ok: false as const, error: `Falha de conexão com o WhatsApp (${err instanceof Error ? err.message : "erro"})` };
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) return { ok: false as const, error: data.error?.message ?? `HTTP ${res.status}` };
  return { ok: true as const, externalId: data.messages?.[0]?.id ?? null };
}
