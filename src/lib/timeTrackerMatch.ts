import type { TrackerProject } from "./timeTracker";

export interface NameOnlyProject {
  name: string;
}

export interface MatchSuggestion {
  trackerId: string;
  trackerName: string;
  skillhiveName: string;
  score: number; // 0..1
  method: "exact" | "contains" | "fuzzy";
}

const SUGGEST_THRESHOLD = 0.7;

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_\-\s]+/g, "")
    .trim();
}

function basename(pathish: string): string {
  const parts = pathish.split(/[\\/]/);
  return parts[parts.length - 1] || pathish;
}

/** Levenshtein distance (iterative, two-row). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Suggest which of the user's tracker projects map onto each SkillHive
 * project. Purely advisory — mappings are always confirmed by the user.
 */
export function suggestMatches(
  trackerProjects: TrackerProject[],
  skillhiveProjects: NameOnlyProject[],
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];

  for (const tp of trackerProjects) {
    for (const sp of skillhiveProjects) {
      const t = normalize(tp.name);
      const s = normalize(sp.name);

      let score = 0;
      let method: MatchSuggestion["method"] | null = null;

      if (t === s) {
        score = 1;
        method = "exact";
      } else if (
        s.includes(t) ||
        t.includes(s) ||
        t.includes(normalize(basename(sp.name))) ||
        normalize(basename(tp.name)) === s
      ) {
        score = 0.85;
        method = "contains";
      } else {
        const sim = similarity(t, s);
        if (sim >= SUGGEST_THRESHOLD) {
          score = sim * 0.8; // fuzzy never outranks structural matches
          method = "fuzzy";
        }
      }

      if (method && score >= SUGGEST_THRESHOLD) {
        suggestions.push({
          trackerId: tp.tracker_project_id,
          trackerName: tp.name,
          skillhiveName: sp.name,
          score: Number(score.toFixed(2)),
          method,
        });
      }
    }
  }

  // Best tracker match per SkillHive project first, then by confidence.
  return suggestions.sort((a, b) => b.score - a.score);
}
