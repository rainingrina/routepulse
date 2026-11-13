import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Dialog as D } from 'radix-ui';
import type { ShipmentListItemCoordinator } from '../../api/contract';
import { useMapLayers, usePositions, useShipments } from '../../api/hooks/world';
import { useSync } from '../../api/sync';
import { useCurrentUser } from '../../app/currentUser';
import { BP, useMediaQuery } from '../../app/useMediaQuery';
import { Skeleton } from '../../components/display/basics';
import { Banner, ErrorState } from '../../components/display/feedback';
import { Button } from '../../components/primitives/Button';
import { SegmentedControl, TabsContent, TabsList, TabsRoot, TabsTrigger } from '../../components/primitives/radix';
import { PanelRight as PanelRightIcon, X as XIcon } from '../../components/icons';
import { formatFull } from '../../i18n/format';
import { MapView, type MapTruck } from '../../map/MapView';
import { SimulationDock } from '../simulation/SimulationDock';
import { ActivityFeed } from './ActivityFeed';
import { AlertsPanel } from './AlertsPanel';
import { KpiStrip } from './KpiStrip';
import { filterShipments, parseLevelFilter, type LevelFilter } from './listFilters';
import { ShipmentList } from './ShipmentList';
import { useAtRiskNotifications } from './useAtRiskNotifications';
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
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const isXl = useMediaQuery(BP.xl);
  const isLg = useMediaQuery(BP.lg);

  const shipments = useShipments(LIST_QUERY);
  const layers = useMapLayers();
  const positions = usePositions();

  const all = useMemo(() => (shipments.data?.items ?? []) as ShipmentListItemCoordinator[], [shipments.data]);
  const visible = useMemo(() => filterShipments(all, level, query), [all, level, query]);


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

  // UI plan §6.6: one-time row pulse + one toast when shipments turn AT_RISK (server risk level).
  const highlight = useAtRiskNotifications(all, !!shipments.data, {
    viewOptions: (id) => {
      setOpenRecoveryNonce((n) => n + 1);
      select(id);
    },
    showAtRisk: () => setLevel('AT_RISK'),
  });

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

  const mapEl = layers.isPending ? (
    <Skeleton className="absolute inset-0 rounded-none" />
  ) : layers.isError ? (
    <ErrorState title="Couldn't load the map" error={layers.error} onRetry={() => void layers.refetch()} />
  ) : (
    <MapView className="absolute inset-0" layers={layers.data} trucks={trucks} selectedId={selectedId} hoveredId={hoveredId} onSelect={select} onHover={setHoveredId}>
      {user.role === 'COORDINATOR' ? <SimulationDock /> : null}
    </MapView>
  );
  const listEl = (
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
  );
  const frame = 'relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pt-3 xl:px-5">
        <div className="min-w-0">
          <h1 className="text-h2 text-text">Control tower</h1>
          <p className="text-small text-text-muted">
            Live shipments from Plant X · estimated arrival at the receiving gate
            {!isLg ? ' · best on a screen 1280 px and wider' : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isLg ? (
            <SegmentedControl<'map' | 'list'>
              label="Show map or shipment list"
              value={mobileView}
              onChange={setMobileView}
              options={[
                { value: 'map', label: 'Map' },
                { value: 'list', label: `Shipments (${visible.length})` },
              ]}
            />
          ) : null}
          {!isXl ? (
            <Button size="sm" icon={PanelRightIcon} onClick={() => setDrawerOpen(true)}>
              {selectedId ? 'Shipment' : 'Alerts & activity'}
            </Button>
          ) : null}
        </div>
      </div>
      <KpiStrip
        shipments={shipments}
        level={level}
        onLevel={setLevel}
        onShowAlerts={() => {
          select(null);
          setTab('alerts');
          if (!isXl) setDrawerOpen(true);
        }}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-3 pb-3 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_360px] 2xl:grid-cols-[360px_minmax(0,1fr)_400px] xl:px-5 xl:pb-5">
        {isLg || mobileView === 'list' ? <section aria-label="Shipments" className={`${frame} ${isLg ? '' : 'min-h-[70vh]'}`}>{listEl}</section> : null}
        {isLg || mobileView === 'map' ? (
          <div className={`${frame} min-h-[460px] lg:min-h-0`}>
            {mapEl}
            {positions.isError && !layers.isError ? (
              <div className="absolute top-3 left-3 z-10 max-w-[280px]">
                <Banner tone="warning" live>
                  Live truck positions are unavailable right now; the shipment list is current.
                </Banner>
              </div>
            ) : null}
          </div>
        ) : null}
        {isXl ? (
          <aside aria-label="Alerts, activity and selected shipment" className={frame}>
            {panel}
          </aside>
        ) : null}
      </div>
      {!isXl ? (
        <D.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-40 bg-ink-900/35 data-[state=open]:animate-[rp-fade_var(--rp-motion-base)_ease-out]" />
            <D.Content className="fixed inset-y-0 right-0 z-40 flex w-[420px] max-w-[100vw] flex-col bg-surface shadow-overlay data-[state=open]:animate-[rp-slide-in-right_var(--rp-motion-base)_var(--rp-ease)]">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <D.Title className="text-h3 text-text">{selectedId ? 'Selected shipment' : 'Alerts and activity'}</D.Title>
                <D.Close aria-label="Close panel" className="inline-flex size-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface-sunken">
                  <XIcon aria-hidden className="size-5" strokeWidth={1.5} />
                </D.Close>
              </div>
              <D.Description className="sr-only">Side panel</D.Description>
              <div className="flex min-h-0 flex-1 flex-col">{panel}</div>
            </D.Content>
          </D.Portal>
        </D.Root>
      ) : null}
    </div>
  );
}
