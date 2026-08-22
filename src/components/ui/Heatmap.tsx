import { useMemo } from "react";
import { useTokens } from "@/theme";
import type { HeatmapDay } from "@/lib/todayData";

export interface HeatmapProps {
  data: HeatmapDay[];
  /** Number of weeks (columns) to render. */
  weeks?: number;
  cellSize?: number;
  gap?: number;
  onDayClick?: (day: string) => void;
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * GitHub-style contribution heatmap, driven by per-day focus minutes.
 * Columns are weeks (oldest → newest), rows are days of the week.
 */
export function Heatmap({
  data,
  weeks = 26,
  cellSize = 11,
  gap = 3,
  onDayClick,
}: HeatmapProps) {
  const { colors } = useTokens();

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of data) map.set(d.day, d.minutes);
    return map;
  }, [data]);

  const cells = useMemo(() => {
    const days = 7 * weeks;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align start to a Sunday boundary for stable columns.
    const start = new Date(today);
    start.setDate(today.getDate() - (days - 1));
    start.setDate(start.getDate() - start.getDay());

    const out: { key: string; minutes: number; date: Date; future: boolean }[] =
      [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toKey(d);
      out.push({
        key,
        minutes: byDay.get(key) ?? 0,
        date: d,
        future: d.getTime() > today.getTime(),
      });
    }
    // Trim leading columns that are entirely before the window (not needed
    // since start is aligned), then group into columns of 7.
    return out;
  }, [weeks, byDay]);

  const columns = useMemo(() => {
    const cols: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      cols.push(cells.slice(i, i + 7));
    }
    return cols;
  }, [cells]);

  function colorFor(minutes: number, future: boolean): string {
    if (future) return "transparent";
    if (minutes <= 0) return colors.overlay.press;
    const base = colors.surface.skillhive;
    if (minutes < 30) return base + "2e";
    if (minutes < 60) return base + "59";
    if (minutes < 120) return base + "99";
    return base;
  }

  return (
    <div style={{ display: "flex", gap, overflowX: "auto", paddingBottom: 4 }}>
      {columns.map((col, ci) => (
        <div
          key={ci}
          style={{ display: "flex", flexDirection: "column", gap }}
        >
          {col.map((cell) => (
            <div
              key={cell.key}
              title={
                cell.future
                  ? ""
                  : `${cell.key} · ${cell.minutes}m focus`
              }
              onClick={cell.future ? undefined : () => onDayClick?.(cell.key)}
              style={{
                width: cellSize,
                height: cellSize,
                borderRadius: 2,
                background: colorFor(cell.minutes, cell.future),
                cursor: cell.future ? "default" : onDayClick ? "pointer" : "default",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default Heatmap;
