/**
 * Neer Nexus — Coastal Emergency Coordination Layer
 *
 * Connects coastal hazard events and maritime distress events into a
 * normalized coordination decision without making either source dependent
 * on the other.
 *
 * @rote-frontmatter
 * ---
 * name: neer-nexus
 * description: |
 *   Neer Nexus is a coastal disaster coordination Play that connects authoritative hazard intelligence with maritime-safety decision making. It automatically ingests machine-readable IMD CAP/RSS coastal hazard alerts, transforms relevant hazard information into a structured event, and routes it through a Rote DAG to coordinate actions between Kadalkaval and Coastal Fisher Beacon. It explicitly handles both active hazards and no-hazard conditions, producing appropriate coordination decisions while avoiding false or unnecessary emergency notifications.
 * source: https://play.modiqo.ai/
 * provenance:
 *   author: bavya21
 * tags:
 * - typescript
 * - coastal
 * - emergency-response
 * - maritime-safety
 * - coordination
 * metadata:
 *   rote_version: 0.1.0
 *   version: 0.3.0
 *   status: released
 *   kind: atomic
 *   flow_type: sequential
 *   execution_model: steps_with_presentation
 *   format: typescript
 *   discoverability:
 *     tags:
 *     - typescript
 *     - coastal
 *     - emergency-response
 *     - maritime-safety
 *     - coordination
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
 *   description: Telegram bot token used for coordination alert delivery.
 * - name: telegram_chat_id
 *   param_type: string
 *   required: true
 *   description: Telegram destination for the coordination alert.
 * presentation_fixtures:
 *   hazard_ingest: resources/presentation-fixtures/hazard_ingest/fixture.yaml
 *   coordinate_event: resources/presentation-fixtures/coordinate_event/fixture.yaml
 * steps:
 *   hazard_ingest:
 *     type: process.exec
 *     argv:
 *     - deno
 *     - run
 *     - --allow-net=cap-sources.s3.amazonaws.com
 *     - '@resource{hazard_ingest.ts}'
 *     timeout_ms: 30000
 *   coordinate_event:
 *     type: process.exec
 *     depends_on:
 *     - hazard_ingest
 *     argv:
 *     - deno
 *     - run
 *     - --allow-net=api.telegram.org
 *     - '@resource{coordinate.ts}'
 *     - '@hazard_ingest{$.stdout.text | fromjson | .event_type}'
 *     - '@hazard_ingest{$.stdout.text | fromjson | .event_area}'
 *     - '@hazard_ingest{$.stdout.text | fromjson | .event_severity}'
 *     - '@hazard_ingest{$.stdout.text | fromjson | .event_description}'
 *     - $telegram_bot_token
 *     - $telegram_chat_id
 *     timeout_ms: 10000
 * permissions:
 * - --allow-net=cap-sources.s3.amazonaws.com,api.telegram.org
 * ---
 */

const { FlowOutput, isProcessExecBody, loadPresentationContext, stepName } =
  await import("__ROTE_PRESENTATION_SDK__");

const out = new FlowOutput();
const ctx = await loadPresentationContext();

const step = ctx.requireAvailable(stepName("coordinate_event"));

if (!isProcessExecBody(step.body)) {
  throw new Error("coordinate_event did not record a process.exec observation");
}

if (step.body.status.exit.kind !== "code" || step.body.status.exit.code !== 0) {
  throw new Error(
    `coordinate_event failed: ${step.body.stderr?.text ?? "no stderr captured"}`,
  );
}

const stdout = step.body.stdout?.text;

if (stdout === undefined) {
  throw new Error("coordinate_event captured no stdout");
}

let result: unknown;

try {
  result = JSON.parse(stdout);
} catch {
  throw new Error("coordinate_event produced invalid JSON");
}

if (
  typeof result !== "object" ||
  result === null ||
  !("success" in result)
) {
  throw new Error("coordinate_event returned an invalid result");
}

const success = (result as { success: boolean }).success;

out.human(
  success
    ? "Neer Nexus coordination decision completed."
    : "Neer Nexus could not produce a coordination decision.",
);

out.summary(
  success
    ? "Coastal emergency coordination decision completed."
    : "Coastal emergency coordination decision failed.",
);

out.result(result);

