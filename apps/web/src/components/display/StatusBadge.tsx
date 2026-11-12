import type { RiskLevel } from '../../api/contract';
import { riskLabel } from '../../i18n/en';
import { cn } from '../cn';
import { CircleCheck, ClockAlert, Eye, PackageCheck, TriangleAlert, type LucideIcon } from '../icons';

/** UI plan §2.2. Status is colour + icon + text, always (AC-A11Y.1). */
export type StatusKind = RiskLevel | 'ARRIVED' | 'DELIVERED';

interface StatusStyle {
  label: string;
  icon: LucideIcon;
  text: string;
  tint: string;
  bar: string;
}

export const statusStyles: Record<StatusKind, StatusStyle> = {
  ON_TRACK: { label: riskLabel.ON_TRACK, icon: CircleCheck, text: 'text-success', tint: 'bg-success-tint', bar: 'bg-success' },
  WATCH: { label: riskLabel.WATCH, icon: Eye, text: 'text-warning', tint: 'bg-warning-tint', bar: 'bg-warning' },
  AT_RISK: { label: riskLabel.AT_RISK, icon: TriangleAlert, text: 'text-danger', tint: 'bg-danger-tint', bar: 'bg-danger' },
  LATE: { label: riskLabel.LATE, icon: ClockAlert, text: 'text-late', tint: 'bg-late-tint', bar: 'bg-late' },
  ARRIVED: { label: 'Arrived', icon: PackageCheck, text: 'text-success', tint: 'bg-success-tint', bar: 'bg-success' },
  DELIVERED: { label: 'Delivered', icon: PackageCheck, text: 'text-success', tint: 'bg-success-tint', bar: 'bg-success' },
};

export function StatusBadge({ status, size = 'md', className }: { status: StatusKind; size?: 'sm' | 'md'; className?: string }) {
  const s = statusStyles[status];
  const Icon = s.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-small' : 'h-6 px-2.5 text-small',
        s.text,
        s.tint,
        className,
      )}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2} />
      {s.label}
    </span>
  );
}

/** Pick the badge for a shipment: delivery/arrival facts first, else the risk level. */
export function statusForShipment(s: {
  deliveredAt: string | null;
  arrivedAt: string | null;
  riskLevel: RiskLevel | null;
}): StatusKind | null {
  if (s.deliveredAt) return 'DELIVERED';
  if (s.arrivedAt) return 'ARRIVED';
  return s.riskLevel;
}
