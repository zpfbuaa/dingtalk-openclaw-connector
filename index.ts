/**
 * DingTalk Connector Plugin for OpenClaw
 *
 * 钉钉企业内部机器人插件，使用 Stream 模式连接，支持 AI Card 流式响应。
 * 已迁移到 OpenClaw SDK，支持多账号、安全策略等完整功能。
 * 
 * Last updated: 2026-03-24
 */

/**
 * DingTalk Connector Plugin for OpenClaw
 * 
 * 注意：本插件使用专用的 HTTP 客户端（见 src/utils/http-client.ts）
 * 不会影响 OpenClaw Gateway 和其他插件的网络请求
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { dingtalkPlugin } from "./src/channel.ts";
import { setDingtalkRuntime } from "./src/runtime.ts";
import { registerGatewayMethods } from "./src/gateway-methods.ts";

/**
 * 检查 OpenClaw SDK 版本兼容性
 * @param api OpenClaw Plugin API
 * @returns true 表示版本兼容，false 表示版本过低
 */
function checkSdkVersion(api: OpenClawPluginApi): boolean {
  try {
    // 检查是否存在新版 SDK 的关键 API
    // v0.8.4+ 需要 core.channel.routing.buildAgentSessionKey 方法
    const hasNewRoutingApi = !!(api.runtime?.core?.channel?.routing?.buildAgentSessionKey);
    
    if (!hasNewRoutingApi) {
      console.error('\n' + '='.repeat(80));
      console.error('❌ OpenClaw SDK 版本过低');
      console.error('='.repeat(80));
      console.error('');
      console.error('dingtalk-connector v0.8.4+ 需要 OpenClaw SDK v2026.3.22 或更高版本。');
      console.error('');
      console.error('当前 OpenClaw SDK 版本过低，缺少必要的 API：');
      console.error('  - core.channel.routing.buildAgentSessionKey');
      console.error('');
      console.error('请升级 OpenClaw 到最新版本：');
      console.error('');
      console.error('  npm install -g openclaw@latest');
      console.error('  # 或');
      console.error('  yarn global add openclaw@latest');
      console.error('');
      console.error('升级后重启 OpenClaw Gateway 即可。');
      console.error('');
      console.error('如果需要使用旧版 OpenClaw，请降级 dingtalk-connector：');
      console.error('');
      console.error('  npm install @dingtalk-real-ai/dingtalk-connector@0.8.3');
      console.error('');
      console.error('='.repeat(80));
      console.error('');
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('检查 OpenClaw SDK 版本时出错:', err);
    return false;
  }
}

export default function register(api: OpenClawPluginApi) {
  // 版本兼容性检查
  if (!checkSdkVersion(api)) {
    console.error('[dingtalk-connector] 插件加载失败：OpenClaw SDK 版本不兼容');
    console.error('[dingtalk-connector] 请按照上述提示升级 OpenClaw 或降级 dingtalk-connector');
    // 不抛出异常，避免影响其他插件加载，但不注册任何功能
    return;
  }
  
  setDingtalkRuntime(api.runtime);
  api.registerChannel({ plugin: dingtalkPlugin });
  
  // 注册 Gateway Methods
  registerGatewayMethods(api);
  
  console.log('[dingtalk-connector] v0.8.4 已成功加载（需要 OpenClaw SDK v2026.3.22+）');
}
