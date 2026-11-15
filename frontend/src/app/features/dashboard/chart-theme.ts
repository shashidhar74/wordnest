import type { Options, XAxisOptions, YAxisOptions } from 'highcharts';
import { PostStatus } from '../../core/models';

/**
 * Colours for the charts, one set per theme. They match the tokens in tailwind.css
 * (--fg, --line, --brand …) and the status pill tones. Highcharts draws SVG with real
 * colour values, so it can't use CSS variables; the dashboard picks the set from ThemeService.
 */
export interface ChartPalette {
  fg: string;
  muted: string;
  subtle: string;
  line: string;
  lineStrong: string;
  surface: string;
  brand: string;
  good: string;
  status: Record<PostStatus, string>;
}

const LIGHT: ChartPalette = {
  fg: '#101828',
  muted: '#5d6879',
  subtle: '#98a2b3',
  line: '#e4e7ec',
  lineStrong: '#d0d5dd',
  surface: '#ffffff',
  brand: '#1a56c4',
  good: '#16a34a',
  status: {
    draft: '#98a2b3',
    pending: '#d97706',
    clarification: '#0e8fb8',
    published: '#16a34a',
    rejected: '#dc2626',
    closed: '#475467',
  },
};

const DARK: ChartPalette = {
  fg: '#e6eaf0',
  muted: '#9aa6b8',
  subtle: '#677489',
  line: '#243044',
  lineStrong: '#33415a',
  surface: '#111722',
  brand: '#6ea4ff',
  good: '#34c56c',
  status: {
    draft: '#7c879a',
    pending: '#f0a63a',
    clarification: '#38bdf8',
    published: '#34c56c',
    rejected: '#f26a6a',
    closed: '#a3b0c4',
  },
};

export function chartPalette(theme: 'light' | 'dark'): ChartPalette {
  return theme === 'dark' ? DARK : LIGHT;
}

/** Adds transparency to a #rrggbb colour, e.g. alpha(c, 0.25). */
export function alpha(hex: string, amount: number): string {
  return (
    hex +
    Math.round(amount * 255)
      .toString(16)
      .padStart(2, '0')
  );
}

/** Settings every dashboard chart shares: no title/legend/credits, compact spacing, themed tooltip. */
export function commonOptions(p: ChartPalette): Options {
  return {
    chart: {
      backgroundColor: 'transparent',
      style: { fontFamily: 'inherit' },
      spacing: [6, 2, 2, 2],
    },
    title: { text: '' },
    credits: { enabled: false },
    legend: { enabled: false },
    tooltip: {
      backgroundColor: p.surface,
      borderColor: p.lineStrong,
      borderRadius: 6,
      shadow: false,
      style: { color: p.fg, fontSize: '11.5px' },
    },
  };
}

export function xAxisStyle(p: ChartPalette): XAxisOptions {
  return {
    labels: { style: { color: p.muted, fontSize: '10.5px' } },
    lineColor: p.line,
    tickColor: p.line,
    gridLineColor: p.line,
    title: { text: undefined },
  };
}

export function yAxisStyle(p: ChartPalette): YAxisOptions {
  return {
    labels: { style: { color: p.muted, fontSize: '10.5px' } },
    gridLineColor: p.line,
    title: { text: undefined },
  };
}
