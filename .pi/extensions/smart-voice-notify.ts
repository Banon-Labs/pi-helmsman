import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	formatVoiceNotifyConfig,
	resolveVoiceNotifyConfig,
	SPEAK_COMMAND,
	VOICE_CUSTOM_TYPE,
	VOICE_STATUS_COMMAND,
	VOICE_STATUS_KEY,
} from "./smart-voice-notify/config.js";
import { formatVoiceNotifyStatus, getVoiceNotifyError, getVoiceNotifyStatus, speakVoiceMessage } from "./smart-voice-notify/runtime.js";

function updateVoiceStatus(ctx: any, status: { ready: boolean; broken: boolean }): void {
	const tone = status.broken ? "error" : status.ready ? "success" : "warning";
	const label = status.broken ? "voice:broken" : status.ready ? "voice:on" : "voice:off";
	ctx.ui.setStatus(VOICE_STATUS_KEY, ctx.ui.theme.fg(tone, label));
}

export default function smartVoiceNotifyExtension(pi: ExtensionAPI) {
	const config = resolveVoiceNotifyConfig();

	pi.on("session_start", async (_event, ctx) => {
		const status = getVoiceNotifyStatus(config);
		updateVoiceStatus(ctx, status);
		if (status.broken) {
			ctx.ui.notify(getVoiceNotifyError(status) ?? status.reason, "warning");
		}
	});

	pi.registerCommand(VOICE_STATUS_COMMAND, {
		description: "Show smart voice-notify configuration, config source/path help, and detected provider status",
		handler: async (_args, ctx) => {
			const status = getVoiceNotifyStatus(config);
			updateVoiceStatus(ctx, status);
			const content = [formatVoiceNotifyConfig(config), "", formatVoiceNotifyStatus(status)].join("\n");
			ctx.ui.notify(
				status.broken ? `Voice notify broken: ${status.reason}` : `Voice notify ${status.ready ? "ready" : "inactive"}`,
				status.broken ? "warning" : status.ready ? "info" : "warning",
			);
			pi.sendMessage({
				customType: VOICE_CUSTOM_TYPE,
				content,
				details: { config, status },
				display: true,
			});
		},
	});

	pi.registerCommand(SPEAK_COMMAND, {
		description: "Speak a short message using the selected voice backend",
		handler: async (args, ctx) => {
			const message = args.trim();
			if (!message) {
				ctx.ui.notify(`Usage: /${SPEAK_COMMAND} <message>`, "warning");
				return;
			}
			const status = speakVoiceMessage(message, config);
			updateVoiceStatus(ctx, status);
			const content = [formatVoiceNotifyConfig(config), "", formatVoiceNotifyStatus(status), "", `Message: ${message}`].join("\n");
			const error = getVoiceNotifyError(status);
			if (error) {
				ctx.ui.notify(error, "error");
				pi.sendMessage({
					customType: VOICE_CUSTOM_TYPE,
					content,
					details: { config, status, message, error },
					display: true,
				});
				throw new Error(error);
			}
			ctx.ui.notify(status.ready ? "Voice message dispatched" : `Voice message not spoken: ${status.reason}`, status.ready ? "success" : "warning");
			pi.sendMessage({
				customType: VOICE_CUSTOM_TYPE,
				content,
				details: { config, status, message },
				display: true,
			});
		},
	});
}
