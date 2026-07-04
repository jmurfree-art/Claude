import "server-only";

import {
  LipSyncProviderError,
  type LipSyncInput,
  type LipSyncJob,
  type LipSyncJobStatus,
  type LipSyncProvider,
} from "../types";

/** Wall-clock time a mock lip-sync job spends in each phase. */
const PENDING_MS = 4_000;
const PROCESSING_MS = 14_000;

const FALLBACK_VIDEO_URL =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";

const JOB_ID_PREFIX = "mocklip_";

/**
 * Development provider used when no lip-sync vendor credentials are set.
 *
 * Simulates the full render lifecycle statelessly: the creation timestamp
 * and the (optional) source video URL are both embedded in the job ID so
 * status can be derived without any persisted state, even across restarts.
 */
export class MockLipSyncProvider implements LipSyncProvider {
  readonly name = "mock";

  async createLipSyncJob(input: LipSyncInput): Promise<LipSyncJob> {
    const jobId = `${JOB_ID_PREFIX}${Date.now()}_${encodeURIComponent(
      input.sourceVideoUrl ?? ""
    )}`;
    return { provider: this.name, jobId, status: "pending" };
  }

  async getLipSyncStatus(jobId: string): Promise<LipSyncJobStatus> {
    if (!jobId.startsWith(JOB_ID_PREFIX)) {
      throw new LipSyncProviderError(
        `Malformed mock lip-sync job ID: ${jobId}`,
        this.name,
        400
      );
    }

    const rest = jobId.slice(JOB_ID_PREFIX.length);
    const separatorIndex = rest.indexOf("_");
    const timestampPart =
      separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
    const encodedUrlPart =
      separatorIndex === -1 ? "" : rest.slice(separatorIndex + 1);

    const createdAt = Number(timestampPart);
    if (!Number.isFinite(createdAt)) {
      throw new LipSyncProviderError(
        `Malformed mock lip-sync job ID: ${jobId}`,
        this.name,
        400
      );
    }

    let embeddedUrl = "";
    try {
      embeddedUrl = decodeURIComponent(encodedUrlPart);
    } catch {
      throw new LipSyncProviderError(
        `Malformed mock lip-sync job ID: ${jobId}`,
        this.name,
        400
      );
    }

    const elapsed = Date.now() - createdAt;
    if (elapsed < PENDING_MS) {
      return { status: "pending", outputVideoUrl: null, error: null };
    }
    if (elapsed < PENDING_MS + PROCESSING_MS) {
      return { status: "processing", outputVideoUrl: null, error: null };
    }
    return {
      status: "completed",
      outputVideoUrl: embeddedUrl || FALLBACK_VIDEO_URL,
      error: null,
    };
  }
}
