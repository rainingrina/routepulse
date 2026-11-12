import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GeoJSONSource, LngLatBounds, Map as MlMap, Marker, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { MapLayersResponse, PositionItem } from '../api/contract';
import { IconButton } from '../components/primitives/Button';
import { Maximize2 } from '../components/icons';
import { boundsOf, midpoint, sliceLine, type LngLat } from './geometry';
import { DisruptionPill, PlantMarker, SiteMarker, TruckMarker, truckAriaLabel } from './markers/markers';
import { MapLegend } from './MapLegend';

// Worker served as a same-origin asset so the API's CSP (worker/script 'self') allows it — no blob: workers.
setWorkerUrl(workerUrl);

const ROUTES_SRC = 'routes';
const DISR_SRC = 'disruptions';

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Offline style (architecture §16): no tiles, no glyphs, no sprites. Basemap polygons pending task 10.1/10.2. */
function offlineStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'land', type: 'background', paint: { 'background-color': cssVar('--rp-map-land') } }],
  };
}

export interface MapTruck {
  item: PositionItem;
  /** Display text for the aria label, e.g. "Friday 08:00". */
  etaText: string | null;
}

export interface MapViewProps {
  layers: MapLayersResponse;
  trucks: MapTruck[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (shipmentId: string | null) => void;
  onHover?: (shipmentId: string | null) => void;
  showDisruptions?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Extra overlay content (e.g. the simulation dock). */
  children?: ReactNode;
}

/** Keyed HTML markers rendered by React through portals (architecture §16.1: labels are HTML, not symbol layers). */
function useHtmlMarkers(map: MlMap | null, points: { key: string; lng: number; lat: number; z?: number }[]) {
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>());
  const [elements, setElements] = useState<Record<string, HTMLDivElement>>({});
  useEffect(() => {
    if (!map) return;
    const seen = new Set<string>();
    let changed = false;
    for (const p of points) {
      seen.add(p.key);
      const existing = markers.current.get(p.key);
      if (existing) {
        existing.marker.setLngLat([p.lng, p.lat]);
      } else {
        const el = document.createElement('div');
        if (p.z !== undefined) el.style.zIndex = String(p.z);
        const marker = new Marker({ element: el, anchor: 'top' }).setLngLat([p.lng, p.lat]).addTo(map);
        markers.current.set(p.key, { marker, el });
        changed = true;
      }
    }
    for (const [key, m] of markers.current) {
      if (!seen.has(key)) {
        m.marker.remove();
        markers.current.delete(key);
        changed = true;
      }
    }
    if (changed) setElements(Object.fromEntries([...markers.current].map(([k, v]) => [k, v.el])));
  }, [map, points]);
  useEffect(
    () => () => {
      for (const m of markers.current.values()) m.marker.remove();
      markers.current.clear();
    },
    [],
  );
  return elements;
}

