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

**Add a web UI.** Right now this runs in the terminal. I would build a simple chat interface in the browser, a phone-call-style screen where you can see the conversation, the pharmacy details at the top, and the mock tool actions appearing as notifications on the side. It would make the demo much easier to show to someone who isn't technical.

**Make the unknown caller flow smarter.** When a caller isn't in the system, Alex collects their name and Rx volume, but right now that information is only used in the conversation. I would save it to a leads list (a simple JSON file) so every new caller is captured and can be reviewed after the call.

**Add a confidence check before tool calls.** Before Alex books a demo or sends an email, I would add a step where Alex confirms the details back to the caller "Just to confirm, I'm sending the pricing sheet to sarah@healthfirst.com, is that right?" before firing the tool. This mirrors how a real sales rep would behave and prevents mistakes.

**Write proper tests.** I would write automated tests for the three core flows: known pharmacy greeting, unknown caller collection, and out-of-scope handling. Not to hit a coverage number, but so anyone picking up this code can run one command and know the agent still behaves correctly after any changes.

--

## What Comes Next in Production

- Voice layer: Twilio Media Streams → Deepgram STT → ElevenLabs TTS
- Redis for session state across multiple concurrent calls
- BullMQ retry queue for tool calls with exponential backoff and failure alerts
- Live CRM, Calendly, and email integrations
- HIPAA-compliant transcript storage

