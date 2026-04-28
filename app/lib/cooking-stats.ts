export type WeeklyCountRow = {
  weekStart: string;
  cookCount: number;
};

export type WeeklyCadencePoint = WeeklyCountRow & {
  label: string;
};

export type DormantRecipeInput = {
  id: string;
  title: string;
  cookCount: number;
  lastCookedAt: number;
};

export type DormantRecipe = DormantRecipeInput & {
  daysSinceCooked: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcWeek(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function buildWeeklyCadence(
  rows: WeeklyCountRow[],
  anchorDate = new Date(),
  weekCount = 12
): WeeklyCadencePoint[] {
  const byWeek = new Map(rows.map((row) => [row.weekStart, row.cookCount]));
  const anchorWeek = startOfUtcWeek(anchorDate);

  return Array.from({ length: weekCount }, (_, index) => {
    const week = new Date(anchorWeek);
    week.setUTCDate(anchorWeek.getUTCDate() - (weekCount - 1 - index) * 7);
    const weekStart = isoDate(week);
    return {
      weekStart,
      cookCount: byWeek.get(weekStart) ?? 0,
      label: `${week.getUTCMonth() + 1}/${week.getUTCDate()}`,
    };
  });
}

export function getAverageCooksPerWeek(points: WeeklyCadencePoint[]): number {
  if (points.length === 0) return 0;
  const total = points.reduce((sum, point) => sum + point.cookCount, 0);
  return total / points.length;
}

export function getDormantRecipes(
  recipes: DormantRecipeInput[],
  now = new Date(),
  staleAfterDays = 60
): DormantRecipe[] {
  const nowMs = now.getTime();
  return recipes
    .map((recipe) => ({
      ...recipe,
      daysSinceCooked: Math.floor((nowMs - recipe.lastCookedAt) / MS_PER_DAY),
    }))
    .filter((recipe) => recipe.daysSinceCooked >= staleAfterDays)
    .sort((a, b) => b.cookCount - a.cookCount || b.daysSinceCooked - a.daysSinceCooked);
}
