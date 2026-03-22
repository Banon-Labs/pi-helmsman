import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	formatVoiceNotifyConfig,
	resolveVoiceNotifyConfig,
	SPEAK_COMMAND,
	VOICE_CUSTOM_TYPE,
	VOICE_STATUS_COMMAND,
	VOICE_STATUS_KEY,
} from "./smart-voice-notify/config.js";
import { formatVoiceNotifyStatus, getVoiceNotifyStatus, speakVoiceMessage } from "./smart-voice-notify/runtime.js";

function updateVoiceStatus(ctx: any, ready: boolean): void {
	ctx.ui.setStatus(VOICE_STATUS_KEY, ctx.ui.theme.fg(ready ? "success" : "warning", `voice:${ready ? "on" : "off"}`));
}

export default function smartVoiceNotifyExtension(pi: ExtensionAPI) {
	const config = resolveVoiceNotifyConfig();

	pi.on("session_start", async (_event, ctx) => {
		const status = getVoiceNotifyStatus(config);
		updateVoiceStatus(ctx, status.ready);
	});

	pi.registerCommand(VOICE_STATUS_COMMAND, {
		description: "Show smart voice-notify configuration and detected provider status",
		handler: async (_args, ctx) => {
			const status = getVoiceNotifyStatus(config);
			updateVoiceStatus(ctx, status.ready);
			const content = [formatVoiceNotifyConfig(config), "", formatVoiceNotifyStatus(status)].join("\n");
			ctx.ui.notify(`Voice notify ${status.ready ? "ready" : "inactive"}`, status.ready ? "info" : "warning");
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
			updateVoiceStatus(ctx, status.ready);
			const content = [formatVoiceNotifyConfig(config), "", formatVoiceNotifyStatus(status), "", `Message: ${message}`].join("\n");
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
