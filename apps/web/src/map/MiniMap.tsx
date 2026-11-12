import { useMapLayers, usePositions } from '../api/hooks/world';
import type { MapLayersResponse } from '../api/contract';
import { Skeleton } from '../components/display/basics';
import { Banner } from '../components/display/feedback';
import { cn } from '../components/cn';
import { MapView, type MapTruck } from './MapView';

/**
 * A small offline map for the portals and replay (#10, #11): only the given shipments' trucks and
 * the routes they use. `trucks` overrides live positions (replay shows a stored snapshot position).
 * Coordinates are display only (hand-traced demo geometry).
 */
export function MiniMap({
  shipmentIds,
  trucks,
  routeFilter,
  ariaLabel,
  className,
}: {
  shipmentIds: readonly string[];
  trucks?: MapTruck[];
  routeFilter?: (r: MapLayersResponse['routes'][number]) => boolean;
  ariaLabel: string;
  className?: string;
}) {
  const layers = useMapLayers();
  const positions = usePositions();
  const live: MapTruck[] = (positions.data?.items ?? []).filter((p) => shipmentIds.includes(p.shipmentId)).map((item) => ({ item, etaText: null }));
  const shown = trucks ?? live;
  const routeIds = new Set(shown.map((x) => x.item.routeId));

  if (layers.isPending) return <Skeleton className={className ?? 'h-60'} />;
  if (layers.isError) {
    return (
      <Banner tone="warning" className={className}>
        The map is unavailable right now.
      </Banner>
    );
  }
  const keep = routeFilter ?? ((r: MapLayersResponse['routes'][number]) => routeIds.has(r.id));
  const scoped: MapLayersResponse = { ...layers.data, routes: layers.data.routes.filter(keep), activeDisruptions: layers.data.activeDisruptions };
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border', className ?? 'h-60')}>
      <MapView className="absolute inset-0" layers={scoped} trucks={shown} ariaLabel={ariaLabel} legendOpen={false} />
    </div>
  );
}
