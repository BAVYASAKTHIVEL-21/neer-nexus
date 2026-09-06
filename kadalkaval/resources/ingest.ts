const [telegramBotTokenArg, telegramChatIdArg] = Deno.args;

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`Missing required field: ${name}`);
  }

  return trimmed;
}

const botToken = required("telegram_bot_token", telegramBotTokenArg);
const chatId = required("telegram_chat_id", telegramChatIdArg);

const IMD_RSS_URL =
  "https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml";

type ImdRssItem = {
  title: string;
  link: string;
  description: string;
  guid: string;
  pubDate: string;
};

type CapAlert = {
  identifier: string;
  event: string;
  severity: string;
  certainty: string;
  urgency: string;
  headline: string;
  description: string;
  instruction: string;
  area: string;
  polygon: string;
  sent: string;
  onset: string;
  expires: string;
};

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractXmlField(
  xml: string,
  field: string,
): string | null {
  const pattern = new RegExp(
    `<(?:cap:)?${field}>([\\s\\S]*?)</(?:cap:)?${field}>`,
    "i",
  );

  const match = xml.match(pattern);

  return match ? decodeXml(match[1].trim()) : null;
}

function extractRssItems(xml: string): ImdRssItem[] {
  const items: ImdRssItem[] = [];

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];

    const link = extractXmlField(block, "link");

    if (!link) {
      continue;
    }

    items.push({
      title: extractXmlField(block, "title") ?? "Unknown hazard",
      link,
      description: extractXmlField(block, "description") ?? "",
      guid: extractXmlField(block, "guid") ?? link,
      pubDate: extractXmlField(block, "pubDate") ?? "",
    });
  }

  return items;
}

async function fetchImdRss(): Promise<ImdRssItem[]> {
  const response = await fetch(IMD_RSS_URL, {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "Kadalkaval/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(
      `IMD RSS request failed: HTTP ${response.status}`,
    );
  }

  const xml = await response.text();
  const items = extractRssItems(xml);

  if (items.length === 0) {
    throw new Error("IMD RSS feed contained no alert items");
  }

  return items;
}

async function fetchCapAlert(item: ImdRssItem): Promise<CapAlert> {
  const response = await fetch(item.link, {
    headers: {
      accept: "application/xml, text/xml",
      "user-agent": "Kadalkaval/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(
      `CAP request failed: HTTP ${response.status}`,
    );
  }

  const xml = await response.text();

  const identifier =
    extractXmlField(xml, "identifier") ?? item.guid;

  const event =
    extractXmlField(xml, "event") ?? item.title;

  return {
    identifier,
    event,
    severity: extractXmlField(xml, "severity") ?? "Unknown",
    certainty: extractXmlField(xml, "certainty") ?? "Unknown",
    urgency: extractXmlField(xml, "urgency") ?? "Unknown",
    headline:
      extractXmlField(xml, "headline") ?? item.title,
    description:
      extractXmlField(xml, "description") ?? item.description,
    instruction:
      extractXmlField(xml, "instruction") ?? "",
    area:
      extractXmlField(xml, "areaDesc") ?? "Unspecified area",
    polygon:
      extractXmlField(xml, "polygon") ?? "",
    sent:
      extractXmlField(xml, "sent") ?? item.pubDate,
    onset:
      extractXmlField(xml, "onset") ?? "",
    expires:
      extractXmlField(xml, "expires") ?? "",
  };
}

function isCoastalRelevant(alert: CapAlert): boolean {
  const text = [
    alert.event,
    alert.headline,
    alert.description,
    alert.area,
  ]
    .join(" ")
    .toLowerCase();

  const keywords = [
    "tsunami",
    "cyclone",
    "storm surge",
    "coastal flood",
    "coastal flooding",
    "high wave",
    "high waves",
    "very high wave",
    "extreme wave",
    "sea swell",
    "rough sea",
    "squall",
    "storm",
    "coastal",
  ];

  return keywords.some((keyword) => text.includes(keyword));
}

function escapeTelegramText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendTelegram(text: string): Promise<unknown> {
  const endpoint =
    `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  const responseText = await response.text();

  let telegram: unknown = null;

  try {
    telegram = JSON.parse(responseText);
  } catch {
    // Preserve null when Telegram does not return JSON.
  }

  if (!response.ok) {
    throw new Error(
      `Telegram delivery failed: HTTP ${response.status}`,
    );
  }

  if (
    typeof telegram !== "object" ||
    telegram === null ||
    !("ok" in telegram) ||
    telegram.ok !== true
  ) {
    throw new Error("Telegram delivery was not confirmed");
  }

  return telegram;
}

const rssItems = await fetchImdRss();

let selectedAlert: CapAlert | null = null;

for (const item of rssItems) {
  try {
    const alert = await fetchCapAlert(item);

    if (isCoastalRelevant(alert)) {
      selectedAlert = alert;
      break;
    }
  } catch {
    continue;
  }
}

if (!selectedAlert) {
  console.log(
    JSON.stringify({
      status: "no_relevant_coastal_alert",
      success: false,
      dispatch_attempted: false,
      source: "IMD_CAP_RSS",
      checked_alerts: rssItems.length,
      timestamp: new Date().toISOString(),
    }),
  );

  Deno.exit(0);
}

const timestamp = new Date().toISOString();

const messageParts = [
  "🌊 <b>KADALKAVAL — COASTAL HAZARD WARNING</b>",
  "",
  `<b>Hazard:</b> ${escapeTelegramText(selectedAlert.event)}`,
  `<b>Severity:</b> ${escapeTelegramText(selectedAlert.severity)}`,
  `<b>Certainty:</b> ${escapeTelegramText(selectedAlert.certainty)}`,
  `<b>Urgency:</b> ${escapeTelegramText(selectedAlert.urgency)}`,
  "",
  `📍 <b>Affected area:</b> ${escapeTelegramText(selectedAlert.area)}`,
  "",
  `⚠️ <b>${escapeTelegramText(selectedAlert.headline)}</b>`,
  "",
  escapeTelegramText(selectedAlert.description),
];

if (selectedAlert.instruction) {
  messageParts.push(
    "",
    "🛟 <b>Safety guidance</b>",
    escapeTelegramText(selectedAlert.instruction),
  );
}

messageParts.push(
  "",
  "<b>Source:</b> India Meteorological Department",
  `<b>Alert issued:</b> ${escapeTelegramText(selectedAlert.sent)}`,
  `<b>Kadalkaval dispatch:</b> ${timestamp}`,
);

const text = messageParts.join("\n");

try {
  await sendTelegram(text);

  console.log(
    JSON.stringify({
      status: "delivered",
      success: true,
      dispatch_attempted: true,
      notification_status: "telegram_delivered",
      source: "IMD_CAP_RSS",
      timestamp,
      event: {
        type: "coastal_hazard",
        area: selectedAlert.area,
        severity: selectedAlert.severity,
        urgency: selectedAlert.urgency,
        certainty: selectedAlert.certainty,
        headline: selectedAlert.headline,
        description: selectedAlert.description,
        instruction: selectedAlert.instruction,
        polygon: selectedAlert.polygon,
        sent: selectedAlert.sent,
        onset: selectedAlert.onset,
        expires: selectedAlert.expires,
      },
      alert: selectedAlert,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "delivery_failed",
      success: false,
      dispatch_attempted: true,
      notification_status: "telegram_delivery_failed",
      source: "IMD_CAP_RSS",
      timestamp,
      alert: selectedAlert,
      error: error instanceof Error
        ? error.message
        : String(error),
    }),
  );

  Deno.exit(1);
}
