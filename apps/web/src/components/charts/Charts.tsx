"use client";

import { Suspense, lazy, type ComponentType } from "react";

/**
 * Chart components, code-split: recharts is ~400 kB of JavaScript, so it is
 * downloaded the first time a chart renders instead of with every page that
 * merely imports one. Same names and props as `RechartsCharts.tsx`; the
 * fallback reserves the chart's height so nothing jumps when it arrives.
 */

type ChartsModule = typeof import("./RechartsCharts");
const load = () => import("./RechartsCharts");

function lazyChart<P extends { height?: number }>(
  name: string,
  pick: (m: ChartsModule) => ComponentType<P>,
  defaultHeight: number,
) {
  const Lazy = lazy(() => load().then((m) => ({ default: pick(m) }))) as unknown as ComponentType<P>;
  function LazyChart(props: P) {
    return (
      <Suspense
        fallback={
          <div
            aria-hidden="true"
            className="w-full animate-pulse rounded-control bg-app-soft/60"
            style={{ height: props.height ?? defaultHeight }}
          />
        }
      >
        <Lazy {...props} />
      </Suspense>
    );
  }
  LazyChart.displayName = name;
  return LazyChart;
}

export const LineChartCard = lazyChart("LineChartCard", (m) => m.LineChartCard, 260);
export const AreaChartCard = lazyChart("AreaChartCard", (m) => m.AreaChartCard, 260);
export const BarChartCard = lazyChart("BarChartCard", (m) => m.BarChartCard, 260);
export const DonutChartCard = lazyChart("DonutChartCard", (m) => m.DonutChartCard, 240);
export const Sparkline = lazyChart("Sparkline", (m) => m.Sparkline, 40);
