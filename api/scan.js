import Anthropic from "@anthropic-ai/sdk";

const MODELS = ["claude-haiku-4-5", "claude-opus-4-6"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { images } = req.body;

  if (!images?.length) {
    return res.status(400).json({ error: "No image provided" });
  }

  const client = new Anthropic();

  let response;
  let lastErr;
  for (const model of MODELS) {
    try {
      response = await client.messages.create({
        model,
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              ...images.map(img=>({
                type: "image",
                source: { type: "base64", media_type: img.mediaType || "image/jpeg", data: img.data },
              })),
              {
                type: "text",
                text: `Analyze these image(s) of a medication label, prescription bottle, or appointment card. There may be multiple photos of the same item from different angles — combine all visible text to get the full picture. Respond with ONLY a JSON object (no markdown, no explanation):
{
  "type": "medication" or "appointment",
  "name": "medication name or doctor/appointment name",
  "quantity": "how many units to take per administration, e.g. '2 tablets', '1 capsule', '5 ml'. Empty string if not stated or if appointment.",
  "dose": "the actual dose taken per administration — if the label says take 1.5 tablets of 500mg, the dose is 750mg. If it says take 2 tablets of 10mg, the dose is 20mg. Multiply quantity by strength. Empty string if appointment.",
  "time": "morning", "afternoon", "evening", or "night",
  "notes": "brief relevant notes (e.g. frequency like 'twice daily', instructions like 'take with food', clinic name)"
}
If this is not a medication or appointment image, respond with: {"error": "not a medication or appointment"}`,
              },
            ],
          },
        ],
      });
      break;
    } catch (err) {
      lastErr = err;
      console.error(`Error with model ${model}:`, err.message);
    }
  }

  if (!response) {
    return res.status(500).json({ error: lastErr?.message || "Service temporarily unavailable. Please try again." });
  }

  const raw = response.content[0]?.text?.trim() ?? "";
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    const parsed = JSON.parse(text);
    if (parsed.error) {
      return res.status(422).json({ error: parsed.error });
    }
    return res.status(200).json(parsed);
  } catch {
    console.error("Failed to parse AI response:", text);
    return res.status(500).json({ error: "Failed to parse AI response" });
  }
}
