"use client";

// The recharts implementations. Import from "./Charts", which loads this
// module (and recharts, ~400 kB) only when a chart actually renders.

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useChartColors } from "./useChartColors";

type Point = Record<string, string | number | null | undefined>;

interface AxisChartProps {
  data: Point[];
  xKey: string;
  series: { key: string; label: string; color?: string }[];
  height?: number;
  /** number formatter for axis + tooltip */
  format?: (value: number) => string;
  xFormat?: (value: string) => string;
  stacked?: boolean;
}

const num = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10);

function useTooltipStyle() {
  const c = useChartColors();
  return {
    contentStyle: {
      background: c.surface,
      border: `1px solid ${c.border}`,
      borderRadius: 10,
      color: c.text,
      fontSize: 12
    },
    labelStyle: { color: c.muted, fontWeight: 600 },
    itemStyle: { color: c.text }
  };
}

export function LineChartCard({
  data,
  xKey,
  series,
  height = 260,
  format = num,
  xFormat
}: AxisChartProps) {
  const c = useChartColors();
  const tooltip = useTooltipStyle();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: c.muted, fontSize: 11 }}
          tickFormatter={xFormat}
          stroke={c.border}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 11 }}
          tickFormatter={format}
          stroke={c.border}
          width={44}
        />
        <Tooltip {...tooltip} formatter={(v: number) => format(v)} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color ?? c.categorical[i % c.categorical.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaChartCard({
  data,
  xKey,
  series,
  height = 260,
  format = num,
  xFormat
}: AxisChartProps) {
  const c = useChartColors();
  const tooltip = useTooltipStyle();
  const uid = useId().replace(/:/g, "");
  const gradId = (i: number) => `grad-${uid}-${i}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <defs>
          {series.map((s, i) => {
            const color = s.color ?? c.categorical[i % c.categorical.length];
            return (
              <linearGradient key={s.key} id={gradId(i)} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fill: c.muted, fontSize: 11 }}
          tickFormatter={xFormat}
          stroke={c.border}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 11 }}
          tickFormatter={format}
          stroke={c.border}
          width={44}
        />
        <Tooltip {...tooltip} formatter={(v: number) => format(v)} />
        {series.map((s, i) => {
          const color = s.color ?? c.categorical[i % c.categorical.length];
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradId(i)})`}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BarChartCard({
  data,
  xKey,
  series,
  height = 260,
  format = num,
  xFormat,
  stacked,
  layout = "horizontal"
}: AxisChartProps & { layout?: "horizontal" | "vertical" }) {
  const c = useChartColors();
  const tooltip = useTooltipStyle();
  const vertical = layout === "vertical";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={layout}
        margin={{ top: 8, right: 12, bottom: 4, left: vertical ? 8 : -8 }}
      >
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" horizontal={!vertical} vertical={vertical} />
        {vertical ? (
          <>
            <XAxis type="number" tick={{ fill: c.muted, fontSize: 11 }} tickFormatter={format} stroke={c.border} />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fill: c.muted, fontSize: 11 }}
              tickFormatter={xFormat}
              stroke={c.border}
              width={120}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tick={{ fill: c.muted, fontSize: 11 }}
              tickFormatter={xFormat}
              stroke={c.border}
              minTickGap={12}
            />
            <YAxis tick={{ fill: c.muted, fontSize: 11 }} tickFormatter={format} stroke={c.border} width={44} />
          </>
        )}
        <Tooltip {...tooltip} formatter={(v: number) => format(v)} cursor={{ fill: c.border, opacity: 0.3 }} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId={stacked ? "a" : undefined}
            fill={s.color ?? c.categorical[i % c.categorical.length]}
            radius={vertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DonutProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  format?: (value: number) => string;
}

export function DonutChartCard({ data, height = 240, format = num }: DonutProps) {
  const c = useChartColors();
  const tooltip = useTooltipStyle();
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="label"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          stroke={c.surface}
        >
          {data.map((d, i) => (
            <Cell key={d.label} fill={d.color ?? c.categorical[i % c.categorical.length]} />
          ))}
        </Pie>
        <Tooltip
          {...tooltip}
          formatter={(v: number) => [
            `${format(v)}${total > 0 ? ` (${Math.round((v / total) * 100)}%)` : ""}`
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({
  data,
  dataKey = "value",
  height = 40,
  color
}: {
  data: Point[];
  dataKey?: string;
  height?: number;
  color?: string;
}) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color ?? c.primary}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
