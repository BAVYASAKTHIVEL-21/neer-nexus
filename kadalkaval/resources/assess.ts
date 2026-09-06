const [
  hazardTypeArg,
  hazardStatusArg,
  severityArg,
  confidenceArg,
  affectedAreaArg,
  hazardMessageArg,
  telegramBotTokenArg,
  telegramChatIdArg,
] = Deno.args;

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`Missing required field: ${name}`);
  }

  return trimmed;
}

const hazardType = required("hazard_type", hazardTypeArg);
const hazardStatus = required("hazard_status", hazardStatusArg);
const severity = required("severity", severityArg);
const confidence = required("confidence", confidenceArg);
const affectedArea = required("affected_area", affectedAreaArg);
const hazardMessage = required("hazard_message", hazardMessageArg);
const botToken = required("telegram_bot_token", telegramBotTokenArg);
const chatId = required("telegram_chat_id", telegramChatIdArg);

const allowedHazards = new Set([
  "tsunami",
  "cyclone",
  "coastal_flooding",
  "storm_surge",
  "extreme_waves",
  "other",
]);

const normalizedHazard = hazardType.toLowerCase().replaceAll(" ", "_");

if (!allowedHazards.has(normalizedHazard)) {
  throw new Error(`Unsupported hazard_type: ${hazardType}`);
}

const timestamp = new Date().toISOString();

const text = [
  "🌊 KADALKAVAL — COASTAL HAZARD WARNING",
  "",
  `Hazard: ${hazardType}`,
  `Status: ${hazardStatus}`,
  `Severity: ${severity}`,
  `Confidence: ${confidence}`,
  `Affected area: ${affectedArea}`,
  "",
  `Warning: ${hazardMessage}`,
  "",
  `Alert time: ${timestamp}`,
].join("\n");

const endpoint =
  `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;

let response: Response;

try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
} catch (error) {
  console.error(JSON.stringify({
    error: "telegram_network_error",
    message: error instanceof Error ? error.message : String(error),
  }));

  Deno.exit(1);
}

const responseText = await response.text();

let telegram: unknown;

try {
  telegram = JSON.parse(responseText);
} catch {
  telegram = null;
}

if (!response.ok) {
  console.error(JSON.stringify({
    error: "telegram_delivery_failed",
    http_status: response.status,
    telegram_response: telegram,
  }));

  Deno.exit(1);
}

if (
  typeof telegram !== "object" ||
  telegram === null ||
  !("ok" in telegram) ||
  telegram.ok !== true
) {
  console.error(JSON.stringify({
    error: "telegram_delivery_unconfirmed",
    http_status: response.status,
  }));

  Deno.exit(1);
}

console.log(JSON.stringify({
  status: "delivered",
  success: true,
  dispatch_attempted: true,
  notification_status: "telegram_delivered",
  timestamp,
  hazard: {
    type: hazardType,
    status: hazardStatus,
    severity,
    confidence,
    affected_area: affectedArea,
    message: hazardMessage,
  },
  telegram: {
    delivered: true,
    chat_id: chatId,
  },
}));