export function MapView({
  layers,
  trucks,
  selectedId = null,
  hoveredId = null,
  onSelect,
  onHover,
  showDisruptions = true,
  ariaLabel = 'Shipment map',
  className,
  children,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [failed, setFailed] = useState(false);

  // ----- create the map once -----
  useEffect(() => {
    if (!containerRef.current) return;
    let instance: MlMap;
    try {
      instance = new MlMap({
        container: containerRef.current,
        style: offlineStyle(),
        center: [73.5, 20.5],
        zoom: 5,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.scrollZoom.disable();
    instance.on('load', () => setMap(instance));
    instance.on('click', () => instance.scrollZoom.enable());
    const container = containerRef.current;
    const enable = () => instance.scrollZoom.enable();
    const disable = () => instance.scrollZoom.disable();
    container.addEventListener('focusin', enable);
    container.addEventListener('mouseleave', disable);
    return () => {
      container.removeEventListener('focusin', enable);
      container.removeEventListener('mouseleave', disable);
      instance.remove();
      setMap(null);
    };
  }, []);

  const selectedTruck = trucks.find((t) => t.item.shipmentId === selectedId) ?? null;
  const selectedRouteId = selectedTruck?.item.routeId ?? null;
  const selectedLaneId = layers.routes.find((r) => r.id === selectedRouteId)?.laneId ?? null;

  // ----- route + disruption sources -----
  const routesGeo = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: layers.routes.map((r) => ({
        type: 'Feature' as const,
        properties: { routeId: r.id, laneId: r.laneId, isPrimary: r.isPrimary },
        geometry: r.geometry,
      })),
    }),
    [layers.routes],
  );

  const disruptionLines = useMemo(() => {
    if (!showDisruptions) return [];
    const out: { id: string; label: string; coords: LngLat[] }[] = [];
    for (const d of layers.activeDisruptions) {
      for (const r of layers.routes) {
        for (const seg of r.segments) {
          if (!d.segmentCodes.includes(seg.segmentCode) || r.lengthKm <= 0) continue;
          out.push({
            id: `${d.id}:${r.id}:${seg.segmentCode}`,
            label: d.label,
            coords: sliceLine(r.geometry.coordinates, seg.startKm / r.lengthKm, seg.endKm / r.lengthKm),
          });
        }
      }
    }
    return out;
  }, [layers, showDisruptions]);

  useEffect(() => {
    if (!map) return;
    const disrGeo = {
      type: 'FeatureCollection' as const,
      features: disruptionLines.map((d) => ({
        type: 'Feature' as const,
        properties: { id: d.id },
        geometry: { type: 'LineString' as const, coordinates: d.coords },
      })),
    };
    const routes = map.getSource(ROUTES_SRC) as GeoJSONSource | undefined;
    if (routes) routes.setData(routesGeo);
    else {
      map.addSource(ROUTES_SRC, { type: 'geojson', data: routesGeo });
      map.addLayer({
        id: 'routes-alt',
        type: 'line',
        source: ROUTES_SRC,
        filter: ['==', ['get', 'isPrimary'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': cssVar('--rp-map-route-alt'), 'line-width': 2, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'routes-primary',
        type: 'line',
        source: ROUTES_SRC,
        filter: ['==', ['get', 'isPrimary'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': cssVar('--rp-map-route'), 'line-width': 3, 'line-opacity': 0.8 },
      });
      map.addLayer({
        id: 'routes-selected',
        type: 'line',
        source: ROUTES_SRC,
        filter: ['==', ['get', 'routeId'], ''],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': cssVar('--rp-primary'), 'line-width': 4 },
      });
    }
    const disr = map.getSource(DISR_SRC) as GeoJSONSource | undefined;
    if (disr) disr.setData(disrGeo);
    else {
      map.addSource(DISR_SRC, { type: 'geojson', data: disrGeo });
      map.addLayer({
        id: 'disr-under',
        type: 'line',
        source: DISR_SRC,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': cssVar('--rp-danger'), 'line-width': 6, 'line-opacity': 0.35 },
      });
      map.addLayer({
        id: 'disr-dash',
        type: 'line',
        source: DISR_SRC,
        paint: { 'line-color': cssVar('--rp-danger'), 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
    }
  }, [map, routesGeo, disruptionLines]);

  // ----- selection styling (UI plan §6.4: selected route highlighted, others dimmed to 40%) -----
  useEffect(() => {
    if (!map || !map.getLayer('routes-primary')) return;
    map.setFilter('routes-selected', ['==', ['get', 'routeId'], selectedRouteId ?? '']);
    map.setPaintProperty('routes-primary', 'line-opacity', selectedRouteId ? 0.4 : 0.8);
    map.setFilter(
      'routes-alt',
      selectedLaneId
        ? ['all', ['==', ['get', 'isPrimary'], false], ['==', ['get', 'laneId'], selectedLaneId]]
        : ['==', ['get', 'routeId'], '__none__'],
    );
  }, [map, selectedRouteId, selectedLaneId]);

  // ----- fit all -----
  const fitAll = useCallback(() => {
    if (!map) return;
    const pts: LngLat[] = [[layers.plant.lng, layers.plant.lat]];
    for (const r of layers.routes) pts.push(...r.geometry.coordinates);
    for (const s of layers.sites) pts.push([s.lng, s.lat]);
    const b = boundsOf(pts);
    if (b) map.fitBounds(new LngLatBounds(b[0], b[1]), { padding: 56, duration: prefersReducedMotion() ? 0 : 400, maxZoom: 9 });
  }, [map, layers]);

  const fittedOnce = useRef(false);
  useEffect(() => {
    if (map && !fittedOnce.current) {
      fittedOnce.current = true;
      fitAll();
    }
  }, [map, fitAll]);

  // ----- fly to the selected truck -----
  useEffect(() => {
    if (!map || !selectedTruck) return;
    map.flyTo({
      center: [selectedTruck.item.lng, selectedTruck.item.lat],
      zoom: Math.max(map.getZoom(), 7),
      duration: prefersReducedMotion() ? 0 : 600,
    });
    // fly only when the selection changes, not on every position tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);

  // ----- HTML markers -----
  const staticPoints = useMemo(
    () => [
      { key: 'plant', lng: layers.plant.lng, lat: layers.plant.lat, z: 1 },
      ...layers.sites.map((s) => ({ key: `site:${s.customerId}`, lng: s.lng, lat: s.lat, z: 1 })),
      ...disruptionLines.map((d) => {
        const [lng, lat] = midpoint(d.coords);
        return { key: `disr:${d.id}`, lng, lat, z: 2 };
      }),
    ],
    [layers, disruptionLines],
  );
  const truckPoints = useMemo(
    () => trucks.map((t) => ({ key: `truck:${t.item.shipmentId}`, lng: t.item.lng, lat: t.item.lat, z: t.item.shipmentId === selectedId ? 5 : 3 })),
    [trucks, selectedId],
  );
  const staticEls = useHtmlMarkers(map, staticPoints);
  const truckEls = useHtmlMarkers(map, truckPoints);

  if (failed) {
    return (
      <div role="region" aria-label={ariaLabel} className={className}>
        <div className="flex h-full items-center justify-center bg-surface-sunken p-6 text-center text-body text-text-secondary">
          The map cannot be shown on this device (WebGL unavailable). The shipment list shows the same information.
        </div>
      </div>
    );
  }

  return (
    <div role="region" aria-label={ariaLabel} className={`relative overflow-hidden ${className ?? ''}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {staticEls.plant ? createPortal(<PlantMarker name={layers.plant.name} />, staticEls.plant) : null}
      {layers.sites.map((s) => {
        const el = staticEls[`site:${s.customerId}`];
        return el ? createPortal(<SiteMarker name={s.name} city={s.city} receivingHours={s.receivingHours} />, el, s.customerId) : null;
      })}
      {disruptionLines.map((d) => {
        const el = staticEls[`disr:${d.id}`];
        return el ? createPortal(<DisruptionPill label={d.label} />, el, d.id) : null;
      })}
      {trucks.map((t) => {
        const el = truckEls[`truck:${t.item.shipmentId}`];
        if (!el) return null;
        const selected = t.item.shipmentId === selectedId;
        return createPortal(
          <TruckMarker
            code={t.item.code}
            level={t.item.riskLevel}
            stopped={t.item.stopped}
            selected={selected}
            dimmed={!!selectedId && !selected && hoveredId !== t.item.shipmentId}
            ariaLabel={truckAriaLabel(t.item.code, t.item.riskLevel, t.etaText)}
            onSelect={() => onSelect?.(t.item.shipmentId)}
            onHover={(h) => onHover?.(h ? t.item.shipmentId : null)}
          />,
          el,
          t.item.shipmentId,
        );
      })}
      <div className="pointer-events-none absolute top-[88px] right-[10px] z-10">
        <IconButton icon={Maximize2} label="Fit all shipments" size="sm" onClick={fitAll} className="pointer-events-auto border border-border bg-surface shadow-xs" />
      </div>
      <MapLegend showDisruptions={showDisruptions} />
      {children}
    </div>
  );
}
