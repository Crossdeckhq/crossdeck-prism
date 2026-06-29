/**
 * Crossdeck AI — connector session state.
 *
 * A workspace key (cd_wk_) reads many apps, so every data call must name a
 * `project`. To keep conversation natural ("switch to biotree, now show
 * revenue") we hold the current project here, shared across the tool + UI
 * modules. An explicit per-call `project` always wins; an env default
 * (CROSSDECK_PROJECT) is the final fallback. (stdio is single-session, so
 * module state is the correct scope.)
 */

let currentProject: string | undefined;
const DEFAULT_PROJECT = process.env.CROSSDECK_PROJECT?.trim() || undefined;

export function setCurrentProject(p: string): void {
  currentProject = p.trim() || undefined;
}

export function getCurrentProject(): string | undefined {
  return currentProject;
}

export function resolveProject(explicit?: string): string | undefined {
  return (explicit && explicit.trim()) || currentProject || DEFAULT_PROJECT;
}
