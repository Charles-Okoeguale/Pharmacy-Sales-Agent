export interface SendEmailArgs {
  to: string;
  template: "pricing_overview" | "product_brochure" | "demo_confirmation" | "general_followup";
  pharmacyName?: string;
  demoTime?: string;
}

export interface ScheduleCallbackArgs {
  pharmacyName: string;
  phone: string;
  preferredTime?: string;
  reason?: string;
}

export interface BookDemoArgs {
  pharmacyName: string;
  contactName?: string;
  email?: string;
  preferredDay?: string;
  preferredTime?: string;
}

const TEMPLATE_LABELS: Record<SendEmailArgs["template"], string> = {
  pricing_overview: "Pharmesol Pricing Overview",
  product_brochure: "Pharmesol Product Brochure",
  demo_confirmation: "Demo Booking Confirmation",
  general_followup: "General Follow-Up",
};

export function sendEmail(args: SendEmailArgs): string {
  const templateLabel = TEMPLATE_LABELS[args.template];
  console.log("\n[MOCK EMAIL SENT]");
  console.log(`  To:       ${args.to}`);
  console.log(`  Template: ${templateLabel}`);
  if (args.pharmacyName) console.log(`  Pharmacy: ${args.pharmacyName}`);
  if (args.demoTime) console.log(`  Demo Time: ${args.demoTime}`);
  console.log("");
  return `Email sent successfully. A "${templateLabel}" email has been sent to ${args.to}.`;
}

export function scheduleCallback(args: ScheduleCallbackArgs): string {
  console.log("\n[MOCK CALLBACK SCHEDULED]");
  console.log(`  Pharmacy: ${args.pharmacyName}`);
  console.log(`  Phone:    ${args.phone}`);
  if (args.preferredTime) console.log(`  Preferred Time: ${args.preferredTime}`);
  if (args.reason) console.log(`  Reason: ${args.reason}`);
  console.log("");
  return `Callback scheduled. A Pharmesol sales rep will call ${args.pharmacyName} at ${args.phone}${args.preferredTime ? ` around ${args.preferredTime}` : " within 24 hours"}.`;
}

export function bookDemo(args: BookDemoArgs): string {
  const time = args.preferredDay && args.preferredTime
    ? `${args.preferredDay} at ${args.preferredTime}`
    : args.preferredDay ?? "a time to be confirmed";

  console.log("\n[MOCK DEMO BOOKED]");
  console.log(`  Pharmacy: ${args.pharmacyName}`);
  if (args.contactName) console.log(`  Contact:  ${args.contactName}`);
  if (args.email) console.log(`  Email:    ${args.email}`);
  console.log(`  Time:     ${time}`);
  console.log("");
  return `Demo booked for ${args.pharmacyName} on ${time}. A confirmation email will be sent${args.email ? ` to ${args.email}` : ""}.`;
}
