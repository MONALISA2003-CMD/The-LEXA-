export type DashboardPeriod = 'today' | '7d' | '30d' | '90d' | '12m';
export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  unit: 'currency' | 'number' | 'percent' | 'duration';
  changePercent?: number | null;
  previousValue?: number | null;
  trend?: 'up' | 'down' | 'flat';
  description?: string;
  href?: string;
}
export interface DashboardTrendPoint { label: string; value: number; comparisonValue?: number | null; }
export interface DashboardBreakdown { label: string; value: number; color?: string; }
export interface DashboardActivity { id: string; kind: string; summary: string; actorName?: string; occurredAt: string; href?: string; }
export interface DashboardException { id: string; severity: 'info' | 'warning' | 'critical'; title: string; detail: string; href?: string; }
export interface DashboardAnalytics {
  generatedAt: string;
  period: DashboardPeriod;
  comparisonPeriod?: string;
  kpis: DashboardKpi[];
  salesTrend: DashboardTrendPoint[];
  salesByChannel: DashboardBreakdown[];
  stockHealth: DashboardBreakdown[];
  recentActivity: DashboardActivity[];
  exceptions: DashboardException[];
  sourceCoverage?: { sales: boolean; inventory: boolean; finance: boolean; crm: boolean; workforce: boolean };
}
