import * as fs from "fs";
import * as path from "path";
import type { CallSummary } from "./agent";
import type { PharmacyContext } from "./prompts";

const LOGS_DIR = path.join(process.cwd(), "call-logs");

export function writeCallLog(args: {
  startedAt: Date;
  phone: string;
  pharmacyContext: PharmacyContext;
  summary: CallSummary;
  transcript: Array<{ role: string; content: string }>;
}): string {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  const ts = args.startedAt;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}`;
  const timeStr = `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`;
  const fileTime = timeStr.replace(/:/g, "-");
  const pharmacySlug = (args.pharmacyContext.name ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const filename = `${dateStr}T${fileTime}-${pharmacySlug}.md`;
  const filepath = path.join(LOGS_DIR, filename);

  const mins = Math.floor(args.summary.durationSeconds / 60);
  const secs = args.summary.durationSeconds % 60;
  const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const transcriptMd = args.transcript
    .map((m) => {
      const label = m.role === "assistant" ? "**Alex**" : "**Caller**";
      return `${label}: ${m.content}`;
    })
    .join("\n\n");

  const md = `# Call Log — ${dateStr} ${timeStr}

## Call Details

| | |
|---|---|
| Phone | ${args.phone} |
| Pharmacy | ${args.pharmacyContext.name ?? "Unknown (new lead)"} |
| Location | ${args.pharmacyContext.location ?? "—"} |
| Rx Volume | ${args.pharmacyContext.rxVolume != null ? `${args.pharmacyContext.rxVolume} Rx/mo` : "—"} |
| Duration | ${duration} |

## Summary

| | |
|---|---|
| Intent | ${args.summary.intent} |
| Outcome | ${args.summary.outcome} |
| Follow-up | ${args.summary.followUp} |
| Actions taken | ${args.summary.actionsPerformed.length > 0 ? args.summary.actionsPerformed.join(", ") : "none"} |

## Conversation

${transcriptMd}
`;

  fs.writeFileSync(filepath, md, "utf8");
  return filepath;
}
