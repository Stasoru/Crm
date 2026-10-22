import { describe, expect, it } from "vitest";
import { parseWebhook } from "./whatsapp";

describe("parseWebhook", () => {
  it("extracts text messages with the sender profile name", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "123" },
                contacts: [{ wa_id: "5511999990000", profile: { name: "Ana" } }],
                messages: [{ id: "wamid.1", from: "5511999990000", timestamp: "1760000000", type: "text", text: { body: "Oi!" } }],
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhook(payload)).toEqual([
      { phoneNumberId: "123", from: "5511999990000", profileName: "Ana", externalId: "wamid.1", body: "Oi!", timestamp: new Date(1760000000 * 1000) },
    ]);
  });

  it("ignores status-only updates and garbage", () => {
    expect(parseWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, statuses: [{}] } }] }] })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });

  it("labels unsupported message types", () => {
    const [m] = parseWebhook({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" }, messages: [{ id: "x", from: "1", type: "image" }] } }] }],
    });
    expect(m.body).toBe("[image não suportada]");
  });
});
