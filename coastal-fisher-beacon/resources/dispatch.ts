const [
  fisherName,
  vesselName,
  distressStatus,
  peopleOnboard,
  emergencyMessage,
  telegramBotToken,
  telegramChatId,
] = Deno.args;

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Missing required field: ${name}`);
  return trimmed;
}

const fisher = required("fisher_name", fisherName);
const vessel = required("vessel_name", vesselName);
const distress = distressStatus?.trim() || "unspecified";
const message = required("emergency_message", emergencyMessage);
const botToken = required("telegram_bot_token", telegramBotToken);
const chatId = required("telegram_chat_id", telegramChatId);

async function detectBattery(): Promise<string> {
  // Linux / WSL battery
  try {
    for (const entry of Deno.readDirSync("/sys/class/power_supply")) {
      const path = `/sys/class/power_supply/${entry.name}/capacity`;
      try {
        const value = (await Deno.readTextFile(path)).trim();
        if (/^\d+$/.test(value)) return `${value}%`;
      } catch {
        // Continue probing.
      }
    }
  } catch {
    // Battery information unavailable.
  }

  // Windows host battery from WSL
  try {
    const command = new Deno.Command("powershell.exe", {
      args: [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_Battery | Measure-Object -Property EstimatedChargeRemaining -Average).Average",
      ],
      stdout: "piped",
      stderr: "null",
    });

    const output = await command.output();
    const value = new TextDecoder().decode(output.stdout).trim();

    if (output.success && /^\d+$/.test(value)) {
      return `${value}%`;
    }
  } catch {
    // Battery information unavailable.
  }

  return "Unknown — device telemetry unavailable";
}

async function detectLocation(): Promise<{
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  source: string;
  address: string | null;
}> {
  // Windows device location from WSL host
  try {
    const ps = [
      "Add-Type -AssemblyName System.Device;",
      "$w = New-Object System.Device.Location.GeoCoordinateWatcher;",
      "$w.Start();",
      "$t = 0;",
      "while ($w.Status -ne 'Ready' -and $t -lt 30) { Start-Sleep -Milliseconds 100; $t++ };",
      "if ($w.Position.Location.IsUnknown) { exit 1 };",
      "$loc = $w.Position.Location;",
      "@{ lat = $loc.Latitude; lng = $loc.Longitude; acc = $loc.HorizontalAccuracy } | ConvertTo-Json -Compress",
    ].join(" ");

    const command = new Deno.Command("powershell.exe", {
      args: ["-NoProfile", "-Command", ps],
      stdout: "piped",
      stderr: "null",
    });

    const output = await command.output();
    const text = new TextDecoder().decode(output.stdout).trim();

    if (output.success && text) {
      const data = JSON.parse(text);

      const latitude = Number(data.lat);
      const longitude = Number(data.lng);
      const accuracy = Number(data.acc);

      if (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
      ) {
        return {
          latitude,
          longitude,
          accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
          source: "device_hardware_wifi",
          address: null,
        };
      }
    }
  } catch {
    // Continue to network fallback.
  }

  // Dynamic network geolocation fallback
  try {
    const response = await fetch(
      "http://ip-api.com/json/?fields=status,city,regionName,lat,lon",
      {
        headers: {
          "User-Agent": "Rote-Coastal-Fisher-Beacon/0.1.18",
        },
      },
    );

    if (response.ok) {
      const data = await response.json();

      if (data.status === "success") {
        const latitude = Number(data.lat);
        const longitude = Number(data.lon);

        if (
          Number.isFinite(latitude) &&
          Number.isFinite(longitude) &&
          latitude >= -90 &&
          latitude <= 90 &&
          longitude >= -180 &&
          longitude <= 180
        ) {
          const address = [data.city, data.regionName]
            .filter(Boolean)
            .join(", ") || null;

          return {
            latitude,
            longitude,
            accuracy_m: null,
            source: "dynamic_network_fix",
            address,
          };
        }
      }
    }
  } catch {
    // Location unavailable.
  }

  return {
    latitude: null,
    longitude: null,
    accuracy_m: null,
    source: "unavailable",
    address: null,
  };
}

const [location, battery] = await Promise.all([
  detectLocation(),
  detectBattery(),
]);

const latitude = location.latitude;
const longitude = location.longitude;
const accuracy = location.accuracy_m;
const locationTimestamp = new Date().toISOString();
const source = location.source;

const validCoordinates =
  latitude !== null &&
  longitude !== null &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

let locationBlock: string;

if (validCoordinates) {
  const mapsUrl =
    `https://maps.google.com/?q=${latitude},${longitude}`;

  const accuracyText = Number.isFinite(accuracy)
    ? `Accuracy: ${accuracy} m`
    : "Accuracy: unavailable";

  const timeText = locationTimestamp
    ? `Fix time: ${locationTimestamp}`
    : "Fix time: unavailable";

  const sourceLabel =
    source === "live_gps"
      ? "🟢 LIVE DEVICE GPS"
      : source === "last_known"
        ? "🟡 LAST KNOWN LOCATION"
        : source === "vessel_tracker"
          ? "🔵 VESSEL TRACKER"
          : "📍 DEVICE LOCATION";

  locationBlock = [
    "📍 LOCATION",
    sourceLabel,
    `Coordinates: ${latitude}, ${longitude}`,
    accuracyText,
    timeText,
    `Maps: ${mapsUrl}`,
  ].join("\n");
} else {
  locationBlock = [
    "📍 LOCATION",
    "🔴 CURRENT LOCATION UNAVAILABLE",
    "Device location was not available.",
    "No coordinates are being claimed as current.",
  ].join("\n");
}

const batteryBlock = battery
  ? `🔋 BATTERY\n${battery}%`
  : "🔋 BATTERY\n⚠️ Unknown — device telemetry unavailable";

const timestamp = new Date().toISOString();

const text = [
  "🚨 COASTAL FISHER BEACON — EMERGENCY ALERT",
  "",
  `Fisher: ${fisher}`,
  `Vessel: ${vessel}`,
  `Distress status: ${distress}`,
  `People onboard: ${peopleOnboard?.trim() || "unspecified"}`,
  "",
  `Emergency: ${message}`,
  "",
  locationBlock,
  "",
  batteryBlock,
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
  fisherman: fisher,
  vessel,
  distress_status: distress,
  people_onboard: peopleOnboard?.trim() || null,
  emergency_message: message,
  location: {
    source: validCoordinates ? source : "unavailable",
    latitude: validCoordinates ? latitude : null,
    longitude: validCoordinates ? longitude : null,
    accuracy_m: validCoordinates && Number.isFinite(accuracy) ? accuracy : null,
    timestamp: validCoordinates ? locationTimestamp : null,
    maps_url: validCoordinates
      ? `https://maps.google.com/?q=${latitude},${longitude}`
      : null,
  },
  battery_level: battery,
  telegram: {
    delivered: true,
    chat_id: chatId,
  },
}));
