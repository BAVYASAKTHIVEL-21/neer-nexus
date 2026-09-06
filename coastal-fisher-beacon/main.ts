/**
 * @rote-frontmatter
 * ---
 * name: coastal-fisher-beacon
 * description: |
 *   Coastal Fisher Beacon is a Rote Play designed to help protect fishermen and coastal vessel operators during maritime emergencies, where delayed or inaccurate distress communication can cost lives. It captures and validates critical information such as vessel identity, distress status, location, GPS accuracy, battery, people onboard, and emergency details, then routes a verified alert to an authorized rescue channel. As part of a larger Rote ecosystem, it can integrate with Kadalkaval to connect vessel distress with coastal hazards such as cyclones, tsunamis, storm surges, and flooding, enabling faster, location-aware warnings and broader coastal situational awareness.
 * source: https://github.com/BAVYASAKTHIVEL-21/coastal-fisher-beacon
 * tags:
 * - maritime-safety
 * - emergency-response
 * - fishermen
 * - distress-beacon
 * - notification
 * discoverability:
 *   summary: Emergency maritime distress beacon for fishermen and vessels.
 *   audience:
 *   - fishermen
 *   - vessel-operators
 *   - rescue-coordinators
 * metadata:
 *   rote_version: 0.1.31
 *   version: 0.1.31
 *   status: released
 *   kind: atomic
 *   flow_type: sequential
 *   execution_model: steps_with_presentation
 *   format: typescript
 *   requires_endpoints: []
 *   requires_sessions: false
 *   contract:
 *     atomic: true
 *     composable: true
 *     input:
 *       type: env
 *     output:
 *       format: json
 *       destination: stdout
 *   discoverability:
 *     tags:
 *     - maritime-safety
 *     - emergency-response
 *     - fishermen
 *     - distress-beacon
 *     - notification
 * parameters:
 * - name: fisher_name
 *   param_type: string
 *   required: true
 *   description: Name of the fisherman or vessel operator
 * - name: vessel_name
 *   param_type: string
 *   required: true
 *   description: Name or identifier of the vessel
 * - name: distress_status
 *   param_type: string
 *   required: false
 *   description: Current distress status; defaults to unspecified when not provided
 * - name: people_onboard
 *   param_type: string
 *   required: false
 *   description: Number of people currently onboard
 * - name: emergency_message
 *   param_type: string
 *   required: true
 *   description: Emergency details or message
 * - name: telegram_bot_token
 *   param_type: string
 *   required: true
 *   description: Telegram bot token for emergency notification delivery
 * - name: telegram_chat_id
 *   param_type: string
 *   required: true
 *   description: Telegram chat ID for emergency notification delivery
 * steps:
 *   dispatch_alert:
 *     type: process.exec
 *     argv:
 *     - deno
 *     - run
 *     - --allow-net=api.telegram.org,ip-api.com,nominatim.openstreetmap.org
 *     - --allow-run=powershell.exe
 *     - --allow-read=/sys/class/power_supply
 *     - '@resource{dispatch.ts}'
 *     - $fisher_name
 *     - $vessel_name
 *     - $distress_status
 *     - $people_onboard
 *     - $emergency_message
 *     - $telegram_bot_token
 *     - $telegram_chat_id
 *     timeout_ms: 30000
 * presentation_fixtures:
 *   dispatch_alert: resources/presentation-fixtures/dispatch_alert/fixture.yaml
 * ---
 */

const {
  FlowOutput,
  isProcessExecBody,
  loadPresentationContext,
  stepName,
} = await import("__ROTE_PRESENTATION_SDK__");

export async function run() {
  const out = new FlowOutput();

  out.summary("Coastal Fisher Beacon processed a maritime distress report.");

  const ctx = await loadPresentationContext();
  const dispatch = ctx.step(stepName("dispatch_alert"));

  if (
    dispatch.outcome.status === "completed" ||
    dispatch.outcome.status === "restored"
  ) {
    const body = dispatch.outcome.output.body;

    if (!isProcessExecBody(body)) {
      out.human(
        "COASTAL FISHER BEACON: Alert processing completed, but the process response format was invalid."
      );

      out.result({
        status: "invalid_process_response",
        success: false,
        dispatch_attempted: false,
        timestamp: new Date().toISOString(),
      });

      return;
    }

    if (
      body.status.exit.kind !== "code" ||
      body.status.exit.code !== 0
    ) {
      out.human(
        "COASTAL FISHER BEACON: Alert processing failed. No successful delivery is being claimed."
      );

      out.result({
        status: "processing_failed",
        success: false,
        dispatch_attempted: false,
        timestamp: new Date().toISOString(),
      });

      return;
    }

    const stdout = body.stdout?.text;

    if (!stdout) {
      out.human(
        "COASTAL FISHER BEACON: Alert processing completed, but no alert payload was produced."
      );

      out.result({
        status: "alert_unconfirmed",
        success: false,
        dispatch_attempted: false,
        timestamp: new Date().toISOString(),
      });

      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(stdout);
    } catch {
      out.human(
        "COASTAL FISHER BEACON: Alert processing completed, but the alert payload was not valid JSON."
      );

      out.result({
        status: "invalid_alert_payload",
        success: false,
        dispatch_attempted: false,
        timestamp: new Date().toISOString(),
      });

      return;
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "success" in parsed &&
      parsed.success === true
    ) {
      out.human(
        "COASTAL FISHER BEACON: Emergency alert payload was successfully prepared for external notification delivery."
      );

      out.result({
        ...(parsed as Record<string, unknown>),
        status: "alert_ready",
        success: true,
        dispatch_attempted: false,
      });

      return;
    }

    out.human(
      "COASTAL FISHER BEACON: Alert processing completed, but valid confirmation data was not available."
    );

    out.result({
      status: "alert_unconfirmed",
      success: false,
      dispatch_attempted: false,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  if (dispatch.outcome.status === "failed") {
    out.human(
      "COASTAL FISHER BEACON: Alert processing failed. No successful delivery is being claimed."
    );

    out.result({
      status: "processing_failed",
      success: false,
      dispatch_attempted: false,
      error: dispatch.outcome.output.message,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  out.human(
    "COASTAL FISHER BEACON: Alert processing did not complete successfully."
  );

  out.result({
    status: "processing_not_completed",
    success: false,
    dispatch_attempted: false,
    timestamp: new Date().toISOString(),
  });
}

if (import.meta.main) {
  await run();
}
