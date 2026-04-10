require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.json());

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const TO_NUMBER = "whatsapp:+447575828858";
const FROM_NUMBER = "whatsapp:+14155238886";

function extractLeadDetails(payload) {
  const msg = payload.message || payload;

  // Primary: body.message.analysis.structuredData
  const structured = msg.analysis?.structuredData || {};

  const name     = structured.name     || fallbackFromText(msg, "name")     || "Unknown";
  const phone    = structured.phone    || msg.customer?.number              || "Unknown";
  const issue    = structured.issue    || fallbackFromText(msg, "issue")    || "See summary below";
  const location = structured.location || fallbackFromText(msg, "location") || "Unknown";

  const summary = msg.analysis?.summary || msg.summary || msg.transcript || "(no summary available)";

  return { name, phone, issue, location, summary };
}

// Crude keyword search in summary/transcript as last resort
function fallbackFromText(msg, field) {
  const text = msg.analysis?.summary || msg.summary || msg.transcript || "";
  const patterns = {
    name:     /name[:\s]+([A-Za-z ]+)/i,
    issue:    /issue[:\s]+([^\n.]+)/i,
    location: /location[:\s]+([^\n.]+)/i,
  };
  const match = text.match(patterns[field]);
  return match ? match[1].trim() : null;
}

app.post("/vapi-webhook", async (req, res) => {
  try {
    const payload = req.body;

    // Log the full webhook payload for debugging
    console.log("Incoming Vapi webhook:", JSON.stringify(payload, null, 2));

    const type = payload.message?.type || payload.type;

    if (type !== "end-of-call-report") {
      console.log(`Ignored webhook type: ${type}`);
      return res.status(200).json({ received: true, action: "ignored", type });
    }

    const { name, phone, issue, location, summary } = extractLeadDetails(payload);

    console.log("Extracted lead:", { name, phone, issue, location });

    const messageBody =
      `New lead:\n` +
      `Name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Issue: ${issue}\n` +
      `Location: ${location}\n\n` +
      `Summary: ${summary}`;

    await twilioClient.messages.create({
      body: messageBody,
      from: FROM_NUMBER,
      to: TO_NUMBER,
    });

    console.log(`WhatsApp sent. Caller: ${name} | ${phone}`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error processing webhook:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/", (_req, res) => res.send("Vapi SMS notifier is running."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
