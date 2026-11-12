import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Dialog as D } from 'radix-ui';
import type { RiskLevel, ShipmentListItemCoordinator } from '../../api/contract';
import { useMapLayers, usePositions, useShipments } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { useCurrentUser } from '../../app/RoleGuard';
import { BP, useMediaQuery } from '../../app/useMediaQuery';
import { Skeleton } from '../../components/display/basics';
import { Banner, ErrorState } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '../../components/primitives/radix';
import { PanelRight as PanelRightIcon } from '../../components/icons';
import { formatFull } from '../../i18n/format';
import { MapView, type MapTruck } from '../../map/MapView';
import { SimulationDock } from '../simulation/SimulationDock';
import { ActivityFeed } from './ActivityFeed';
import { AlertsPanel } from './AlertsPanel';
import { KpiStrip } from './KpiStrip';
import { filterShipments, newlyAtRisk, parseLevelFilter, type LevelFilter } from './listFilters';
import { ShipmentList } from './ShipmentList';
import { ShipmentQuickPanel } from './ShipmentQuickPanel';

const LIST_QUERY = { status: 'live', sort: 'risk' } as const;

/** UI plan §6 — the showcase screen: KPI strip, risk-sorted list, map, alerts/activity or quick panel. */
export default function ControlTowerPage() {
  const user = useCurrentUser();
  const { sync } = useSync();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('selected');
  const level = parseLevelFilter(params.get('level'));
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tab, setTab] = useState<'alerts' | 'activity'>('alerts');
  const [openRecoveryNonce, setOpenRecoveryNonce] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isXl = useMediaQuery(BP.xl);
  const isLg = useMediaQuery(BP.lg);

  const shipments = useShipments(LIST_QUERY);
  const layers = useMapLayers();
  const positions = usePositions();

  const all = useMemo(() => (shipments.data?.items ?? []) as ShipmentListItemCoordinator[], [shipments.data]);
  const visible = useMemo(() => filterShipments(all, level, query), [all, level, query]);

  // UI plan §6.6: one-time highlight + polite announcement when a shipment turns AT_RISK.
  const prevLevels = useRef<Map<string, RiskLevel | null> | null>(null);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!shipments.data) return;
    const turned = newlyAtRisk(prevLevels.current, all);
    prevLevels.current = new Map(all.map((s) => [s.id, s.riskLevel]));
    if (turned.length === 0) return;
    setHighlight(new Set(turned.map((s) => s.id)));
    setAnnouncement(`${turned.map((s) => s.code).join(', ')} ${turned.length > 1 ? 'are' : 'is'} at risk of missing the promised time.`);
    const timer = setTimeout(() => setHighlight(new Set()), 600);
    return () => clearTimeout(timer);
  }, [all, shipments.data]);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const select = (id: string | null) => {
    setParam('selected', id);
    if (id && !isXl) setDrawerOpen(true);
  };
  const setLevel = (l: LevelFilter) => setParam('level', l === 'ALL' ? null : l);

  const etaById = useMemo(() => new Map(all.map((s) => [s.id, s.etaAt])), [all]);
  const trucks: MapTruck[] = useMemo(
    () =>
      (positions.data?.items ?? []).map((item) => {
        const eta = etaById.get(item.shipmentId);
        return { item, etaText: eta ? formatFull(eta) : null };
      }),
    [positions.data, etaById],
  );

  const panel = selectedId ? (
    <ShipmentQuickPanel key={`${selectedId}:${openRecoveryNonce}`} shipmentId={selectedId} simTime={sync?.simTime} onBack={() => select(null)} openRecovery={openRecoveryNonce > 0} />
  ) : (
    <TabsRoot value={tab} onValueChange={(v) => setTab(v as 'alerts' | 'activity')} className="flex min-h-0 flex-1 flex-col">
      <TabsList label="Alerts and activity">
        <TabsTrigger value="alerts">Alerts</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="alerts" className="min-h-0 flex-1 overflow-y-auto">
        <AlertsPanel
          onViewOptions={(id) => {
            setOpenRecoveryNonce((n) => n + 1);
            select(id);
          }}
        />
      </TabsContent>
      <TabsContent value="activity" className="min-h-0 flex-1 overflow-y-auto">
        <ActivityFeed />
      </TabsContent>
    </TabsRoot>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <h1 className="sr-only">Control tower</h1>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      {!isLg ? (
        <Banner tone="info" className="mx-4 mt-3">
          Best viewed on a larger screen. The control tower is designed for 1280 px and wider.
        </Banner>
      ) : null}
      <KpiStrip shipments={shipments} level={level} onLevel={setLevel} onShowAlerts={() => { select(null); setTab('alerts'); if (!isXl) setDrawerOpen(true); }} />
      <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-border lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)_400px]">
        <div className="flex max-h-[60vh] min-h-0 flex-col lg:max-h-none">
          <ShipmentList
            items={visible}
            totalCount={all.length}
            isPending={shipments.isPending}
            error={shipments.isError ? shipments.error : null}
            onRetry={() => void shipments.refetch()}
            level={level}
            onLevel={setLevel}
            query={query}
            onQuery={setQuery}
            selectedId={selectedId}
            onSelect={select}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            simTime={sync?.simTime}
            highlightIds={highlight}
          />
        </div>
        <div className="relative min-h-[420px]">
          {layers.isPending ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : layers.isError ? (
            <ErrorState title="Couldn't load the map" error={layers.error} onRetry={() => void layers.refetch()} />
          ) : (
            <MapView
              className="absolute inset-0"
              layers={layers.data}
              trucks={trucks}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={select}
              onHover={setHoveredId}
            >
              {user.role === 'COORDINATOR' ? <SimulationDock /> : null}
            </MapView>
          )}
          {!isXl ? (
            <Button size="sm" icon={PanelRightIcon} className="absolute top-3 left-3 z-10 shadow-sm" onClick={() => setDrawerOpen(true)}>
              {selectedId ? 'Shipment panel' : 'Alerts & activity'}
            </Button>
          ) : null}
        </div>
        {isXl ? <aside aria-label="Alerts, activity and selected shipment" className="flex min-h-0 flex-col border-l border-border bg-surface">{panel}</aside> : null}
      </div>
      {!isXl ? (
        <D.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-30 bg-navy-900/30" />
            <D.Content className="fixed inset-y-0 right-0 z-30 flex w-[400px] max-w-[100vw] flex-col bg-surface shadow-overlay">
              <D.Title className="sr-only">{selectedId ? 'Selected shipment' : 'Alerts and activity'}</D.Title>
              <D.Description className="sr-only">Side panel</D.Description>
              {panel}
            </D.Content>
          </D.Portal>
        </D.Root>
      ) : null}
    </div>
  );
}
