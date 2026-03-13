import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { listEnabledDingtalkAccounts, resolveDingtalkAccount } from "./accounts.js";
import {
  monitorSingleAccount,
  resolveReactionSyntheticEvent,
  type DingtalkReactionCreatedEvent,
} from "./monitor.account.js";
import {
  clearDingtalkWebhookRateLimitStateForTest,
  getDingtalkWebhookRateLimitStateSizeForTest,
  isWebhookRateLimitedForTest,
  stopDingtalkMonitorState,
} from "./monitor.state.js";

export type MonitorDingtalkOpts = {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
};

export {
  clearDingtalkWebhookRateLimitStateForTest,
  getDingtalkWebhookRateLimitStateSizeForTest,
  isWebhookRateLimitedForTest,
  resolveReactionSyntheticEvent,
};
export type { DingtalkReactionCreatedEvent };

export async function monitorDingtalkProvider(opts: MonitorDingtalkOpts = {}): Promise<void> {
  const cfg = opts.config;
  if (!cfg) {
    throw new Error("Config is required for DingTalk monitor");
  }

  const log = opts.runtime?.log ?? console.log;

  if (opts.accountId) {
    const account = resolveDingtalkAccount({ cfg, accountId: opts.accountId });
    if (!account.enabled || !account.configured) {
      throw new Error(`DingTalk account "${opts.accountId}" not configured or disabled`);
    }
    return monitorSingleAccount({
      cfg,
      account,
      runtime: opts.runtime,
      abortSignal: opts.abortSignal,
    });
  }

  const accounts = listEnabledDingtalkAccounts(cfg);
  if (accounts.length === 0) {
    throw new Error("No enabled DingTalk accounts configured");
  }

  log(
    `dingtalk-connector: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(", ")}`,
  );

  const monitorPromises: Promise<void>[] = [];
  for (const account of accounts) {
    if (opts.abortSignal?.aborted) {
      log("dingtalk-connector: abort signal received during startup preflight; stopping startup");
      break;
    }

    monitorPromises.push(
      monitorSingleAccount({
        cfg,
        account,
        runtime: opts.runtime,
        abortSignal: opts.abortSignal,
      }),
    );
  }

  await Promise.all(monitorPromises);
}

export function stopDingtalkMonitor(accountId?: string): void {
  stopDingtalkMonitorState(accountId);
}
