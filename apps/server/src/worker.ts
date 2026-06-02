import { bootstrap } from "global-agent";

bootstrap();

if (process.env.GLOBAL_AGENT_HTTP_PROXY) {
  const { ProxyAgent, setGlobalDispatcher } = await import("undici");
  setGlobalDispatcher(new ProxyAgent(process.env.GLOBAL_AGENT_HTTP_PROXY));
}

import { executeBackgroundJob } from "./features/jobs/job-executor.js";
import { createJobService } from "./features/jobs/job-service.js";
import {
  applyEffectiveProviderEnv,
  createSettingsService,
  LOCAL_WORKSPACE_ID,
} from "./features/settings/settings-service.js";
import { registerAllProviders } from "./generation/providers/register-all.js";
import { loadServerEnv } from "./config/env.js";
import { createLocalStore } from "./local/store.js";

const host = process.env.HOST ?? "127.0.0.1";
const env = loadServerEnv();
const pollIntervalMs = env.workerPollIntervalMs ?? 1_000;
const workerId = env.workerId ?? "worker-1";

registerAllProviders(env);

const store = createLocalStore({
  assetBaseUrl: `http://${host}:${env.port}`,
});
const jobService = createJobService(store);
const settingsService = createSettingsService(store, env);

async function tick() {
  const jobs = await jobService.claimPendingJobs(
    workerId,
    env.workerMaxBatchSize ?? 4,
  );
  for (const job of jobs) {
    const effectiveEnv = await settingsService.getEffectiveServerEnv(
      LOCAL_WORKSPACE_ID,
    );
    applyEffectiveProviderEnv(effectiveEnv);
    await executeBackgroundJob(store, jobService, job, effectiveEnv);
  }
}

async function loop() {
  console.log(`[aimc-worker] polling local jobs as ${workerId}`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error("[aimc-worker] tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

await loop();
