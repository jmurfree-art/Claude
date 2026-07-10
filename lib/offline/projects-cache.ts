/**
 * Local IndexedDB cache of the user's projects, used to support offline
 * viewing. The cache is kept as an exact mirror of the latest server list.
 */

import type { Project } from "@/types/database";
import { idbClear, idbGet, idbGetAll, idbPut, PROJECTS_STORE } from "./db";

/**
 * Replaces the cached project list with the given projects. Clears the
 * "projects" store first so the cache never contains stale/deleted entries.
 */
export async function cacheProjects(projects: Project[]): Promise<void> {
  try {
    await idbClear(PROJECTS_STORE);
    for (const project of projects) {
      await idbPut<Project>(PROJECTS_STORE, project);
    }
  } catch {
    // fail soft: caching must never crash the UI
  }
}

/** Returns all cached projects, sorted by created_at descending (newest first). */
export async function getCachedProjects(): Promise<Project[]> {
  try {
    const projects = await idbGetAll<Project>(PROJECTS_STORE);
    return [...projects].sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}

/** Returns a single cached project by id, or undefined if not cached / unavailable. */
export async function getCachedProject(id: string): Promise<Project | undefined> {
  try {
    return await idbGet<Project>(PROJECTS_STORE, id);
  } catch {
    return undefined;
  }
}
