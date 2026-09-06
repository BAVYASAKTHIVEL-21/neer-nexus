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
      success: true,
      dispatch_attempted: false,
      source: "IMD_CAP_RSS",
      checked_alerts: rssItems.length,
      timestamp: new Date().toISOString(),
      event_type: "no_relevant_coastal_alert",
      event_area: "No affected coastal area",
      event_severity: "None",
      event_description: "No relevant coastal hazard alert is currently active.",
    }),
  );

  Deno.exit(0);
}

const timestamp = new Date().toISOString();

console.log(
  JSON.stringify({
    status: "hazard_detected",
    success: true,
    dispatch_attempted: false,
    source: "IMD_CAP_RSS",
    timestamp,
    event_type: "coastal_hazard",
    event_area: selectedAlert.area,
    event_severity: selectedAlert.severity,
    event_description: selectedAlert.description,
    alert: selectedAlert,
  }),
);
