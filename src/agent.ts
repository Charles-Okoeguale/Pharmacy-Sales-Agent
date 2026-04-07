import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { buildSystemPrompt, type PharmacyContext } from "./prompts";
import { sendEmail, scheduleCallback, bookDemo } from "./tools";
import type { SendEmailArgs, ScheduleCallbackArgs, BookDemoArgs } from "./tools";

const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

const MODEL = process.env["OPENAI_MODEL"] ?? "gpt-4o-mini";
const TEMPERATURE = 0.7;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send a follow-up email to the caller with product info, pricing, or demo confirmation.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          template: {
            type: "string",
            enum: ["pricing_overview", "product_brochure", "demo_confirmation", "general_followup"],
            description: "Which email template to use",
          },
          pharmacyName: { type: "string", description: "Name of the pharmacy" },
          demoTime: { type: "string", description: "Demo date/time if template is demo_confirmation" },
        },
        required: ["to", "template"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_callback",
      description: "Schedule a callback from a human Pharmesol sales rep.",
      parameters: {
        type: "object",
        properties: {
          pharmacyName: { type: "string", description: "Name of the pharmacy" },
          phone: { type: "string", description: "Phone number to call back" },
          preferredTime: { type: "string", description: "Caller's preferred callback time" },
          reason: { type: "string", description: "Why a callback is needed" },
        },
        required: ["pharmacyName", "phone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_demo",
      description: "Book a 30-minute Pharmesol product demo for the caller.",
      parameters: {
        type: "object",
        properties: {
          pharmacyName: { type: "string", description: "Name of the pharmacy" },
          contactName: { type: "string", description: "Name of the contact person" },
          email: { type: "string", description: "Email to send confirmation to" },
          preferredDay: { type: "string", description: "Preferred day for the demo" },
          preferredTime: { type: "string", description: "Preferred time for the demo" },
        },
        required: ["pharmacyName"],
      },
    },
  },
];

function dispatchTool(name: string, args: unknown): string {
  switch (name) {
    case "send_email":
      return sendEmail(args as SendEmailArgs);
    case "schedule_callback":
      return scheduleCallback(args as ScheduleCallbackArgs);
    case "book_demo":
      return bookDemo(args as BookDemoArgs);
    default:
      return `Unknown tool: ${name}`;
  }
}

