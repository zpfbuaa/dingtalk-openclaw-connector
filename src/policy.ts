import type { ToolPolicy } from "openclaw/plugin-sdk";
import type { ResolvedDingtalkAccount } from "./types.js";

export function resolveDingtalkGroupToolPolicy(params: {
  account: ResolvedDingtalkAccount;
  groupId: string;
}): ToolPolicy | undefined {
  const { account, groupId } = params;
  const dingtalkCfg = account.config;

  // Check group-specific policy first
  const groupConfig = dingtalkCfg?.groups?.[groupId];
  if (groupConfig?.tools) {
    return groupConfig.tools;
  }

  // Fall back to account-level default (allow all)
  return { allow: ["*"] };
}
