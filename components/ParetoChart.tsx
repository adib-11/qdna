"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PARETO_TARGET_PCT } from "@/lib/config";
import type { ParetoPoint } from "@/lib/types";

/**
 * Palette is deliberately two-valued: Notion blue for the bars, ink-black alpha
 * for everything structural. A Pareto chart's job is to make one crossing point
 * obvious, and extra hues only compete with it.
 */
const BAR_FILL = "var(--color-notion-blue)";
const LINE_STROKE = "rgba(0,0,0,0.95)";
const AXIS_COLOR = "rgba(0,0,0,0.4)";
const GRID_COLOR = "rgba(0,0,0,0.08)";

/** Enough room per topic that the axis labels stay readable; scroll past that. */
const PX_PER_TOPIC = 68;

function truncate(label: string, max = 16): string {
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

export function ParetoChart({ pareto }: { pareto: ParetoPoint[] }) {
  if (pareto.length === 0) return null;

  const data = pareto.map((point, index) => ({
    ...point,
    rank: index + 1,
    short: truncate(point.topic),
  }));

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-pure-white">
      <div className="p-[var(--card-padding)] pb-[8px]">
        <h2 className="text-heading-sm font-bold tracking-[-0.242px]">
          Pareto coverage
        </h2>
        <p className="mt-[8px] text-body-sm text-graphite">
          Topics ranked by how often they were asked, with cumulative coverage
          overlaid. The dashed line marks {PARETO_TARGET_PCT}% of every question
          in the corpus.
        </p>
      </div>

      <div className="overflow-x-auto px-[8px] pb-[var(--card-padding)]">
        <div
          style={{ minWidth: Math.max(560, data.length * PX_PER_TOPIC) }}
          className="h-[360px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 16, right: 16, bottom: 72, left: 0 }}
            >
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="short"
                interval={0}
                angle={-40}
                textAnchor="end"
                tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                stroke={GRID_COLOR}
              />
              <YAxis
                yAxisId="count"
                allowDecimals={false}
                tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                stroke={GRID_COLOR}
                label={{
                  value: "questions",
                  angle: -90,
                  position: "insideLeft",
                  fill: AXIS_COLOR,
                  fontSize: 12,
                }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                unit="%"
                tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                stroke={GRID_COLOR}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "none",
                  fontSize: 12,
                }}
                labelFormatter={(_label, payload) =>
                  payload?.[0]?.payload?.topic ?? ""
                }
                formatter={(value, name) =>
                  name === "cumulativePct"
                    ? [`${Number(value).toFixed(1)}%`, "cumulative"]
                    : [value, "questions"]
                }
              />
              <ReferenceLine
                yAxisId="pct"
                y={PARETO_TARGET_PCT}
                stroke={LINE_STROKE}
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                label={{
                  value: `${PARETO_TARGET_PCT}%`,
                  position: "right",
                  fill: AXIS_COLOR,
                  fontSize: 12,
                }}
              />
              <Bar
                yAxisId="count"
                dataKey="count"
                fill={BAR_FILL}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="cumulativePct"
                stroke={LINE_STROKE}
                strokeWidth={2}
                dot={{ r: 2.5, fill: LINE_STROKE, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
