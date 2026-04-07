# Pharmesol Inbound Sales Agent

A text-based simulation of an AI-powered inbound sales agent for pharmacies, built on the Pharmesol design document.

---

## Setup

```bash
npm install
cp .env.example .env
```

Open `.env` and set your OpenAI API key:

```
OPENAI_API_KEY=your-key-here
```

Then run:

```bash
npm start
```

The agent starts immediately. Type your messages and press Enter.

**Ending the call** — there are three ways:

- Type `exit` or `quit` at any point — Alex says a proper goodbye and the call closes.
- Say something natural like `"okay thanks bye"`, `"that's all"`, `"we're good"`, or `"end the call"` — Alex will ask if you're done, reply `"yes"` and the call closes.
- If Alex says something like `"have a great day"` during the conversation, the call closes automatically.

---

## How It Works

On startup, the agent looks up the mock caller phone number against the pharmacy API. If the pharmacy is found, Alex greets them by name and references their location and Rx volume. If not found, Alex collects the pharmacy name and Rx volume conversationally.

The default phone number is `+1-555-123-4567` (HealthFirst Pharmacy, New York). To test a different scenario:

```bash
# Known pharmacy
npm start -- --phone="+1-555-987-6543"

# Unknown caller — agent collects details conversationally
npm start -- --phone="+1-555-000-0000"
```

After every call, a summary is printed to the terminal and a full conversation log is saved to `call-logs/`.

---

## Project Structure

```
src/
  index.ts        — Entry point. Runs the conversation loop.
  agent.ts        — OpenAI conversation engine with tool dispatch.
  pharmacyApi.ts  — Pharmacy lookup via the mock API.
  prompts.ts      — System prompt with product knowledge and caller context.
  tools.ts        — Mock implementations of send_email, schedule_callback, book_demo.
  callLogger.ts   — Writes post-call markdown logs to call-logs/.
```

---

## Mock Tools

Tool calls are wired through OpenAI function calling. They do not send real emails or make real bookings — they log to the console and return a confirmation string back to the agent.

```
[MOCK EMAIL SENT]
  To:       sarah@healthfirst.com
  Template: Pharmesol Pricing Overview
  Pharmacy: HealthFirst Pharmacy

[MOCK CALLBACK SCHEDULED]
  Pharmacy: HealthFirst Pharmacy
  Phone:    +1-555-123-4567
  Preferred Time: Monday 2pm

[MOCK DEMO BOOKED]
  Pharmacy: HealthFirst Pharmacy
  Contact:  Sarah
  Email:    sarah@healthfirst.com
  Time:     Thursday at 2pm
```

---

## Assumptions

- **Rx volume** is computed by summing the `count` field across the `prescriptions` array returned by the API.
- **Session state** is held in memory on the `Agent` instance. The design doc specifies Redis — this is the in-process equivalent for a single-call simulation.
- **Tool calls execute inline** rather than through a job queue. The design doc describes BullMQ with retry logic — that layer is outside the scope of this simulation.
- **No voice layer.** The design doc describes Twilio + Deepgram + ElevenLabs. This implementation covers the conversation and tool intelligence, which is the core of the agent.
- **Model** defaults to `gpt-4o-mini`. Override via `OPENAI_MODEL` in `.env`.

---

## If I Had 3 More Hours

**Persist every call to a database.** Right now each call is saved as a markdown file, which works for a demo but does not scale. I would add Postgres with a `sessions` table storing the pharmacy, duration, intent, outcome, and the full transcript as JSON. That gives you a searchable history of every call. You can pull up any conversation, filter by outcome, or see which pharmacies called twice without booking a demo.

**Save new leads automatically.** When an unknown caller gives their pharmacy name and Rx volume, that information currently lives only in the conversation. I would write it to a `leads` table the moment Alex collects it, so the sales team has it even if the call ends before any tool is called.

**Add a confirmation step before tool calls.** Before Alex fires `book_demo` or `send_email`, I would make Alex read the details back to the caller first. Something like "Just to confirm, I am sending the pricing sheet to sarah@healthfirst.com, is that right?" This mirrors how a real sales rep behaves and prevents the agent from acting on misheard information.

**Wire up the actual integrations.** The mock tools are one function swap away from being real. I would replace `sendEmail()` with a SendGrid API call, `bookDemo()` with Calendly, and `scheduleCallback()` with a HubSpot or Salesforce task. The tool dispatch pipeline is already in place, the integrations just need to be dropped in.

---

## What Comes Next in Production

- Voice layer: Twilio Media Streams, Deepgram STT, ElevenLabs TTS, with VAD-based turn detection and sub-1s response latency
- Redis for session state so multiple concurrent calls can run across separate server instances
- BullMQ job queue wrapping every tool call with retries, exponential backoff, failure alerts to Slack, and a failed_actions log so nothing silently disappears
- Postgres to store every session, transcript, and lead captured from unknown callers
- Live integrations: SendGrid for email, Calendly for demos, HubSpot or Salesforce for CRM
- HIPAA-compliant infrastructure: transcripts encrypted at rest, no PHI logged in plain text, audit trail on every data access

