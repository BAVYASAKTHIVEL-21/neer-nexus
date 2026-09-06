/**
 * @rote-frontmatter
 * ---
 * name: kadalkaval
 * description: |
 *   An automatic coastal and flood early-warning Play inspired by the devastating
 *   loss of life during sudden floods and coastal disasters such as those seen in
 *   Nepal. Kadalkaval continuously ingests authoritative machine-readable hazard
 *   signals and warnings, including information derived from weather, satellite,
 *   ocean and environmental monitoring systems, detects emerging coastal threats,
 *   assesses their severity and confidence, identifies affected regions, and
 *   delivers timely location-aware warnings through Telegram so communities can
 *   receive critical information before dangerous conditions reach them.
 * source: https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml
 * provenance:
 *   author: bavya21
 * tags:
 * - typescript
 * - coastal
 * - hazard
 * - early-warning
 * - disaster-response
 * - maritime-safety
 * metadata:
 *   rote_version: 0.1.0
 *   version: 0.2.0
 *   status: released
 *   kind: atomic
 *   flow_type: sequential
 *   execution_model: steps_with_presentation
 *   format: typescript
 *   discoverability:
 *     tags:
 *     - typescript
 *     - coastal
 *     - hazard
 *     - early-warning
 *     - disaster-response
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
 * parameters:
 * - name: telegram_bot_token
 *   param_type: string
 *   required: true
 *   description: Telegram bot token used only for warning delivery
 * - name: telegram_chat_id
 *   param_type: string
 *   required: true
 *   description: Telegram destination for the configured regional alert channel
 * presentation_fixtures:
 *   ingest_hazard: resources/presentation-fixtures/ingest_hazard/fixture.yaml
 * steps:
 *   ingest_hazard:
 *     type: process.exec
 *     argv:
 *     - deno
 *     - run
 *     - --allow-net=cap-sources.s3.amazonaws.com,api.telegram.org
 *     - '@resource{ingest.ts}'
 *     - $telegram_bot_token
 *     - $telegram_chat_id
 *     timeout_ms: 30000
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

  out.summary("Kadalkaval ingested and processed a coastal hazard alert.");

  const ctx = await loadPresentationContext();
  const step = ctx.step(stepName("ingest_hazard"));

  if (
    step.outcome.status !== "completed" &&
    step.outcome.status !== "restored"
  ) {
    out.human(
      "KADALKAVAL: Hazard ingestion did not complete successfully."
    );

    out.result({
      status: "processing_failed",
      success: false,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  const body = step.outcome.output.body;

  if (!isProcessExecBody(body)) {
    out.human(
      "KADALKAVAL: Hazard ingestion completed, but the process response format was invalid."
    );

    out.result({
      status: "invalid_process_response",
      success: false,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  if (
    body.status.exit.kind !== "code" ||
    body.status.exit.code !== 0
  ) {
    out.human(
      "KADALKAVAL: Hazard ingestion failed. No successful warning delivery is being claimed."
    );

    out.result({
      status: "processing_failed",
      success: false,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  const stdout = body.stdout?.text;

  if (!stdout) {
    out.human(
      "KADALKAVAL: Hazard ingestion completed, but no result was produced."
    );

    out.result({
      status: "alert_unconfirmed",
      success: false,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(stdout);
  } catch {
    out.human(
      "KADALKAVAL: Hazard ingestion completed, but the result was not valid JSON."
    );

    out.result({
      status: "invalid_alert_payload",
      success: false,
      timestamp: new Date().toISOString(),
    });

    return;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "status" in parsed &&
    parsed.status === "no_relevant_coastal_alert"
  ) {
    out.human(
      "KADALKAVAL: No relevant coastal hazard alert is currently active."
    );

    out.result(parsed as Record<string, unknown>);
    return;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "success" in parsed &&
    parsed.success === true
  ) {
    out.human(
      "KADALKAVAL: Coastal hazard alert was successfully processed and delivered."
    );

    out.result(parsed as Record<string, unknown>);
    return;
  }

  out.human(
    "KADALKAVAL: Hazard processing completed, but successful warning delivery was not confirmed."
  );

  if (typeof parsed === "object" && parsed !== null) {
    out.result(parsed as Record<string, unknown>);
  } else {
    out.result({
      status: "alert_unconfirmed",
      success: false,
      timestamp: new Date().toISOString(),
    });
  }

}

if (import.meta.main) {
  await run();
}
