import * as dotenv from "dotenv";
dotenv.config();

import * as readline from "readline";
import { lookupPharmacyByPhone } from "./pharmacyApi";
import { Agent } from "./agent";
import type { PharmacyContext } from "./prompts";
import { writeCallLog } from "./callLogger";

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  green:   "\x1b[32m",
  cyan:    "\x1b[36m",
  blue:    "\x1b[34m",
  gray:    "\x1b[90m",
  white:   "\x1b[97m",
  yellow:  "\x1b[33m",
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function startSpinner(label: string): () => void {
  let i = 0;
  process.stdout.write("\n");
  const interval = setInterval(() => {
    process.stdout.write(
      `\r${c.cyan}${SPINNER_FRAMES[i % SPINNER_FRAMES.length]}${c.reset} ${c.dim}${label}${c.reset}   `
    );
    i++;
  }, 80);
  return () => {
    clearInterval(interval);
    process.stdout.write("\r\x1b[2K");
  };
}

const phoneArg = process.argv.find((a) => a.startsWith("--phone="));
const MOCK_CALLER_PHONE = phoneArg ? (phoneArg.split("=")[1] ?? "+1-555-123-4567") : "+1-555-123-4567";

async function main() {
  console.clear();
  console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.bold}${c.white}  Pharmesol — Inbound Sales Agent${c.reset}`);
  console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`\n${c.gray}  Incoming call from ${c.white}${MOCK_CALLER_PHONE}${c.reset}`);

  const callStartedAt = new Date();

  let pharmacyContext: PharmacyContext;
  const lookupStop = startSpinner("Looking up pharmacy...");

  try {
    const result = await lookupPharmacyByPhone(MOCK_CALLER_PHONE);
    lookupStop();

    if (result.found) {
      console.log(`  ${c.green}✓${c.reset} ${c.bold}${result.pharmacy.name}${c.reset} ${c.gray}· ${result.location} · ${result.rxVolume} Rx/mo${c.reset}\n`);
      pharmacyContext = {
        isKnown: true,
        name: result.pharmacy.name,
        location: result.location,
        rxVolume: result.rxVolume,
      };
    } else {
      console.log(`  ${c.yellow}?${c.reset} ${c.dim}Unknown caller — agent will collect details${c.reset}\n`);
      pharmacyContext = { isKnown: false };
    }
  } catch {
    lookupStop();
    console.log(`  ${c.yellow}⚠${c.reset} ${c.dim}Could not reach pharmacy API — continuing as unknown caller${c.reset}\n`);
    pharmacyContext = { isKnown: false };
  }

  console.log(`${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  const agent = new Agent(pharmacyContext);
  const greetingStop = startSpinner("Alex is connecting...");

  let greeting: string;
  try {
    greeting = await agent.getOpeningGreeting();
    greetingStop();
  } catch (err) {
    greetingStop();
    console.error(`\n${c.yellow}Error getting opening greeting:${c.reset}`, err);
    process.exit(1);
  }

  console.log(`${c.green}${c.bold}  Alex:${c.reset} ${c.white}${greeting}${c.reset}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`${c.gray}  (type "exit" or "quit" to end the call — Alex will say goodbye first)${c.reset}\n`);

  const endCall = async (alexAlreadySaidGoodbye = false) => {
    if (!alexAlreadySaidGoodbye) {
      const goodbyeStop = startSpinner("Alex is wrapping up...");
      try {
        const goodbye = await agent.chat("exit");
        goodbyeStop();
        console.log(`\n${c.green}${c.bold}  Alex:${c.reset} ${c.white}${goodbye}${c.reset}\n`);
      } catch {
        goodbyeStop();
      }
    }

    const summaryStop = startSpinner("Generating call summary...");
    try {
      const summary = await agent.generateSummary();
      summaryStop();

      const mins = Math.floor(summary.durationSeconds / 60);
      const secs = summary.durationSeconds % 60;
      const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const pharmacyLabel = pharmacyContext.isKnown
        ? `${pharmacyContext.name ?? "Unknown"} — ${pharmacyContext.location ?? ""}`
        : "Unknown (new lead)";

      console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
      console.log(`${c.bold}${c.white}  CALL SUMMARY${c.reset}`);
      console.log(`${c.bold}${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);
      console.log(`  ${c.dim}Pharmacy:${c.reset}   ${c.white}${pharmacyLabel}${c.reset}`);
      console.log(`  ${c.dim}Duration:${c.reset}   ${c.white}${duration}${c.reset}`);
      console.log(`  ${c.dim}Intent:${c.reset}     ${c.white}${summary.intent}${c.reset}`);
      console.log(`  ${c.dim}Outcome:${c.reset}    ${c.white}${summary.outcome}${c.reset}`);
      console.log(`  ${c.dim}Follow-up:${c.reset}  ${c.white}${summary.followUp}${c.reset}`);

      const actionLabels: Record<string, string> = {
        book_demo: "Demo booked",
        send_email: "Email sent",
        schedule_callback: "Callback scheduled",
      };

      if (summary.actionsPerformed.length > 0) {
        const actions = summary.actionsPerformed.map((a) => actionLabels[a] ?? a).join(", ");
        console.log(`  ${c.dim}Actions:${c.reset}    ${c.green}${actions}${c.reset}`);
      } else {
        console.log(`  ${c.dim}Actions:${c.reset}    ${c.gray}none${c.reset}`);
      }
      console.log();

      const logPath = writeCallLog({
        startedAt: callStartedAt,
        phone: MOCK_CALLER_PHONE,
        pharmacyContext,
        summary,
        transcript: agent.getTranscript(),
      });
      console.log(`  ${c.dim}Log saved:${c.reset}  ${c.gray}${logPath}${c.reset}\n`);
    } catch {
      summaryStop();
    }

    console.log(`${c.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
    console.log(`${c.gray}  Call ended.${c.reset}\n`);
    rl.close();
  };

  const askQuestion = () => {
    rl.question(`${c.cyan}${c.bold}  You: ${c.reset}`, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        askQuestion();
        return;
      }

      if (trimmed.toLowerCase() === "quit" || trimmed.toLowerCase() === "exit") {
        await endCall();
        return;
      }

      const thinkingStop = startSpinner("Alex is thinking...");

      try {
        const reply = await agent.chat(trimmed);
        thinkingStop();

        console.log(`\n${c.green}${c.bold}  Alex:${c.reset} ${c.white}${reply}${c.reset}\n`);

        if (agent.awaitingEndConfirmation) {
          console.log(`${c.green}${c.bold}  Alex:${c.reset} ${c.white}Is there anything else I can help you with, or are we all good?${c.reset}\n`);
        }

        if (agent.callEnded) {
          await endCall(true);
          return;
        }
      } catch (err) {
        thinkingStop();
        console.error(`\n${c.yellow}  Error:${c.reset}`, err);
      }

      askQuestion();
    });
  };

  askQuestion();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
