const homeDir = Deno.env.get("HOME") || Deno.env.get("USERPROFILE");

if (!homeDir) {
  throw new Error("Unable to resolve the user's home directory.");
}

const presentationSdk = await import(
  `${homeDir}/.rote/lib/sdk/ts/presentation.ts`
);

export const __ROTE_PRESENTATION_SDK__ = presentationSdk;

export const FlowOutput = presentationSdk.FlowOutput;
export const loadPresentationContext =
  presentationSdk.loadPresentationContext;
export const stepName = presentationSdk.stepName;
