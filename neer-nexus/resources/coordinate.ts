const [
  eventType,
  eventArea,
  eventSeverity,
  eventMessage,
  telegramBotToken,
  telegramChatId,
] = Deno.args;

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`Missing required field: ${name}`);
  }

  return trimmed;
}

const type = required("event_type", eventType);
const area = required("event_area", eventArea);
const severity = required("event_severity", eventSeverity);
const message = required("event_message", eventMessage);
const botToken = required("telegram_bot_token", telegramBotToken);
const chatId = required("telegram_chat_id", telegramChatId);

if (type === "no_relevant_coastal_alert") {
  console.log(
    JSON.stringify({
      success: true,
      status: "no_coordination_required",
      event: {
        type,
        area,
        severity,
        message,
      },
      coordination: null,
      integration_mode: "contract_level_coordination",
      notification: {
        channel: "telegram",
        status: "not_required",
      },
      timestamp: new Date().toISOString(),
    }),
  );
  Deno.exit(0);
}

if (type !== "coastal_hazard" && type !== "maritime_distress") {
  throw new Error(
    `Unsupported event_type: ${type}. Expected coastal_hazard or maritime_distress`,
  );
}

const severityLower = severity.toLowerCase();

const priority =
  type === "maritime_distress"
    ? "critical"
    : severityLower.includes("extreme") ||
        severityLower.includes("severe")
      ? "high"
      : severityLower.includes("moderate")
        ? "medium"
        : "low";

const coordination =
  type === "coastal_hazard"
    ? {
        source_play: "kadalkaval",
        target_play: "coastal-fisher-beacon",
        action: "evaluate_fisher_relevance",
        priority,
        reason:
          "A coastal hazard may affect vessels operating in the associated area. Fisher Beacon can use the hazard information for maritime safety coordination.",
      }
    : {
        source_play: "coastal-fisher-beacon",
        target_play: "kadalkaval",
        action: "update_coastal_situational_awareness",
        priority,
        reason:
          "A maritime distress event provides coastal situational information but does not by itself establish a coastal hazard.",
      };

const telegramText = [
  "🌊 NEER NEXUS COORDINATION ALERT",
  "",
  `Event: ${type}`,
  `Area: ${area}`,
  `Severity: ${severity}`,
  `Priority: ${priority}`,
  "",
  `Source: ${coordination.source_play}`,
  `Target: ${coordination.target_play}`,
  `Action: ${coordination.action}`,
  "",
  `Details: ${message}`,
  "",
  `Reason: ${coordination.reason}`,
].join("\n");

const telegramResponse = await fetch(
  `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`,
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: telegramText,
    }),
  },
);

let telegramResult: unknown;

try {
  telegramResult = await telegramResponse.json();
} catch {
  throw new Error(
    `Telegram returned a non-JSON response with HTTP ${telegramResponse.status}`,
  );
}

if (
  !telegramResponse.ok ||
  typeof telegramResult !== "object" ||
  telegramResult === null ||
  !("ok" in telegramResult) ||
  (telegramResult as { ok: boolean }).ok !== true
) {
  throw new Error(
    `Telegram delivery failed with HTTP ${telegramResponse.status}`,
  );
}

console.log(
  JSON.stringify({
    success: true,
    event: {
      type,
      area,
      severity,
      message,
    },
    coordination,
    integration_mode: "contract_level_coordination",
    notification: {
      channel: "telegram",
      status: "delivered",
    },
    timestamp: new Date().toISOString(),
  }),
);