const WIND_DOWN_PATTERNS = [
  /\b(bye|goodbye|good ?bye|see ya|take care|have a good (one|day|evening|night))\b/i,
  /\b(that'?s? (all|it|everything)|nothing else|no (more )?questions?)\b/i,
  /\b(thanks?|thank you).{0,40}(bye|goodbye|later|good day|have a)\b/i,
  /\bwe'?re? (good|done|all set|all good)\b/i,
  /\b(yes.{0,10}(we'?re?|i'?m?).{0,10}(good|done|all set|all good|finished|fine))\b/i,
  /\b(i'?m? good( now)?|all good|all set)\b/i,
  /\bend (the )?call\b/i,
  /\bi (think )?we'?re? done\b/i,
  /\b(that'?s? it|that'?s? all|nothing more|no more)\b/i,
  /\b(ok(ay)?|alright).{0,10}(bye|goodbye|thanks?|thank you)\b/i,
];

const CONFIRM_END_PATTERNS = [
  /\b(yes|yeah|yep|yup|sure|ok|okay|correct|right|go ahead|end it|finish|done|bye|goodbye|quit|exit|we'?re? good|all good|all set|that'?s? all|that'?s? it)\b/i,
];

const DENY_END_PATTERNS = [
  /^(no|nope|not yet|wait|hold on|actually|one more|one thing|i have|let me|can you|what about)\.?/i,
];

export interface CallSummary {
  intent: string;
  outcome: string;
  actionsPerformed: string[];
  followUp: string;
  durationSeconds: number;
}

export class Agent {
  private messages: ChatCompletionMessageParam[] = [];
  private systemPrompt: string;
  public callEnded = false;
  public awaitingEndConfirmation = false;
  private startTime = Date.now();
  private actionsPerformed: string[] = [];

  constructor(pharmacyContext: PharmacyContext) {
    this.systemPrompt = buildSystemPrompt(pharmacyContext);
  }

  getTranscript(): Array<{ role: string; content: string }> {
    return this.messages
      .filter((m) => typeof m.content === "string" && m.content && !m.content.startsWith("["))
      .map((m) => ({ role: m.role, content: m.content as string }));
  }

  async getOpeningGreeting(): Promise<string> {
    this.messages = [];
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: "[CALL STARTED]" },
      ],
      tools: TOOLS,
      tool_choice: "none",
      temperature: TEMPERATURE,
    });

    const message = response.choices[0]?.message;
    if (!message) throw new Error("No response from OpenAI");

    const text = message.content ?? "Hey, thanks for calling Pharmesol — this is Alex. How can I help?";
    this.messages.push({ role: "assistant", content: text });
    return text;
  }

  async chat(userInput: string): Promise<string> {
    const trimmed = userInput.trim();

    if (this.awaitingEndConfirmation) {
      if (CONFIRM_END_PATTERNS.some((p) => p.test(trimmed))) {
        this.callEnded = true;
        this.awaitingEndConfirmation = false;
        return await this.goodbye();
      }
      if (DENY_END_PATTERNS.some((p) => p.test(trimmed))) {
        this.awaitingEndConfirmation = false;
        const reply = "Of course — what else can I help you with?";
        this.messages.push({ role: "user", content: userInput });
        this.messages.push({ role: "assistant", content: reply });
        return reply;
      }
      this.awaitingEndConfirmation = false;
    }

    this.messages.push({ role: "user", content: trimmed });

    let response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: this.systemPrompt },
        ...this.messages,
      ],
      tools: TOOLS,
      tool_choice: "auto",
      temperature: TEMPERATURE,
    });

    let message = response.choices[0]?.message;
    if (!message) throw new Error("No response from OpenAI");

    while (message.tool_calls && message.tool_calls.length > 0) {
      this.messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });

      const toolResults: ChatCompletionMessageParam[] = message.tool_calls.map((tc) => {
        const toolCall = tc as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const name = toolCall.function.name as string;
        const args = JSON.parse(toolCall.function.arguments as string) as unknown;
        const result = dispatchTool(name, args);
        this.actionsPerformed.push(name);
        return { role: "tool" as const, tool_call_id: tc.id, content: result };
      });

      this.messages.push(...toolResults);

      response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: this.systemPrompt },
          ...this.messages,
        ],
        tools: TOOLS,
        tool_choice: "auto",
        temperature: TEMPERATURE,
      });

      message = response.choices[0]?.message;
      if (!message) throw new Error("No response from OpenAI after tool call");
    }

    const text = message.content ?? "Sorry, I didn't catch that — could you say that again?";
    this.messages.push({ role: "assistant", content: text });

    const callerWindingDown = WIND_DOWN_PATTERNS.some((p) => p.test(trimmed));
    const alexSignedOff = WIND_DOWN_PATTERNS.some((p) => p.test(text));

    if (callerWindingDown || alexSignedOff) {
      if (alexSignedOff) {
        this.callEnded = true;
      } else {
        this.awaitingEndConfirmation = true;
      }
    }

    return text;
  }

  private async goodbye(): Promise<string> {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: this.systemPrompt },
        ...this.messages,
        {
          role: "user",
          content: "[CALLER IS DONE — give a warm natural closing in 1-2 sentences. Mention the next step if there was one. Then say goodbye.]",
        },
      ],
      tools: TOOLS,
      tool_choice: "none",
      temperature: TEMPERATURE,
    });

    const text = response.choices[0]?.message?.content ?? "Great talking with you — have a great day!";
    this.messages.push({ role: "assistant", content: text });
    return text;
  }

  async generateSummary(): Promise<CallSummary> {
    const durationSeconds = Math.round((Date.now() - this.startTime) / 1000);

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a CRM logging assistant. Given a call transcript, extract:
- intent: the caller's primary reason for calling (one short phrase, e.g. "pricing inquiry", "demo request", "product question")
- outcome: what was resolved or agreed (one short phrase, e.g. "demo booked for Thursday 2pm", "pricing info shared", "callback scheduled", "no action taken")
- followUp: the specific next step, if any (e.g. "send pricing email to sarah@healthfirst.com", "sales rep to call back Monday", or "none")

Respond with ONLY valid JSON in this exact shape:
{"intent":"...","outcome":"...","followUp":"..."}`,
        },
        {
          role: "user",
          content: `Transcript:\n${this.messages.map((m) => `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : ""}`).join("\n")}`,
        },
      ],
      temperature: 0,
    });

    let intent = "general inquiry";
    let outcome = "no action taken";
    let followUp = "none";

    try {
      const raw = response.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { intent?: string; outcome?: string; followUp?: string };
      intent = parsed.intent ?? intent;
      outcome = parsed.outcome ?? outcome;
      followUp = parsed.followUp ?? followUp;
    } catch {
      // fall back to defaults
    }

    return {
      intent,
      outcome,
      actionsPerformed: [...new Set(this.actionsPerformed)],
      followUp,
      durationSeconds,
    };
  }
}