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

// Extract structured fields from Vapi's structuredData (if configured),
// falling back to whatever we can pull from the summary/transcript.
function extractLeadDetails(payload) {
  const msg = payload.message || payload;

  // Vapi structured data — populated if you configure it in your Vapi assistant
  const structured = msg.call?.analysis?.structuredData || msg.structuredData || {};

  const name     = structured.name     || structured.callerName || "Unknown";
  const phone    = structured.phone    || msg.customer?.number  || msg.call?.customer?.number || "Unknown";
  const issue    = structured.issue    || structured.problem    || "See summary below";
  const location = structured.location || structured.address    || "Unknown";

  // Fall back to full summary so nothing is lost
  const summary = msg.analysis?.summary || msg.summary || msg.transcript || "(no summary available)";

  return { name, phone, issue, location, summary };
}

app.post("/vapi-webhook", async (req, res) => {
  try {
    const payload = req.body;
    const type = payload.message?.type || payload.type;

    // Only act on end-of-call reports
    if (type !== "end-of-call-report") {
      return res.status(200).json({ received: true, action: "ignored", type });
    }

    const { name, phone, issue, location, summary } = extractLeadDetails(payload);

    const smsBody =
      `New lead:\n` +
      `Name: ${name}\n` +
      `Phone: ${phone}\n` +
      `Issue: ${issue}\n` +
      `Location: ${location}\n\n` +
      `Summary: ${summary}`;

    await twilioClient.messages.create({
      body: smsBody,
      from: FROM_NUMBER,
      to: TO_NUMBER,
    });

    console.log(`SMS sent for call. Caller: ${name} | ${phone}`);
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
