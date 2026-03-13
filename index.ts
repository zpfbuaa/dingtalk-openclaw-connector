/**
 * DingTalk Connector Plugin for OpenClaw
 *
 * 钉钉企业内部机器人插件，使用 Stream 模式连接，支持 AI Card 流式响应。
 * 已迁移到 OpenClaw SDK，支持多账号、安全策略等完整功能。
 */

import type { PluginApi } from "openclaw/plugin-sdk";
import { dingtalkPlugin } from "./src/channel.js";

export default function register(api: PluginApi) {
  api.registerChannel({ plugin: dingtalkPlugin });
}
