/**
 * Locally stored video drafts, allowing users to create and edit video
 * projects offline before they are synced/submitted to the server.
 */

import { idbDelete, idbGet, idbGetAll, idbPut, DRAFTS_STORE } from "./db";

export type VideoDraft = {
  id: string;
  title: string;
  script: string;
  language: string;
  avatarId: string;
  voiceId: string;
  backgroundId: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  updatedAt: string; // ISO timestamp
};

/** Returns all locally stored drafts, sorted by updatedAt descending (newest first). */
export async function listDrafts(): Promise<VideoDraft[]> {
  try {
    const drafts = await idbGetAll<VideoDraft>(DRAFTS_STORE);
    return [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

/** Returns a single draft by id, or undefined if not found / unavailable. */
export async function getDraft(id: string): Promise<VideoDraft | undefined> {
  try {
    return await idbGet<VideoDraft>(DRAFTS_STORE, id);
  } catch {
    return undefined;
  }
}

/**
 * Creates or updates a draft. Assigns a new id via crypto.randomUUID() when
 * absent, stamps updatedAt with the current time, persists it, and returns
 * the saved draft.
 */
export async function saveDraft(
  draft: Omit<VideoDraft, "id" | "updatedAt"> & { id?: string }
): Promise<VideoDraft> {
  const saved: VideoDraft = {
    ...draft,
    id: draft.id ?? crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await idbPut<VideoDraft>(DRAFTS_STORE, saved);
  } catch {
    // fail soft: caching must never crash the UI
  }

  return saved;
}

/** Deletes a draft by id. No-op when not found / unavailable. */
export async function deleteDraft(id: string): Promise<void> {
  try {
    await idbDelete(DRAFTS_STORE, id);
  } catch {
    // fail soft
  }
}
