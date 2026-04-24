import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.webpack.css';
import 'leaflet-defaulticon-compatibility';
import 'leaflet-sidebar-v2';
import 'leaflet-sidebar-v2/css/leaflet-sidebar.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import '@/util/leaflet_tile_workaround.js';

import * as L from 'leaflet';
import debounce from 'lodash/debounce';
import Component, { mixins } from 'vue-class-component';
import VueRouter from 'vue-router';
import draggable from 'vuedraggable';

import AppMapDetailsDungeon from '@/components/AppMapDetailsDungeon';
import AppMapDetailsCave from './AppMapDetailsCave.vue';
import AppMapDetailsLandmark from '@/components/AppMapDetailsLandmark';
import AppMapDetailsObj, { staticData as objDetailsStaticData } from '@/components/AppMapDetailsObj';
import AppMapDetailsPlace from '@/components/AppMapDetailsPlace';
import AppMapFilterMainButton from '@/components/AppMapFilterMainButton';
import AppMapPopup from '@/components/AppMapPopup';
import AppMapSettings from '@/components/AppMapSettings';
import AppMapChecklists from '@/components/AppMapChecklists';
import MixinUtil from '@/components/MixinUtil';
import ModalGotoCoords from '@/components/ModalGotoCoords';
import ObjectInfo from '@/components/ObjectInfo';
import { MsgMgr } from '@/services/MsgMgr';
import {
  MapBase,
  SHOW_ALL_OBJS_FOR_MAP_UNIT_EVENT,
} from '@/MapBase';
import * as MapIcons from '@/MapIcon';
import * as MapMarkers from '@/MapMarker';
import {
  MapMarker,
  SearchResultUpdateMode,
} from '@/MapMarker';
import { MapMarkerGroup } from '@/MapMarkerGroup';
import {
  SEARCH_PRESETS,
  SearchExcludeSet,
  SearchResultGroup,
  isObjectInLayer,
} from '@/MapSearch';
import * as save from '@/save';
import {
  MapMgr,
  ObjectData,
  ObjectMinData,
} from '@/services/MapMgr';
import * as map from '@/util/map';
import { Point } from '@/util/map';
import { calcLayerLength } from '@/util/polyline';
import { Settings } from '@/util/settings';
import * as ui from '@/util/ui';
import * as math from '@/util/math';
import { Checklists } from '@/util/Checklist';

const { isNavigationFailure, NavigationFailureType } = VueRouter;

interface ObjectIdentifier {
  mapType: string;
  mapName: string;
  hashId: string;
}

function valueOrDefault<T>(value: T | undefined, defaultValue: T) {
  return value === undefined ? defaultValue : value;
}

interface MarkerComponent {
  cl: any;
  detailsComponent?: string;
  preloadPad?: number;
  enableUpdates?: boolean;

  filterIcon: string,
  filterLabel: string,
}

const MARKER_OPACITIES: { [key: string]: number } = {
  'never': 0.0,
  always: 1.0,
  opacity: 0.3,
  'opacity-alt': 0.1,
};

const ALT_UNMARKED_ICON_URLS: { [key: string]: string } = {
  '/icons/shrine.svg': '/icons/shrine_unmarked.svg',
  '/icons/shrine_cave.svg': '/icons/shrine_cave_unmarked.svg',
  '/icons/tower.svg': '/icons/tower_unmarked.svg',
  '/icons/lightroot.svg': '/icons/lightroot_unmarked.svg',
  '/icons/mapicon_labo.svg': '/icons/mapicon_labo_unmarked.svg',
};

const DEFAULT_ICON_URLS: { [key: string]: string } = {};
for (const [base, alt] of Object.entries(ALT_UNMARKED_ICON_URLS)) {
  DEFAULT_ICON_URLS[alt] = base;
}

const ACTIVE_SEARCH_MARKED_OPACITY = 0.5;


const MARKER_COMPONENTS: { [type: string]: MarkerComponent } = Object.freeze({
  'Location': {
    cl: MapMarkers.MapMarkerLocation,
    preloadPad: 0.6,
    filterIcon: MapIcons.CHECKPOINT.options.iconUrl,
    filterLabel: 'Locations',
  },
  'Dungeon': {
    cl: MapMarkers.MapMarkerDungeon,
    detailsComponent: 'AppMapDetailsDungeon',
    enableUpdates: true,
    filterIcon: MapIcons.TOTK_SHRINE.options.iconUrl,
    filterLabel: 'Shrines',
  },
  'Place': {
    cl: MapMarkers.MapMarkerPlace,
    detailsComponent: 'AppMapDetailsPlace',
    enableUpdates: true,
    filterIcon: MapIcons.VILLAGE.options.iconUrl,
    filterLabel: 'Places',
  },
  'Tower': {
    cl: MapMarkers.MapMarkerTower,
    detailsComponent: 'AppMapDetailsLandmark',
    enableUpdates: true,
    filterIcon: MapIcons.TOTK_TOWER.options.iconUrl,
    filterLabel: 'Towers',
  },
  'Shop': {
    cl: MapMarkers.MapMarkerShop,
    filterIcon: MapIcons.SHOP_YOROZU.options.iconUrl,
    filterLabel: 'Shops',
  },
  'Labo': {
    cl: MapMarkers.MapMarkerLabo,
    detailsComponent: 'AppMapDetailsLandmark',
    enableUpdates: true,
    filterIcon: MapIcons.LABO.options.iconUrl,
    filterLabel: 'Tech Labs',
  },
  'Chasm': {
    cl: MapMarkers.MapMarkerCave,
    detailsComponent: 'AppMapDetailsObj',
    filterIcon: MapIcons.CHASM.options.iconUrl,
    filterLabel: 'Chasm',
  },
  'Cave': {
    cl: MapMarkers.MapMarkerCave,
    detailsComponent: 'AppMapDetailsCave',
    filterIcon: MapIcons.CAVE.options.iconUrl,
    filterLabel: 'Cave/Well',
  },
  'Korok': {
    cl: MapMarkers.MapMarkerKorok,
    detailsComponent: 'AppMapDetailsObj',
    enableUpdates: true,
    filterIcon: MapIcons.KOROK.options.iconUrl,
    filterLabel: 'Koroks',
  },
  'DragonTears': {
    cl: MapMarkers.MapMarkerTear,
    detailsComponent: 'AppMapDetailsObj',
    enableUpdates: true,
    filterIcon: MapIcons.TOTK_TEAR.options.iconUrl,
    filterLabel: 'Dragon Tears',
  },
  'CheckPoint': {
    cl: MapMarkers.MapMarkerLightroot,
    detailsComponent: 'AppMapDetailsLandmark',
    enableUpdates: true,
    filterIcon: MapIcons.TOTK_LIGHTROOT.options.iconUrl,
    filterLabel: 'Lightroots',
  },
  'Dispensers': {
    cl: MapMarkers.MapMarkerDispenser,
    detailsComponent: 'AppMapDetailsObj',
    enableUpdates: true,
    filterIcon: MapIcons.DISPENSER.options.iconUrl,
    filterLabel: 'Device Dispenser',
  },
});

function getMarkerDetailsComponent(marker: MapMarker): string {
  if (marker instanceof MapMarkers.MapMarkerObj || marker instanceof MapMarkers.MapMarkerSearchResult)
    return 'AppMapDetailsObj';

  // Cave and chasm markers share the same class; decide explicitly.
  if (marker instanceof MapMarkers.MapMarkerCave)
    return marker.isChasm ? 'AppMapDetailsObj' : 'AppMapDetailsCave';

  for (const component of Object.values(MARKER_COMPONENTS)) {
    if (marker instanceof component.cl)
      return valueOrDefault(component.detailsComponent, '');
  }
  return '';
}

class LayerProps {
  title: string;
  text: string;
  pathLength: number;
  order: number;
  map_layer: string;
  constructor() {
    this.title = "";
    this.text = "";
    this.pathLength = 0;
    this.order = -1;
    this.map_layer = "";
  }
  lengthAsString(): string {
    if (this.pathLength <= 0.0) {
      return "";
    }
    return `${this.pathLength.toFixed(2)} m`;
  }
  tooltip(): string {
    return (this.title || 'Unnamed') + " " + this.lengthAsString();
  }
  fromGeoJSON(feat: any) {
    this.title = feat.properties.title || '';
    this.text = feat.properties.text || '';
    this.pathLength = feat.properties.pathLength || 0;
    this.order = (feat.properties.order !== undefined) ? feat.properties.order : -1;
    this.map_layer = feat.properties.map_layer || 'Surface';
  }
}
function addGeoJSONFeatureToLayer(layer: any) {
  if (!layer.feature) {
    layer.feature = { type: 'Feature' };
  }
  if (!layer.feature.properties) {
    layer.feature.properties = new LayerProps();
  }
}



function layerSetTooltip(layer: L.Marker | L.Polyline) {
  if (layer.feature) {
    layer.setTooltipContent(layer.feature.properties.tooltip());
  }
}

function layerSetPopup(layer: L.Marker | L.Polyline, popup: AppMapPopup) {
  layer.bindPopup(popup.$el as HTMLElement, { minWidth: 200 });
  // @ts-ignore
  // popup instance is needed later to update the length
  layer.popup = popup;
}

function addPopupAndTooltip(layer: L.Marker | L.Polyline, root: any) {
  if (layer && layer.feature) {
    let popup = new AppMapPopup({ propsData: layer.feature.properties });
    // Initiate the Element as $el
    popup.$mount();
    // Respond to `title` and `text` messages
    popup.$on('title', (txt: string) => {
      if (layer && layer.feature) {
        layer.feature.properties.title = txt;
        layerSetTooltip(layer);
        root.updateDrawLayerOpts({ title: txt, layer });
      }
    });
    popup.$on('text', (txt: string) => {
      if (layer && layer.feature) {
        layer.feature.properties.text = txt;
        root.updateDrawLayerOpts({ txt: txt, layer });
      }
    });
    popup.$on('map_layer', (txt: string) => {
      if (layer && layer.feature) {
        layer.feature.properties.map_layer = txt;
        root.updateDrawLayerOpts({ map_layer: txt, layer });
        root.updateDrawLayers();
      }
    });
    // Create Popup and Tooltip
    layerSetPopup(layer, popup);
    layer.bindTooltip(layer.feature.properties.tooltip());
  }
}

class SingleEdit {
  tooltip: L.Draw.Tooltip | undefined;//= undefined;
  layer: L.Polyline | L.Marker | undefined;// = undefined;
  map: L.Map | undefined;// = undefined;

  constructor() {
    this.tooltip = undefined;
    this.layer = undefined;
    this.map = undefined;
  }

  tooltipDisable() {
    if (this.tooltip) {
      this.tooltip.dispose()
      this.tooltip = undefined;
    }
  }

  tooltipEnable() {
    if (!this.map)
      return
    this.tooltip = new L.Draw.Tooltip(this.map)
    this.tooltip.updateContent({
      subtext: "Use context menu to toggle editing or Return to save",
      text: "Drag handles or markers to edit features."
    });
    //drawTooltip.updatePosition(
    this.map.on('mousemove', (ev) => {
      if (this.tooltip) {
        // @ts-ignore
        this.tooltip.updatePosition(ev.latlng);
      }
    });
  }

  disable() {
    if (this.map && this.layer) {
      // @ts-ignore
      this.layer.editing.disable();
      this.tooltipDisable();
      L.DomEvent.off(this.map.getContainer(), 'keyup',
        this.onKey, this);
      this.map = undefined;
      this.layer = undefined;
    }
  }

  enable(map: L.Map, layer: L.Polyline | L.Marker) {
    this.map = map;
    this.layer = layer;
    // @ts-ignore
    layer.editing.enable()
    this.tooltipEnable();
    L.DomEvent.on(this.map.getContainer(), 'keyup',
      this.onKey, this);
    this.map.getContainer().focus();
  }

  edit(map: L.Map, layer: L.Polyline | L.Marker) {
    // @ts-ignore
    if (!layer.editing.enabled()) {
      // Turn off editing for current layer
      //  unless it is the requested layer to edit
      if (this.layer && this.map) {
        if (this.layer == layer)
          return
        this.disable();
      }
      this.enable(map, layer);
    } else {
      this.disable();
    }
  }
  onKey(e: Event) {
    const ev = e as KeyboardEvent;
    if (ev.code == "Enter") {
      this.disable();
      // A revert could be added using backupLayer and revertLayer
      //   from Leaflet.Draw
    }
  }
}

@Component({
  components: {
    AppMapDetailsCave,
    AppMapDetailsDungeon,
    AppMapDetailsLandmark,
    AppMapDetailsObj,
    AppMapDetailsPlace,
    AppMapFilterMainButton,
    AppMapSettings,
    AppMapChecklists,
    ModalGotoCoords,
    ObjectInfo,
    draggable,
  },
})
export default class AppMap extends mixins(MixinUtil) {
  readonly OBJMAP_VERSION = process.env.VUE_APP_GIT_HASH;

  private map!: MapBase;
  private updatingRoute = false;
  private zoom = map.DEFAULT_ZOOM;

  private sidebar!: L.Control.Sidebar;
  private sidebarActivePane = '';
  private sidebarPaneScrollPos: Map<string, number> = new Map();
  private drawControlEnabled = false;
  private drawControl: any;
  private drawLayer!: L.GeoJSON;
  private drawLayerOpts: any[] = [];
  private drawLineColor = '#3388ff';
  private setLineColorThrottler!: () => void;
  private markerVisibility: string = "opacity";
  private clMarkerVisibility: string = "opacity";

  private previousGotoMarker: L.Marker | null = null;
  private greatPlateauBarrierShown = false;

  private detailsComponent = '';
  private detailsMarker: ui.Unobservable<MapMarker> | null = null;
  private detailsPaneOpened = false;
  private detailsPinMarker: ui.Unobservable<L.Marker> | null = null;

  private markerComponents = MARKER_COMPONENTS;
  private markerGroups: Map<string, MapMarkerGroup> = new Map();

  private searching = false;
  private searchQuery = '';
  private searchThrottler!: () => void;
  private searchLastSearchFailed = false;
  private searchResults: ObjectMinData[] = [];
  private searchResultMarkers: ui.Unobservable<MapMarkers.MapMarkerSearchResult>[] = [];
  private searchGeneration = 0;
  private searchGroups: SearchResultGroup[] = [];
  private searchPresets = SEARCH_PRESETS;
  private searchExcludedSets: SearchExcludeSet[] = [];
  private readonly MAX_SEARCH_RESULT_COUNT = 2000;

  private hardModeExcludeSet!: SearchExcludeSet;
  private lastBossExcludeSet!: SearchExcludeSet;
  private ohoExcludeSet!: SearchExcludeSet;

  private areaMapLayer = new ui.Unobservable(L.layerGroup());
  private areaMapLayersByData: ui.Unobservable<Map<any, L.Layer[]>> = new ui.Unobservable(new Map());
  private cachedMapTowerEntries: Array<[string, any]> | null = null;
  private areaAutoItem = new ui.Unobservable(L.layerGroup());

  private skipCompletedObjects: boolean = false;
  private checklists: Checklists = new Checklists();
  private shrineBgmHashByDungeonMessageId: Map<string, string> = new Map();

  shownAreaMap = '';
  areaWhitelist = '';
  showKorokIDs = false;
  shownAutoItem = '';
  staticTooltip = false;

  private caveDetailEntries: Array<{ title: string, layers: L.GeoJSON[], features: any[] }> = [];
  private caveDetailHoveredTitle: string | null = null;
  private korokPairLines: Map<string, { lines: L.Polyline[], map_layer: string }> = new Map();
  private caveDetailTooltip: L.Tooltip | null = null;
  private caveDetailHoverInitialized = false;
  private markerTooltipOpen = false;
  private mapUnitGrid = new ui.Unobservable(L.layerGroup());
  showMapUnitGrid = false;
  private revivalMapUnitGrid = new ui.Unobservable(L.layerGroup());
  showRevivalMapUnitGrid = false;
  showAreaColor = true;

  private mapSafeAreas = new ui.Unobservable(L.layerGroup());
  showSafeAreas = false;

  private mapCastleAreas = new ui.Unobservable(L.layerGroup());
  showCastleAreas = false;

  showBaseMap = true;
  showReferenceGrid = false;

  private tempObjMarker: ui.Unobservable<MapMarker> | null = null;

  private settings: Settings | null = null;
  private lastSettingsMapType: string | null = null;
  private lastSettingsMapName: string | null = null;

  // Replace current markers
  private importReplace: boolean = true;
  private clImportReplace: boolean = true;

  // internal State for drawing markers
  private drawVertexLayers: string[] = [];

  private singleEdit: SingleEdit = new SingleEdit();

  private localDetails: { [key: string]: boolean } = {};
  private localSearch: { [key: string]: boolean } = {};

  filterResults(result: any) {
    if (!this.skipCompletedObjects) {
      return true;
    }
    if (this.checklists.isMarked(result.hash_id)) {
      return false;
    }
    return true;
  }

  setViewFromRoute(route: any) {
    const x = parseFloat(route.params.x);
    const z = parseFloat(route.params.z);
    if (isNaN(x) || isNaN(z)) {
      this.$router.replace({ name: 'map' });
      return;
    }

    let zoom = parseInt(route.params.zoom);
    if (isNaN(zoom))
      zoom = 3;

    this.map.setView([x, 0, z], zoom);
    const layer = route.params.layer;
    if (layer && ["Surface", "Depths", "Sky"].includes(layer))
      this.map.switchBaseTileLayer(layer);
  }
  updateRoute() {
    this.updatingRoute = true;
    // @ts-ignore
    this.$router.replace({
      name: 'map',
      params: {
        x: this.map.center[0],
        z: this.map.center[2],
        zoom: this.map.m.getZoom(),
        layer: this.map.activeLayer,
      },
      query: this.$route.query,
    }).catch(err => {
      if (!isNavigationFailure(err, NavigationFailureType.duplicated)) {
        // eslint-disable-next-line no-console
        console.error(err);
      }
    });
    this.updatingRoute = false;
  }

  initMapRouteIntegration() {
    this.setViewFromRoute(this.$route);
    this.map.zoom = this.map.m.getZoom();
    this.map.center = this.map.toXYZ(this.map.m.getCenter());
    this.map.registerMoveEndCb(() => this.updateRoute());
    this.map.registerZoomEndCb(() => this.updateRoute());
    this.updateRoute();
    this.map.registerBaseLayerChangeCb(() => {
      this.clUpdateMarkers();
      this.updateDrawLayers();
      for (const group of this.searchGroups)
        group.update(SearchResultUpdateMode.UpdateVisibility | SearchResultUpdateMode.UpdateStyle, this.searchExcludedSets);
      this.updateSearchResultMarkerVisibility();
      this.refreshMapTowerCompletion();
      this.updateRoute();
      this.updateAreaMapVisibility();
    });
  }

  initMarkers() {
    this.map.registerZoomCb(() => this.updateMarkers());
    this.updateMarkers();
  }

  // Similar to updateMarkers() but only called
  //   on toggle of KorokIDs
  updateKorokIDs() {
    let type = "Korok";
    const info = MapMgr.getInstance().getInfoMainField();
    if (Settings.getInstance().shownGroups.has(type)) {
      this.markerGroups.get(type)!.destroy();
      this.markerGroups.delete(type);

      const markers: any[] = info.markers[type];
      const component = MARKER_COMPONENTS[type];
      const group = new MapMarkerGroup(
        markers.map((m: any) => new (component.cl)(this.map, m, { showLabel: this.showKorokIDs })),
        valueOrDefault(component.preloadPad, 1.0),
        valueOrDefault(component.enableUpdates, true));
      this.markerGroups.set(type, group);
      group.addToMap(this.map.m);
      group.update();
    }
  }

  updateMarkerCheckmark(marker: MapMarker) {
    const opacity = MARKER_OPACITIES[this.clMarkerVisibility];
    const showCheckmark = this.shouldShowChecklistCheckmark();
    const useAlternateUnmarkedIcon = this.shouldUseAlternateUnmarkedIcons();
    const marked = this.isMarkerMarked(marker);
    marker.setMarked(marked, marked ? opacity : 1.0, showCheckmark);
    this.applyAlternateUnmarkedIcon(marker, !marked && useAlternateUnmarkedIcon);
  }


  private isMarkerMarked(marker: MapMarker) {
    const markerHash = marker.getHashID();
    if (markerHash && this.checklists.isMarked(markerHash)) {
      return true;
    }

    if (marker instanceof MapMarkers.MapMarkerDungeon) {
      const bgmHash = this.shrineBgmHashByDungeonMessageId.get(marker.getMessageId());
      if (bgmHash) {
        return this.checklists.isMarked(bgmHash);
      }
    }

    return false;
  }

  private async initShrineBgmHashIndex() {
    this.shrineBgmHashByDungeonMessageId.clear();
    try {
      const info = MapMgr.getInstance().getInfoMainField();
      const dungeons: any[] = info.markers.Dungeon || [];
      const bgmObjs = await MapMgr.getInstance().getObjs('MainField', '', 'actor:^"BGM_Shrine"');

      for (const dungeon of dungeons) {
        const messageId: string = dungeon.MessageID;
        if (!messageId || !dungeon.Translate)
          continue;

        let best: ObjectMinData | null = null;
        let bestDist = Infinity;
        for (const obj of bgmObjs) {
          const dx = obj.pos[0] - dungeon.Translate.X;
          const dy = obj.pos[1] - dungeon.Translate.Y;
          const dz = obj.pos[2] - dungeon.Translate.Z;
          const dist = dx * dx + dy * dy + dz * dz;
          if (dist < bestDist) {
            best = obj;
            bestDist = dist;
          }
        }

        if (best) {
          this.shrineBgmHashByDungeonMessageId.set(messageId, best.hash_id);
        }
      }
    } catch (e) {
      // non-fatal
    }
  }
  onChecklistMarkerVisibilityChanged() {
    Settings.getInstance().checklistMarkerVisibility = this.clMarkerVisibility;
    this.clUpdateMarkers();
  }

  private shouldShowChecklistCheckmark() {
    return this.clMarkerVisibility === 'always';
  }

  private shouldUseAlternateUnmarkedIcons() {
    return this.clMarkerVisibility === 'opacity-alt';
  }

  private applyAlternateUnmarkedIcon(marker: MapMarker, useAlternate: boolean) {
    const layer = marker.getMarker();
    if (!(layer instanceof L.Marker))
      return;
    const icon = layer.options.icon as L.Icon | undefined;
    if (!icon || !icon.options || !icon.options.iconUrl)
      return;

    const currentUrl = String(icon.options.iconUrl);
    const targetUrl = useAlternate
      ? ALT_UNMARKED_ICON_URLS[currentUrl]
      : DEFAULT_ICON_URLS[currentUrl];
    if (!targetUrl)
      return;

    const nextIcon = L.icon({
      ...icon.options,
      iconUrl: targetUrl,
    });
    layer.setIcon(nextIcon);
  }

  updateMarkers() {
    const info = MapMgr.getInstance().getInfoMainField();
    for (const type of Object.keys(info.markers)) {
      if (!Settings.getInstance().shownGroups.has(type)) {
        // Group exists and needs to be removed.
        if (this.markerGroups.has(type)) {
          this.markerGroups.get(type)!.destroy();
          this.markerGroups.delete(type);
        }
        continue;
      }

      // Nothing to do -- the group already exists.
      if (this.markerGroups.has(type))
        continue;

      const markers: any[] = info.markers[type];
      const component = MARKER_COMPONENTS[type];
      const group = new MapMarkerGroup(
        markers.map((m: any) => new (component.cl)(this.map, m, { showLabel: this.showKorokIDs })),
        valueOrDefault(component.preloadPad, 1.0),
        valueOrDefault(component.enableUpdates, true));
      this.markerGroups.set(type, group);
      group.addToMap(this.map.m);
    }
    for (const group of this.markerGroups.values()) {
      group.update();
      // @ts-ignore
      for (const marker of group.markers.values()) {
        this.updateMarkerCheckmark(marker);
      }
    }
    this.syncKorokPairLines();
  }

  private korokArrowMarkerInjected = false;

  private ensureKorokPairLineStyle() {
    if (this.korokArrowMarkerInjected) return;
    this.korokArrowMarkerInjected = true;
    // Inject CSS for animated dashes that visually flow from passenger → destination
    const style = document.createElement('style');
    style.textContent = `
      .korok-pair-line {
        stroke-dasharray: 8, 8;
        animation: korok-pair-flow 1s linear infinite;
      }
      @keyframes korok-pair-flow {
        to { stroke-dashoffset: -16; }
      }
    `;
    document.head.appendChild(style);
  }

  private syncKorokPairLines() {
    // Remove all existing auto pair lines
    for (const [, entry] of this.korokPairLines) {
      entry.lines.forEach(l => l.remove());
    }
    this.korokPairLines.clear();

    if (this.clMarkerVisibility !== 'opacity-alt') return;

    const korokGroup = this.markerGroups.get('Korok');
    if (!korokGroup) return;

    // Build hash_id -> info map for quick lookup
    const korokByHash = new Map<string, any>();
    // @ts-ignore
    for (const marker of korokGroup.markers) {
      // @ts-ignore
      if (marker.info) korokByHash.set(marker.info.hash_id, marker.info);
    }

    // @ts-ignore
    for (const marker of korokGroup.markers) {
      // @ts-ignore
      const info = marker.info;
      if (!info || !info.is_passenger || !info.friend_hash_id) continue;
      // Only draw if neither passenger nor friend is marked
      if (this.checklists.isMarked(info.hash_id) || this.checklists.isMarked(info.friend_hash_id)) continue;

      const friendInfo = korokByHash.get(info.friend_hash_id);
      if (!friendInfo) continue;

      // Passenger position is their Translate (where they are stranded)
      // Friend/destination position is the friend's Translate
      const passengerPos: [number, number] = [info.Translate.Z, info.Translate.X];
      const friendPos: [number, number] = [friendInfo.Translate.Z, friendInfo.Translate.X];

      const activeLayer = this.map.activeLayer;
      const lineOpacity = (info.map_name === activeLayer) ? 1.0 : 0;
      const line = L.polyline([passengerPos, friendPos], {
        color: '#cccccc', weight: 1.5, opacity: lineOpacity,
      }).addTo(this.map.m);
      const layers: L.Polyline[] = [line];
      // Add a short tick at the destination end, rotated 30° from the backward direction
      const dLat = friendPos[0] - passengerPos[0];
      const dLng = friendPos[1] - passengerPos[1];
      const lineLen = Math.sqrt(dLat * dLat + dLng * dLng);
      if (lineLen > 0) {
        const tickLen = Math.min(50, lineLen * 0.5); // fixed ~50 units, capped at 50% of main line
        // Unit vector pointing backward (from destination toward passenger)
        const bLat = -dLat / lineLen;
        const bLng = -dLng / lineLen;
        // Rotate backward vector by +30 degrees
        const a = 30 * Math.PI / 180;
        const tickDLat = bLat * Math.cos(a) - bLng * Math.sin(a);
        const tickDLng = bLng * Math.cos(a) + bLat * Math.sin(a);
        const tickEnd: [number, number] = [
          friendPos[0] + tickDLat * tickLen,
          friendPos[1] + tickDLng * tickLen,
        ];
        layers.push(L.polyline([friendPos, tickEnd], {
          color: '#cccccc', weight: 1.5, opacity: lineOpacity,
        }).addTo(this.map.m));
      }
      this.korokPairLines.set(info.hash_id, { lines: layers, map_layer: info.map_name });
    }
  }

  initSidebar() {
    this.sidebar = L.control.sidebar({
      closeButton: true,
      container: 'sidebar',
      position: 'left',
    })
    this.sidebar.addTo(this.map.m);
    const el = (document.getElementById('sidebar-content'))!;
    const origOpen = this.sidebar.open;
    // Fires before switching the active pane.
    this.sidebar.open = (id: string) => {
      this.sidebarPaneScrollPos.set(this.sidebarActivePane, el.scrollTop);
      return origOpen.apply(this.sidebar, [id]);
    };
    // Fires after switching the active pane.
    this.sidebar.on('content', (e) => {
      // @ts-ignore
      const id: string = e.id;
      this.sidebarActivePane = id;
      el.scrollTop = this.sidebarPaneScrollPos.get(this.sidebarActivePane) || 0;
    });
    this.updateSidebarClass();
    this.updateHylianMode();
  }

  closeSidebar() {
    if (this.detailsPaneOpened) {
      this.closeMarkerDetails();
      return;
    }
    this.sidebar.close();
  }

  toggleSidebarSide() {
    Settings.getInstance().left = !Settings.getInstance().left;
    this.updateSidebarClass();
  }

  toggleHylianMode() {
    Settings.getInstance().hylianMode = !Settings.getInstance().hylianMode;
    this.updateHylianMode();
  }

  updateSidebarClass() {
    const el = (document.getElementById('sidebar'))!;
    if (Settings.getInstance().left) {
      el.classList.remove('leaflet-sidebar-right');
      el.classList.add('leaflet-sidebar-left');
    } else {
      el.classList.add('leaflet-sidebar-right');
      el.classList.remove('leaflet-sidebar-left');
    }
  }

  updateHylianMode() {
    const el = (document.getElementById('app'))!;
    if (Settings.getInstance().hylianMode) {
      el.classList.add('hylian-mode');
    } else {
      el.classList.remove('hylian-mode');
    }
  }

  switchPane(pane: string) {
    if (pane === 'spane-checklist') {
      this.syncChecklistMarkedState();
    }
    this.sidebar.open(pane);
  }

  private syncChecklistMarkedState() {
    if (!this.checklists || !this.checklists.lists)
      return;
    let anyChanged = false;
    for (const list of this.checklists.lists) {
      if (!list.items)
        continue;
      let changed = false;
      const items: any = { ...list.items };
      for (const key of Object.keys(items)) {
        const item = items[key];
        const marked = this.checklists.isMarked(item.hash_id);
        if (item.marked !== marked) {
          items[key] = { ...item, marked };
          changed = true;
        }
      }
      if (changed) {
        list.items = items;
        anyChanged = true;
      }
    }
    if (anyChanged) {
      this.checklists.lists = [...this.checklists.lists];
    }
  }

  private initGeojsonFeature(layer: any) {
    if (!(layer.setStyle))
      return;

    layer.on('mouseover', () => {
      layer.setStyle({ weight: 5 });
    });
    layer.on('mouseout', () => {
      layer.setStyle({ weight: 3 });
    });
    if (!layer.bindContextMenu) {
      return;
    }
    // @ts-ignore
    layer.bindContextMenu({
      contextmenu: true,
      contextmenuItems: [{
        text: 'Change color to current polyline color',
        index: 0,
        callback: () => {
          layer.setStyle({ color: this.drawLineColor });
          const id = this.drawLayer.getLayerId(layer);
          const opts = this.drawLayerOpts.find((layer: any) => layer.id == id);
          if (opts) {
            opts.color = this.drawLineColor;
          }
        },
      }, {
        text: 'Toggle editing this marker or line',
        index: 1,
        callback: () => {
          this.singleEdit.edit(this.map.m, layer)
        },
      }, {
        separator: true,
        index: 2,
      }],
    });
  }

  toggleLayerVisibility(event: any) {
    const layer = this.drawLayer.getLayer(event.target.id);
    if (!layer)
      return;
    if (this.map.m.hasLayer(layer)) {
      layer.remove();
    } else {
      layer.addTo(this.map.m);
    }
  }
  toggleAllLayers(on: boolean) {
    this.drawLayerOpts.forEach((opt: any) => {
      opt.visible = on
      let layer = this.drawLayer.getLayer(opt.id);
      if (!layer)
        return;
      if (on)
        layer.addTo(this.map.m)
      else
        layer.remove()
    })
  }

  updateDrawLayers() {
    const activeLayer = this.map.activeLayer;
    this.drawLayer.eachLayer((layer: any) => {
      const opacity = (layer.feature.properties.map_layer == activeLayer) ? 1.0 : MARKER_OPACITIES[this.markerVisibility];
      if (ui.leafletType(layer) == ui.LeafletType.Marker) {
        layer.setOpacity(opacity)
      } else {
        layer.setStyle({ opacity });
      }
    })
    // Update persisted korok path opacity based on their stored layer
    for (const [, entry] of objDetailsStaticData.persistentKorokPaths) {
      const opacity = (entry.map_layer === activeLayer) ? 1.0 : 0;
      for (const m of entry.markers) {
        if (m.setOpacity) m.setOpacity(opacity);
        else if (m.setStyle) m.setStyle({ opacity });
      }
    }
    // Update auto korok pair line opacity based on stored layer
    for (const [, entry] of this.korokPairLines) {
      const opacity = (entry.map_layer === activeLayer) ? 1.0 : 0;
      entry.lines.forEach(l => l.setStyle({ opacity }));
    }
  }

  changeLayerColor(event: any) {
    const id = Number(event.target.attributes.layer_id.value);
    const color = event.target.value;
    const layer: any = this.drawLayer.getLayer(id);
    if (!layer)
      return;
    layer.options.color = color;
    if (ui.leafletType(layer) == ui.LeafletType.Marker) {
      layer.setIcon(ui.svgIcon(color));
    } else {
      layer.setStyle({ color: layer.options.color });
    }
    const layerOpt = this.drawLayerOpts.find((layer: any) => layer.id == id);
    if (layerOpt) {
      layerOpt.color = color;
    }
  }

  createDrawLayerOpts() {
    if (!this.drawLayer)
      return [];
    const layerIDs = this.drawLayer.getLayers().map((layer: any) => {
      let props = layer.feature.properties;
      const id = this.drawLayer.getLayerId(layer);
      const opt = this.drawLayerOpts.find(opt => opt.id == id);
      const visible = (opt && opt.visible !== undefined) ? opt.visible : true;
      return {
        id,
        color: layer.options.color,
        order: props.order,
        title: props.title,
        text: props.text,
        length: (ui.leafletType(layer) == ui.LeafletType.Marker) ? "" : props.pathLength.toFixed(2),
        visible,
        map_layer: props.map_layer,
      };
    })
    // order values < 0 are appended at the end and given a value
    const ordered = layerIDs.filter((layer: any) => layer.order >= 0);
    const unordered = layerIDs.filter((layer: any) => layer.order < 0);
    let n = ordered.length;
    unordered.forEach((layer: any) => { layer.order = n++; });
    ordered.push(...unordered);
    layerIDs.sort((a: any, b: any) => a.order - b.order);
    return layerIDs;
  }

  updateDrawLayerOptsIndex() {
    this.drawLayerOpts.forEach((layer: any, k: number) => {
      layer.order = k;
      // @ts-ignore
      this.drawLayer.getLayer(layer.id).feature.properties.order = k;
    });
  }

  updateDrawLayerOpts(updates: any = {}) {
    this.$nextTick(() => {
      if (updates.layer) {
        let id = this.drawLayer.getLayerId(updates.layer);
        let opt = this.drawLayerOpts.find((layer: any) => layer.id == id)
        if (opt) {
          opt.title = updates.title || opt.title;
          opt.text = updates.text || opt.text;
          opt.map_layer = updates.map_layer || opt.map_layer;
        }
      } else {
        this.drawLayerOpts = this.createDrawLayerOpts();
      }
      this.updateDrawLayerOptsIndex();
    });
  }

  forceLeafletDrawToAvoidTouchScreenBehavior() {
    if (!this.settings!.noTouchScreen)
      return;
    if (this.drawControl && this.drawControl._toolbars.draw._modes.polyline) {
      this.drawControl._toolbars.draw._modes.polyline.handler._onTouch = () => { };
    }
  }

  initDrawTools() {
    const icon = new L.DivIcon({
      iconSize: new L.Point(12, 12),
      className: 'leaflet-div-icon leaflet-editing-icon'
    });

    this.drawLayer = new L.GeoJSON(undefined, {
      style: (feature) => {
        // @ts-ignore
        return feature.style || {};
      },
      onEachFeature: (feature, layer) => { this.initGeojsonFeature(layer); },
    });
    const savedData = Settings.getInstance().drawLayerGeojson;
    if (savedData)
      this.drawFromGeojson(JSON.parse(savedData));
    this.drawLayer.addTo(this.map.m);
    let options: any = {
      position: 'topleft',
      draw: {
        circlemarker: false,
        rectangle: { showRadius: false },
        marker: {
          icon: ui.svgIcon(this.drawLineColor),
          repeatMode: false,
        }
      },
      edit: {
        featureGroup: this.drawLayer,
      },
    };
    if (this.settings!.noTouchScreen) {
      options.draw.polyline = { icon, allowIntersection: true };
      options.edit.poly = { icon, allowIntersection: true };
    }
    // @ts-ignore
    this.drawControl = new L.Control.Draw(options);
    this.setLineColorThrottler = debounce(() => this.setLineColor(), 100);
    this.map.m.on({
      // @ts-ignore
      'draw:created': (e: any) => {
        let group = [];
        if (ui.leafletType(e.layer) == ui.LeafletType.Polyline) {
          const map_layers = this.drawVertexLayers.filter((value, index, self) => { return self.indexOf(value) == index; });
          if (map_layers.length != 1) {
            const color = e.layer.options.color || this.drawLineColor;
            const latlngs = e.layer.getLatLngs();
            if (latlngs.length != this.drawVertexLayers.length) {
              console.error("Mismatch between polyline vertex and drawVertexLayer lengths");
              return;
            }
            let k = 0; // Last index in latlngs and drawVertexLayers
            let p0 = undefined; // Last interpolation point
            for (let i = 1; i < latlngs.length; i++) {
              if (this.drawVertexLayers[i - 1] != this.drawVertexLayers[i]) {
                // Points on different maps get split either in half or in thirds
                if (this.drawVertexLayers[i - 1] != "Surface" && this.drawVertexLayers[i] != "Surface") {
                  // Go from Sky <-> Depths, skipping the surface, divide into 3 parts
                  const p1 = interp(latlngs[i - 1], latlngs[i], 1. / 3.);
                  const p2 = interp(latlngs[i - 1], latlngs[i], 2. / 3.);
                  const pts = (p0) ? [p0, ...latlngs.slice(k, i), p1] : [...latlngs.slice(k, i), p1];
                  group.push({ layer: L.polyline(pts, { color }), map_layer: this.drawVertexLayers[k] });
                  group.push({ layer: L.polyline([p1, p2], { color }), map_layer: 'Surface' });
                  p0 = p2;
                } else {
                  const pts = (p0) ? [p0, ...latlngs.slice(k, i)] : [...latlngs.slice(k, i)];
                  p0 = interp(latlngs[i - 1], latlngs[i], 0.5);
                  pts.push(p0);
                  group.push({ layer: L.polyline(pts, { color }), map_layer: this.drawVertexLayers[k] });
                }
                k = i;
              }
            }
            const pts = [p0, ...latlngs.slice(k)];
            group.push({ layer: L.polyline(pts, { color }), map_layer: this.drawVertexLayers[k] });
          } else {
            group.push({ layer: e.layer, map_layer: this.drawVertexLayers[0] });
          }
        } else {
          group.push({ layer: e.layer, map_layer: this.map.activeLayer });
        }
        group.forEach((e: any) => {
          addGeoJSONFeatureToLayer(e.layer);
          calcLayerLength(e.layer);
          e.layer.feature.properties.map_layer = e.map_layer;
          addPopupAndTooltip(e.layer, this);
          this.drawLayer.addLayer(e.layer);
          this.initGeojsonFeature(e.layer);
          if (!e.layer.options.color) {
            e.layer.options.color = this.drawLineColor;
          }
        })
        this.updateDrawLayers();
        this.updateDrawLayerOpts();
      },
      'draw:drawstart': () => {
        this.drawVertexLayers = [];
      },
      'draw:drawvertex': (item: any) => {
        // Determine if points have been added or removed
        const n0 = this.drawVertexLayers.length
        const n1 = item.layers.getLayers().length;
        if (n0 + 1 == n1) // Point Added
          this.drawVertexLayers.push(this.map.activeLayer);
        else if (n0 - 1 == n1) // Point Removed (Assume 'delete last point' clicked)
          this.drawVertexLayers.pop()
        else {
          console.log(`Unknown state encountered currentPoints(edit) ${n1} layers ${n0}`)
        }
      },
      'draw:edited': (e: any) => {
        e.layers.eachLayer((layer: L.Marker | L.Polyline) => {
          calcLayerLength(layer);
          layerSetTooltip(layer);
        });
        this.updateDrawLayerOpts();
      },
      'draw:deleted': (e: any) => {
        // Only use confirm dialog if editable layer is empty and
        //   the layers passed are not empty
        // A 'Save' action should have a possibly non-empty editable layer
        if (this.drawLayer.getLayers().length == 0 && e.layers.getLayers().length != 0) {
          let ans = confirm("Clear all map items?");
          if (!ans) {
            e.layers.eachLayer((layer: L.Marker | L.Polyline) => this.drawLayer.addLayer(layer));
          }
        }
        this.updateDrawLayerOpts();
      },
    });
    this.drawOnColorChange({});
    Settings.getInstance().registerBeforeSaveCallback(() => {
      Settings.getInstance().drawLayerGeojson = JSON.stringify(this.drawToGeojson());
    });
    this.updateDrawControlsVisibility();
    this.updateDrawLayerOpts();
    this.updateDrawLayers();
  }

  private layerFromGeoJSON(feat: any): L.Layer {
    let isCircle = feat.geometry.type == "Point" && feat.properties.radius;
    if (isCircle) {
      let latlon = L.latLng(feat.geometry.coordinates[1], feat.geometry.coordinates[0]);
      return new L.Circle(latlon, { radius: feat.properties.radius });
    }
    return L.GeoJSON.geometryToLayer(feat);
  }

  private drawFromGeojson(data: any) {
    if (this.importReplace) {
      this.drawLayer.clearLayers();
    }
    data.features.forEach((feat: any) => {
      let layer: any = this.layerFromGeoJSON(feat);
      // Only set style for Polylines not Markers
      let color = feat.style.color || this.drawLineColor;
      if (ui.leafletType(layer) == ui.LeafletType.Marker) {
        layer.options.color = color;
        layer.setIcon(ui.svgIcon(color));
      } else {
        layer.setStyle({ color: color });
      }
      // Create Feature.Properties on Layer
      addGeoJSONFeatureToLayer(layer);
      // Copy Properties from GeoJSON
      layer.feature.properties.fromGeoJSON(feat);
      calcLayerLength(layer);
      addPopupAndTooltip(layer, this);
      this.drawLayer.addLayer(layer);
      this.initGeojsonFeature(layer);
    });
    this.updateDrawLayerOpts();
  }

  private drawToGeojson(): GeoJSON.FeatureCollection {
    const data = <GeoJSON.FeatureCollection>(this.drawLayer.toGeoJSON());
    // XXX: Terrible hack to add colors to LineStrings.
    let i = 0;
    this.drawLayer.eachLayer(layer => {
      // @ts-ignore
      data.features[i].style = {
        // @ts-ignore
        color: layer.options.color,
      };
      if (ui.leafletType(layer) == ui.LeafletType.Circle) {
        // @ts-ignore
        data.features[i].properties.radius = (layer as L.Circle).options.radius;
      }
      ++i;
    });
    return data;
  }

  toggleDraw() {
    Settings.getInstance().drawControlsShown = !Settings.getInstance().drawControlsShown;
    this.updateDrawControlsVisibility();
  }

  updateDrawControlsVisibility() {
    if (Settings.getInstance().drawControlsShown) {
      this.drawControl.addTo(this.map.m);
      this.forceLeafletDrawToAvoidTouchScreenBehavior();
    } else
      this.drawControl.remove();
  }

  drawImport() {
    const input = <HTMLInputElement>(document.getElementById('fileinput'));
    input.click();
  }

  private async drawImportCb() {
    const input = <HTMLInputElement>(document.getElementById('fileinput'));
    if (!input.files!.length)
      return;
    try {
      const rawData = await (new Response(input.files![0])).json();
      const version: number | undefined = rawData.OBJMAP_SV_VERSION;
      if (!version) {
        this.drawFromGeojson(rawData);
      } else {
        const data = <save.SaveData>(rawData);
        this.drawFromGeojson(data.drawData);
        if (version >= 2) {
          data.searchGroups.forEach(g => {
            this.searchAddGroup(g.query, g.label, g.enabled, g.color);
          });
          data.searchExcludeSets.forEach(g => {
            this.searchAddExcludedSet(g.query, g.label);
          });
        }
        // Version 4 Add .map_layer = [Surface, Sky, Depths]
        //   Handled by fromGeoJSON()
      }
    } catch (e) {
      alert(e);
    } finally {
      input.value = '';
    }
  }

  drawExport() {
    const data: save.SaveData = {
      OBJMAP_SV_VERSION: save.CURRENT_OBJMAP_SV_VERSION,
      drawData: this.drawToGeojson(),
      searchGroups: this.searchGroups.map(g => ({
        label: g.label,
        query: g.query,
        enabled: g.enabled,
        color: g.getFillColor(),
      })),
      searchExcludeSets: this.searchExcludedSets.filter(g => !g.hidden).map(g => ({
        label: g.label,
        query: g.query,
      })),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'objmap_save.json';
    a.click();
  }

  setLineColor() {
    this.drawControl.setDrawingOptions({
      polyline: { shapeOptions: { color: this.drawLineColor, opacity: 1.0 } },
      polygon: { shapeOptions: { color: this.drawLineColor, opacity: 1.0 } },
      circle: { shapeOptions: { color: this.drawLineColor, opacity: 1.0 } },
      rectangle: { shapeOptions: { color: this.drawLineColor, opacity: 1.0 } },
      marker: {
        icon: ui.svgIcon(this.drawLineColor),
        repeatMode: false,
      }
    });
  }

  drawOnColorChange(ev: any) {
    if (ev.target) {
      this.drawLineColor = ev.target.value;
    }
    this.setLineColorThrottler();
  }

  showGreatPlateauBarrier() {
    if (!this.greatPlateauBarrierShown) {
      const RESPAWN_POS: Point = [-1021.7286376953125, 0, 1792.6009521484375];
      const respawnPosMarker = new MapMarkers.MapMarkerPlateauRespawnPos(this.map, RESPAWN_POS);
      const topLeft = this.map.fromXYZ([-1600, 0, 1400]);
      const bottomRight = this.map.fromXYZ([-350, 0, 2400]);
      const rect = L.rectangle(L.latLngBounds(topLeft, bottomRight), {
        fill: false,
        stroke: true,
        color: '#c50000',
        weight: 2,
        // @ts-ignore
        contextmenu: true,
        contextmenuItems: [{
          text: 'Hide barrier and respawn point',
          callback: () => {
            respawnPosMarker.getMarker().remove();
            rect.remove();
            this.greatPlateauBarrierShown = false;
          },
        }],
      });
      rect.addTo(this.map.m);
      respawnPosMarker.getMarker().addTo(this.map.m);
      this.greatPlateauBarrierShown = true;
    }
    this.map.setView([-965, 0.0, 1875], 5);
  }

  gotoOnSubmit(xyz: Point) {
    this.map.setView(xyz);
    if (this.previousGotoMarker)
      this.previousGotoMarker.remove();
    this.previousGotoMarker = L.marker(this.map.fromXYZ(xyz), {
      // @ts-ignore
      contextmenu: true,
      contextmenuItems: [{
        text: 'Hide',
        callback: () => { this.previousGotoMarker!.remove(); this.previousGotoMarker = null; },
      }],
    }).addTo(this.map.m);
  }

  initMarkerDetails() {
    this.map.registerMarkerSelectedCb((marker: MapMarker) => {
      this.openMarkerDetails(getMarkerDetailsComponent(marker), marker);
    });
    this.map.m.on({ 'click': () => this.closeMarkerDetails() });
  }

  setLocalDetails(marker: MapMarker) {
    //@ts-ignore
    if (marker.obj && marker.obj['hash_id']) {
      const marks: { [key: string]: boolean } = {};
      //@ts-ignore
      const hash = marker.obj.hash_id;
      marks[hash] = this.checklists.isMarked(hash) || false;
      this.localDetails = Object.assign({}, marks);
    }
  }

  openMarkerDetails(component: string, marker: MapMarker, zoom = -1) {
    this.setLocalDetails(marker);
    this.closeMarkerDetails(true);
    this.detailsMarker = new ui.Unobservable(marker);
    this.detailsComponent = component;
    this.switchPane('spane-details');
    this.detailsPaneOpened = true;
    this.detailsPinMarker = new ui.Unobservable(L.marker(marker.getMarker().getLatLng(), {
      pane: 'front',
    }).addTo(this.map.m));

    if (zoom == -1)
      this.map.m.panTo(marker.getMarker().getLatLng());
    else
      this.map.m.setView(marker.getMarker().getLatLng(), zoom);

    if (marker instanceof MapMarkers.MapMarkerObj || marker instanceof MapMarkers.MapMarkerKorok || marker instanceof MapMarkers.MapMarkerLightroot || marker instanceof MapMarkers.MapMarkerCave || marker instanceof MapMarkers.MapMarkerTower || marker instanceof MapMarkers.MapMarkerLabo || marker instanceof MapMarkers.MapMarkerTear) {
      this.switchToObjectLayer(marker.obj);
    }
  }

  closeMarkerDetails(forOpen = false) {
    if (!this.detailsPaneOpened)
      return;
    this.detailsComponent = '';
    this.detailsMarker = null;
    if (!forOpen) {
      this.sidebar.close();
    }
    if (this.detailsPinMarker) {
      this.detailsPinMarker.data.remove();
      this.detailsPinMarker = null;
    }
    this.detailsPaneOpened = false;
  }

  initSearch() {
    this.searchThrottler = debounce(() => this.search(), 200);

    this.map.registerZoomCb(() => {
      for (const group of this.searchGroups)
        group.update(0 as SearchResultUpdateMode, this.searchExcludedSets);
    });

    void this.restoreSearchGroupsFromSettings();
  }

  private persistSearchGroupsToSettings() {
    if (!this.settings)
      return;
    this.settings.savedSearchGroups = this.searchGroups.map(g => ({
      label: g.label,
      query: g.query,
      enabled: g.enabled,
      color: g.getFillColor(),
    }));
    this.settings.savedSearchExcludeSets = this.searchExcludedSets.filter(g => !g.hidden).map(g => ({
      label: g.label,
      query: g.query,
    }));
  }

  private async restoreSearchGroupsFromSettings() {
    if (!this.settings)
      return;
    const groups = this.settings.savedSearchGroups || [];
    const excludes = this.settings.savedSearchExcludeSets || [];

    for (const g of groups)
      await this.searchAddGroup(g.query, g.label, g.enabled, g.color, false);
    for (const g of excludes)
      await this.searchAddExcludedSet(g.query, g.label, false);

    for (const group of this.searchGroups)
      group.update(SearchResultUpdateMode.UpdateVisibility | SearchResultUpdateMode.UpdateStyle | SearchResultUpdateMode.UpdateTitle, this.searchExcludedSets);
    this.clUpdateMarkers();
    // Purge invalid saved queries that failed to restore.
    this.persistSearchGroupsToSettings();
  }

  searchGetQuery() {
    let query = this.searchQuery.trim();
    query = this.expandCaveMapQuery(query);
    //if (/^0x[0-9A-Fa-f]{6}/g.test(query))
    //  query = BigInt(query).toString(10);
    return query;
  }

  private expandCaveMapQuery(query: string): string {
    const mapTokenRegex = /map:("[^"]+"|[^\s]+)/g;
    return query.replace(mapTokenRegex, (token: string, rawValue: string) => {
      const value = rawValue.startsWith('"') && rawValue.endsWith('"')
        ? rawValue.slice(1, -1)
        : rawValue;

      const normalized = value.startsWith('MainField/') ? value.slice('MainField/'.length) : value;
      if (!normalized.startsWith('Cave__Cave_'))
        return token;

      const locationToken = normalized.replace(/^Cave__/, '').replace(/\*+$/, '');
      if (!locationToken)
        return token;

      return `(${token} OR ${locationToken})`;
    });
  }


  searchJumpToResult(idx: number) {
    const marker = this.searchResultMarkers[idx];
    this.openMarkerDetails(getMarkerDetailsComponent(marker.data), marker.data, 6);
  }

  searchOnInput() {
    this.searching = true;
    this.searchThrottler();
  }

  searchSetLink() {
    const query = this.searchGetQuery();
    this.$router.replace({
      path: this.$route.fullPath,
      query: {
        q: query,
      }
    })
  }

  searchOnAdd() {
    this.searchAddGroup(this.searchGetQuery());
    this.searchQuery = '';
    this.search();
  }

  searchOnExclude() {
    this.searchAddExcludedSet(this.searchGetQuery());
    this.searchQuery = '';
    this.search();
  }

  private async resetCompletedVisibleSearches() {
    if (!confirm('Reset completed status for objects in currently visible searches?'))
      return;

    const excludedIds = new Set<number>();
    for (const set of this.searchExcludedSets) {
      set.ids.forEach(id => excludedIds.add(id));
    }

    const useLayerFilter = this.settings ? this.settings.showObjectsCurrentLayer : false;
    const hashes = new Set<string>();
    for (const group of this.searchGroups) {
      if (group.enabled === false)
        continue;
      for (const marker of group.getMarkers()) {
        const obj = marker.obj;
        if (excludedIds.has(obj.objid))
          continue;
        if (useLayerFilter && !isObjectInLayer(obj, this.map.activeLayer))
          continue;
        hashes.add(obj.hash_id);
      }
    }

    for (const hash of hashes) {
      if (this.checklists.isMarked(hash))
        await this.checklists.setMarked(hash, false);
    }
    this.clUpdateMarkers();
    this.refreshMapTowerCompletion();
  }

  private async resetCompletedAll() {
    if (!confirm('Reset completed status for all objects?'))
      return;
    const hashes = Object.keys(this.checklists.marked);
    for (const hash of hashes) {
      if (this.checklists.isMarked(hash))
        await this.checklists.setMarked(hash, false);
    }
    this.clUpdateMarkers();
    this.refreshMapTowerCompletion();
  }

  async searchAddExcludedSet(query: string, label?: string, persist = true): Promise<boolean> {
    if (this.searchExcludedSets.some(g => !!g.query && g.query == query))
      return true;

    const set = new SearchExcludeSet(query, query);
    try {
      await set.init();
    } catch (e) {
      return false;
    }
    this.searchExcludedSets.push(set);
    for (const group of this.searchGroups)
      group.update(SearchResultUpdateMode.UpdateVisibility, this.searchExcludedSets);
    if (persist)
      this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
    return true;
  }

  async searchAddGroup(query: string, label?: string, enabled = true, color?: string, persist = true): Promise<boolean> {
    if (this.searchGroups.some(g => !!g.query && g.query == query))
      return true;

    const opacity = MARKER_OPACITIES[this.clMarkerVisibility];
    const showCheckmark = this.shouldShowChecklistCheckmark();
    const useAlternateUnmarkedIcon = this.shouldUseAlternateUnmarkedIcons();
    const group = new SearchResultGroup(query, label || query, enabled);
    try {
      await group.init(this.map);
    } catch (e) {
      return false;
    }
    if (color)
      group.setFillColor(color);
    group.update(SearchResultUpdateMode.UpdateStyle | SearchResultUpdateMode.UpdateVisibility, this.searchExcludedSets);
    group.getMarkers().forEach((marker: any) => {
      const hash_id = marker.obj.hash_id;
      const marked = this.checklists.isMarked(hash_id);
      marker.setMarked(marked, marked ? opacity : 1.0, showCheckmark);
      this.applyAlternateUnmarkedIcon(marker, !marked && useAlternateUnmarkedIcon);
    });
    this.searchGroups.push(group);
    this.updateTooltips();
    if (persist)
      this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
    return true;
  }

  searchToggleGroupEnabledStatus(idx: number) {
    const group = this.searchGroups[idx];
    group.update(SearchResultUpdateMode.UpdateVisibility, this.searchExcludedSets);
    this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
  }

  searchReorderGroups() {
    this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
  }

  searchViewGroup(idx: number) {
    const group = this.searchGroups[idx];
    this.searchQuery = group.query;
    this.search();
  }

  async searchCreateChecklist(idx: number) {
    const group = this.searchGroups[idx];
    const list = await this.checklists.createFromSearch(group.label, group.query);
    await this.clChangeQuery(list);
    this.checklists.lists = [...this.checklists.lists];
    this.switchPane('spane-checklist');
  }

  searchColorGroup(ev: any) {
    const idx = parseInt(ev.target.dataset.id)
    const group = this.searchGroups[idx];
    group.setFillColor(ev.target.value)
    group.update(SearchResultUpdateMode.UpdateVisibility | SearchResultUpdateMode.UpdateStyle,
      this.searchExcludedSets);
    this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
  }

  searchRemoveGroup(idx: number) {
    const group = this.searchGroups[idx];
    group.remove();
    this.searchGroups.splice(idx, 1);
    this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
  }

  searchRemoveExcludeSet(idx: number) {
    this.searchExcludedSets.splice(idx, 1);
    for (const group of this.searchGroups)
      group.update(SearchResultUpdateMode.UpdateVisibility, this.searchExcludedSets);
    this.persistSearchGroupsToSettings();
    this.refreshMapTowerCompletion();
  }

  async search() {
    this.searching = true;
    this.searchResultMarkers.forEach(m => m.data.getMarker().remove());
    this.searchResultMarkers = [];

    const generation = ++this.searchGeneration;
    const query = this.searchGetQuery();
    let results: ObjectMinData[];
    let failed = false;
    try {
      results = await MapMgr.getInstance().getObjs(this.settings!.mapType, this.settings!.mapName, query, false, this.MAX_SEARCH_RESULT_COUNT);
    } catch (e) {
      results = [];
      failed = true;
    }
    // A newer search was started while we were waiting; discard these results.
    if (generation !== this.searchGeneration) {
      return;
    }
    this.searchResults = results;
    this.searchLastSearchFailed = failed;
    const groupOpacity = MARKER_OPACITIES[this.clMarkerVisibility];
    const showCheckmark = this.shouldShowChecklistCheckmark();
    const useAlternateUnmarkedIcon = this.shouldUseAlternateUnmarkedIcons();
    let marks: { [key: string]: boolean } = {};
    for (const result of this.searchResults) {
      const marker = new ui.Unobservable(new MapMarkers.MapMarkerSearchResult(this.map, result));
      marks[result.hash_id] = false;
      const marked = this.checklists.isMarked(result.hash_id);
      marker.data.setMarked(marked, marked ? ACTIVE_SEARCH_MARKED_OPACITY : 1.0, showCheckmark);
      marks[result.hash_id] = marked;
      this.searchResultMarkers.push(marker);
      marker.data.getMarker().addTo(this.map.m);
    }

    this.localSearch = Object.assign({}, marks);
    this.updateTooltips();
    this.updateSearchResultMarkerVisibility();
    this.searching = false;
  }

  private updateSearchResultMarkerVisibility() {
    if (!this.settings)
      return;
    const useLayerFilter = this.settings.showObjectsCurrentLayer;
    for (const marker of this.searchResultMarkers) {
      const shouldShow = !useLayerFilter || isObjectInLayer(marker.data.obj, this.map.activeLayer);
      const layer = marker.data.getMarker();
      if (shouldShow) {
        if (!this.map.m.hasLayer(layer))
          layer.addTo(this.map.m);
      } else if (this.map.m.hasLayer(layer)) {
        layer.remove();
      }
    }
  }

  enableYTooltip(marker: any) {
    let m: any = marker.getMarker();
    if (!('_tooltip' in marker.obj)) {
      // @ts-ignore
      let tt = m.getTooltip();
      marker.obj._tooltip = tt.getContent();
      marker.obj._tooltip_options = tt.options;
    }
    //To update the tooltip with the permanent flag,
    //   we needed to unbind() then re-bind() the tooltip
    //   with a different permanent flag value.
    if (!m.getTooltip().options.permanent) {
      m.unbindTooltip();
      m.bindTooltip(`${marker.obj.pos[1]}`, { permanent: true });
      m.openTooltip();
    }
  }

  disableYTooltip(marker: any) {
    let m: any = marker.getMarker();
    if (m.getTooltip().options.permanent) {
      m.getTooltip().options.permanent = false;
      m.unbindTooltip();
      m.bindTooltip(marker.obj._tooltip, marker.obj._tooltip_options);
      m.closeTooltip();
    }
  }

  toggleYTooltipOnAllMarkers(on: boolean) {
    let func = on ? this.enableYTooltip : this.disableYTooltip;
    this.searchResultMarkers.map(m => m.data).forEach(func);
    this.searchGroups.forEach(group => {
      group.getMarkers().forEach(func);
    });
  }

  updateTooltips() {
    this.toggleYTooltipOnAllMarkers(this.staticTooltip);
  }

  toggleY() {
    this.staticTooltip = !this.staticTooltip;
    this.updateTooltips();
  }

  clClearAsk() {
    if (confirm('Remove all checklists and reset marked data?')) {
      this.clClear();
    }
  }

  clClear() {
    this.checklists.clear();
  }

  clCreate() {
    this.checklists.create();
  }

  clDelete(remove: any) {
    if (confirm(`Delete checklist ${remove.name}?`)) {
      this.checklists.delete(remove.id);
    }
  }

  minObjToCL(obj: ObjectMinData) {
    let ui_name = obj.name;
    const location = obj.Location;
    if (location && (obj.name == 'LocationMarker' || obj.name == 'LocationArea')) {
      if (location.includes('Dungeon')) {
        ui_name = MsgMgr.getInstance().getMsgWithFile('StaticMsg/Dungeon', location);
      } else {
        ui_name = MsgMgr.getInstance().getMsgWithFile('StaticMsg/LocationMarker', location);
      }
    } else if (obj.korok_id) {
      ui_name = obj.korok_id;
    } else {
      ui_name = ui.getName(obj.name);
    }
    if (ui_name === undefined) {
      ui_name = obj.name;
    }
    return {
      hash_id: obj.hash_id,
      name: obj.name,
      map_type: obj.map_type,
      map_name: obj.map_name,
      ui_name: ui_name,
      pos: obj.pos,
      marked: this.checklists.isMarked(obj.hash_id),
    };
  }

  clUpdateMarkers() {
    this.updateMarkers();
    this.searchResultMarkers.forEach(m => this.updateMarkerCheckmark(m.data));
    this.searchGroups.forEach(group => {
      group.getMarkers().forEach(m => this.updateMarkerCheckmark(m));
    })
  }

  async clChangeQuery(list: any) {
    const query = list.query;
    let results = [];
    try {
      results = await MapMgr.getInstance().getObjs(this.settings!.mapType, this.settings!.mapName, query, false, 5000);
    } catch (e) {
      list.items = {};
      return;
    }
    list.items = {}
    let items = [];
    for (const item of results) {
      items.push(this.minObjToCL(item));
    }
    items.sort((a: any, b: any) => a.ui_name.localeCompare(b.ui_name));
    for (const item of items) {
      list.items[item.hash_id] = item;
    }
    await this.checklists.update(list);
    this.checklists.lists = [...this.checklists.lists];
  }

  async clExport() {
    const data = await this.checklists.db.export();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'objmap_checklists.json';
    a.click();
  }

  clImport() {
    const input = <HTMLInputElement>(document.getElementById('clFileinput'));
    input.click();
  }

  private async clImportCb() {
    const input = <HTMLInputElement>(document.getElementById('clFileinput'));
    if (!input.files!.length) {
      return;
    }
    try {
      const rawData = await (new Response(input.files![0])).json();
      this.checklists.db.import(rawData, this.clImportReplace);
      await this.initChecklist();
    } catch (e) {
      alert(e);
    } finally {
      input.value = '';
    }
  }

  // Item: {
  //      hash_id: string,
  //      label: undefined | string // defined which marker group it belongs to
  // }
  async updateSearchResultMarkers(item: any, toggle: boolean = true) {
    let value = this.checklists.isMarked(item.hash_id);
    if (toggle) {
      value = !value;
      value = await this.checklists.setMarked(item.hash_id, value);
    }

    // Auto-mark korok friend pair (opacity-alt only)
    let friendHashId: string | null = null;
    if (toggle && this.clMarkerVisibility === 'opacity-alt') {
      const korokGroup = this.markerGroups.get('Korok');
      if (korokGroup) {
        // @ts-ignore
        const korokMarker = korokGroup.find((m) => m.getHashID() === item.hash_id);
        // @ts-ignore
        if (korokMarker && korokMarker.info && korokMarker.info.friend_hash_id) {
          // @ts-ignore
          friendHashId = korokMarker.info.friend_hash_id;
          this.checklists.setMarked(friendHashId!, value);
        }
      }
    }

    const groupOpacity = (value) ? MARKER_OPACITIES[this.clMarkerVisibility] : 1.0;
    const activeSearchOpacity = value ? ACTIVE_SEARCH_MARKED_OPACITY : 1.0;
    const showCheckmark = this.shouldShowChecklistCheckmark();
    const useAlternateUnmarkedIcon = this.shouldUseAlternateUnmarkedIcons();
    this.$nextTick(() => {
      if (item.hash_id in this.localDetails)
        this.localDetails[item.hash_id] = value;
      if (item.hash_id in this.localSearch)
        this.localSearch[item.hash_id] = value;
      // Search Result Markers
      const marker = this.searchResultMarkers.find(m => m.data.obj.hash_id == item.hash_id);
      if (marker) {
        marker.data.setMarked(value, activeSearchOpacity, showCheckmark);
      }

      // Group Marker (from Add to Map and Preset Searches)
      for (const group of this.searchGroups) { // Has a label and query
        const marker = group.getMarkers().find(marker => marker.obj.hash_id == item.hash_id);
        if (marker) {
          marker.setMarked(value, groupOpacity, showCheckmark);
          this.applyAlternateUnmarkedIcon(marker, !value && useAlternateUnmarkedIcon);
        }
      }
      for (const [key, group] of this.markerGroups) {
        if (item.label && item.label != key) {
          continue
        }
        // @ts-ignore
        const marker = group.find((marker) => { return marker.getHashID() == item.hash_id });
        if (marker) {
          // @ts-ignore
          marker.setMarked(value, groupOpacity, showCheckmark);
          // @ts-ignore
          this.applyAlternateUnmarkedIcon(marker, !value && useAlternateUnmarkedIcon);
          continue;
        }

        if (key === 'Dungeon') {
          // @ts-ignore
          const dungeonMarker = group.find((marker) => {
            return marker instanceof MapMarkers.MapMarkerDungeon
              && this.shrineBgmHashByDungeonMessageId.get(marker.getMessageId()) === item.hash_id;
          });
          if (dungeonMarker) {
            // @ts-ignore
            dungeonMarker.setMarked(value, groupOpacity, showCheckmark);
            // @ts-ignore
            this.applyAlternateUnmarkedIcon(dungeonMarker, !value && useAlternateUnmarkedIcon);
          }
        }
      }
      this.refreshMapTowerCompletion();

      // Update friend korok marker visual state
      if (friendHashId) {
        const korokGroup = this.markerGroups.get('Korok');
        if (korokGroup) {
          // @ts-ignore
          const friendMarker = korokGroup.find((m) => m.getHashID() === friendHashId);
          if (friendMarker) {
            // @ts-ignore
            friendMarker.setMarked(value, groupOpacity, showCheckmark);
            // @ts-ignore
            this.applyAlternateUnmarkedIcon(friendMarker, !value && useAlternateUnmarkedIcon);
          }
        }
        if (friendHashId in this.localDetails)
          this.localDetails[friendHashId] = value;
        if (friendHashId in this.localSearch)
          this.localSearch[friendHashId] = value;
      }

      // Auto-remove persisted korok paths when marked as found (opacity-alt only)
      if (value && this.clMarkerVisibility === 'opacity-alt') {
        this.autoRemovePersistedKorokPath(item.hash_id);
        if (friendHashId) {
          this.autoRemovePersistedKorokPath(friendHashId);
        }
      }
      // Sync auto pair lines whenever a korok is toggled
      this.syncKorokPairLines();
    })
  }

  private autoRemovePersistedKorokPath(hashId: string) {
    // Check all persisted paths to see if this hash_id is involved
    for (const [key, entry] of objDetailsStaticData.persistentKorokPaths) {
      // Direct match: this is the korok that was persisted
      if (key === hashId) {
        if (entry.relatedHashIds.length > 0) {
          // Korok friends: only remove when ALL related are marked
          const allMarked = entry.relatedHashIds.every(id => this.checklists.isMarked(id));
          if (!allMarked) continue;
        }
        entry.markers.forEach(m => m.remove());
        objDetailsStaticData.persistentKorokPaths.delete(key);
        continue;
      }
      // Indirect match: this hash_id is a related friend of a persisted path
      if (entry.relatedHashIds.includes(hashId)) {
        const allMarked = entry.relatedHashIds.every(id => this.checklists.isMarked(id));
        if (allMarked) {
          entry.markers.forEach(m => m.remove());
          objDetailsStaticData.persistentKorokPaths.delete(key);
        }
      }
    }
  }

  initContextMenu() {
    this.map.m.on(SHOW_ALL_OBJS_FOR_MAP_UNIT_EVENT, async (e) => {
      // @ts-ignore
      const latlng: L.LatLng = e.latlng;
      const xyz = this.map.toXYZ(latlng);
      if (!map.isValidPoint(xyz))
        return;
      const layer = this.map.activeLayer;
      const mapType = this.settings!.mapType;
      const mapName = this.settings!.mapName;
      if (mapType == 'SmallDungeon') {
        this.searchAddGroup(`map:"${mapType}/${mapName}"`, `Map: Shrine ${mapName}`);
      } else if (mapType == 'LargeDungeon') {
        this.searchAddGroup(`map:"${mapType}/${mapName}"`, `Map: Temples ${mapName}`);
      } else if (mapType == 'NormalStage') {
        this.searchAddGroup(`map:"${mapType}/${mapName}"`, `Map: Special Maps ${mapName}`);
      } else if (layer == 'Surface' || layer == 'Depths') {
        let mapType = (layer == "Surface") ? 'MainField' : 'MinusField';
        const quad = map.pointToMapUnit(xyz);
        let query = `map:"${mapType}/${quad}"`
        if (layer == 'Surface' && quad == 'A-8') { // Thunder Temple
          query += " OR LargeDungeonThunder"
        } else if (layer == 'Depths' && Math.abs(latlng.lat - -2800) < 350 && Math.abs(latlng.lng - 1325) < 250) {
          // Box around Fire Temple as it spans two Quads
          query += " OR LargeDungeonFire"
        }
        this.searchAddGroup(query, `Map: ${layer} ${quad}`);
      } else if (layer == 'Sky') {
        const regions = await MapMgr.getInstance().getRegionFromPoint(layer, xyz);
        let query = regions.map(region => `map: "MainField/Sky__${region}"`).join(" OR ");
        if (regions.includes("Pln_Fld_Rito_SkyField_Start_01")) { // Wind Temple
          query += " OR LargeDungeonWind"
        } else if (regions.includes("Pln_Fld_Zora_SkyField_Before_DungeonWay")) { // Water Temple
          query += " OR LargeDungeonWater"
        }
        const regionsStr = regions.join(" or ");
        this.searchAddGroup(query, `Map: ${regionsStr}`);
      }
    });
  }

  initEvents() {
    this.$on('AppMap:switch-pane', (pane: string) => {
      this.switchPane(pane);
    });
    this.$on('AppMap:toggle-y-values', () => {
      this.toggleY();
    });
    this.$on('AppMap:update-search-markers', (value: any) => {
      this.updateSearchResultMarkers(value);
    });
    this.$on('AppMap:check-korok-friends-marked', (value: any) => {
      const allMarked = value.friendHashIds.every((id: string) => this.checklists.isMarked(id));
      value.callback(allMarked);
    });
    this.map.m.on('AppMap:update-search-markers', (args) => {
      this.updateSearchResultMarkers(args);
    });
    this.$on('AppMap:search-on-value', (value: string) => {
      this.searchOnValue(value);
    });
    this.$on('AppMap:search-on-hash', (value: string) => {
      this.searchOnHash(value);
    });
    this.$on('AppMap:search-add-group', (value: any) => {
      this.searchAddGroup(value.query, value.name);
    });
    this.$on('AppMap:checklist-remove', (list: any) => {
      this.clDelete(list);
    });
    this.$on('AppMap:checklist-reset', () => {
      this.clClearAsk();
    });
    this.$on('AppMap:checklist-create', () => {
      this.clCreate();
    });
    this.$on('AppMap:checklist-reorder', async (value: any) => {
      if (!value || !Array.isArray(value.ids))
        return;
      await this.checklists.reorder(value.ids);
      this.checklists.lists = [...this.checklists.lists];
    });
    this.$on('AppMap:update-checklist-name', async (value: any) => {
      let list = this.checklists.read(value.id);
      if (!list)
        return;
      list.name = value.name;
      this.checklists.lists = [... this.checklists.lists];
      await this.checklists.update(list);
    });
    this.$on('AppMap:update-checklist-query', async (value: any) => {
      let list = this.checklists.read(value.id);
      if (!list)
        return;
      list.query = value.query;
      await this.clChangeQuery(list);
      this.checklists.lists = [... this.checklists.lists];
      await this.checklists.update(list);
    });
    this.$on('AppMap:open-obj', async (obj: ObjectData) => {
      if (this.tempObjMarker)
        this.tempObjMarker.data.getMarker().remove();
      this.tempObjMarker = new ui.Unobservable(new MapMarkers.MapMarkerObj(this.map, obj, '#e02500', '#ff2a00'));
      this.tempObjMarker.data.getMarker().addTo(this.map.m);
      this.openMarkerDetails(getMarkerDetailsComponent(this.tempObjMarker.data), this.tempObjMarker.data);
    });
    this.$on('AppMap:open-obj-no-temp-marker', async (obj: ObjectData) => {
      if (this.tempObjMarker)
        this.tempObjMarker.data.getMarker().remove();
      this.tempObjMarker = null;
      const marker = new MapMarkers.MapMarkerObj(this.map, obj, '#e02500', '#ff2a00');
      this.openMarkerDetails(getMarkerDetailsComponent(marker), marker);
    });
    this.$on('AppMap:open-shrine-from-bgm', (bgmObj: ObjectMinData) => {
      if (!bgmObj || !Array.isArray(bgmObj.pos) || bgmObj.pos.length < 3)
        return;

      // Use static data directly — always loaded, independent of filter state.
      const info = MapMgr.getInstance().getInfoMainField();
      const dungeonEntries: any[] = info.markers.Dungeon || [];
      // Narrow to cave shrines only for a tight match.
      const caveShrines = dungeonEntries.filter((e: any) => e.ShrineInCave);
      const candidates = caveShrines.length > 0 ? caveShrines : dungeonEntries;

      let best: any = null;
      let bestDist = Infinity;
      for (const entry of candidates) {
        const dx = entry.Translate.X - bgmObj.pos[0];
        const dy = entry.Translate.Y - bgmObj.pos[1];
        const dz = entry.Translate.Z - bgmObj.pos[2];
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestDist) {
          best = entry;
          bestDist = dist;
        }
      }

      if (best) {
        const shrineMarker = new MapMarkers.MapMarkerDungeon(this.map, best);
        this.openMarkerDetails('AppMapDetailsDungeon', shrineMarker);
      }
    });

    this.$on('AppMap:open-cave-from-shrine', (payload: ObjectMinData) => {
      let shrinePos = payload.pos;
      let bgmMapName = payload.map_name || '';

      if (!shrinePos)
        return;

      const info = MapMgr.getInstance().getInfoMainField();
      const caveEntries: any[] = info.markers.Cave || [];
      const caveAndWellEntries = caveEntries.filter((e: any) => e.Icon === 'Cave' || e.Icon === 'Well');
      const candidates = caveAndWellEntries.length > 0 ? caveAndWellEntries : caveEntries;

      if (bgmMapName) {
        const exact = candidates.find((e: any) => {
          const messageId = e && e.MessageID ? String(e.MessageID) : '';
          return !!messageId && bgmMapName.includes(`Cave__${messageId}`);
        });
        if (exact) {
          const caveMarker = new MapMarkers.MapMarkerCave(this.map, exact);
          this.openMarkerDetails('AppMapDetailsCave', caveMarker);
          return;
        }
      }

      let best: any = null;
      let bestDist = Infinity;
      for (const entry of candidates) {
        const dx = entry.Translate.X - shrinePos[0];
        const dy = entry.Translate.Y - shrinePos[1];
        const dz = entry.Translate.Z - shrinePos[2];
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestDist) {
          best = entry;
          bestDist = dist;
        }
      }

      if (best) {
        const caveMarker = new MapMarkers.MapMarkerCave(this.map, best);
        this.openMarkerDetails('AppMapDetailsCave', caveMarker);
      }
    });

    this.map.m.on('click', () => {
      if (this.tempObjMarker)
        this.tempObjMarker.data.getMarker().remove();
    });

    this.$on('AppMap:show-gen-group', async (id: ObjectIdentifier) => {
      const group = new SearchResultGroup('', `Generation group for ${id.mapType}/${id.mapName}:${id.hashId}`);
      await group.init(this.map);
      const objs = await MapMgr.getInstance().getObjGenGroup(id.mapType, id.mapName, id.hashId);
      group.setObjects(this.map, objs);
      group.update(SearchResultUpdateMode.UpdateStyle | SearchResultUpdateMode.UpdateVisibility, this.searchExcludedSets);
      this.searchGroups.push(group);
    });
    this.map.m.on('AppMap:show-gen-group', (args) => {
      this.$emit('AppMap:show-gen-group', args);
    });
  }

  initSettings() {
    this.reloadSettings();
    Settings.getInstance().registerCallback(() => this.reloadSettings());
  }

  private reloadSettings() {
    this.clMarkerVisibility = Settings.getInstance().checklistMarkerVisibility;
    const currentMapType = Settings.getInstance().mapType;
    const currentMapName = Settings.getInstance().mapName;
    const mapChanged = this.lastSettingsMapType !== null
      && (this.lastSettingsMapType !== currentMapType || this.lastSettingsMapName !== currentMapName);
    this.lastSettingsMapType = currentMapType;
    this.lastSettingsMapName = currentMapName;
    if (mapChanged) {
      void this.refreshSearchesForMapChange();
    }
    for (const group of this.searchGroups)
      group.update(SearchResultUpdateMode.UpdateVisibility | SearchResultUpdateMode.UpdateStyle | SearchResultUpdateMode.UpdateTitle, this.searchExcludedSets);

    this.searchResultMarkers.forEach(m => m.data.updateTitle());
    this.updateSearchResultMarkerVisibility();
    this.updateMarkers();
  }

  private async refreshSearchesForMapChange() {
    // Refresh excluded sets for the new map context
    for (const set of this.searchExcludedSets) {
      await set.init();
    }

    // Refresh search groups against the new map context
    for (const group of this.searchGroups) {
      if (!group.query)
        continue;
      const results = await MapMgr.getInstance().getObjs(this.settings!.mapType, this.settings!.mapName, group.query);
      group.setObjects(this.map, results);
      group.update(SearchResultUpdateMode.UpdateStyle | SearchResultUpdateMode.UpdateVisibility, this.searchExcludedSets);
    }

    // Refresh the active search (even if not added to the map yet)
    await this.search();
  }

  initAreaMap() {
    this.areaMapLayer.data.addTo(this.map.m);
  }
  initAutoItem() {
    this.areaAutoItem.data.addTo(this.map.m);
  }

  async loadAutoItem(name: string) {
    this.areaAutoItem.data.clearLayers();
    if (!name)
      return;
    const areas = await MapMgr.getInstance().fetchAreaMap(name);
    let layers: L.Path[] = ui.areaMapToLayers(areas);
    layers.forEach(l => this.areaAutoItem.data.addLayer(l));
    this.areaAutoItem.data.setZIndex(1000);
  }

  featureCollectionToPolygons(areas: any) {
    return Object.fromEntries(areas.features.map((feat: any) => {
      if (feat.properties.Area !== undefined) {
        feat.geometry.properties = {
          title: feat.properties.Area.toString(),
          color: feat.properties.color || undefined
        }
      } else if (feat.properties.group != undefined) {
        feat.geometry.properties = {
          title: feat.properties.group,
          color: feat.properties.color || undefined
        }
        return [feat.properties.group, [feat.geometry]];
      }
      return [feat.properties.Area, [feat.geometry]]
    }))
  }
  isFeatureCollection(area: any) {
    return area && area.type && area.type == "FeatureCollection";
  }

  private refreshMapTowerCompletion() {
    if (this.shownAreaMap !== 'MapTowerCompletion')
      return;
    if (this.cachedMapTowerEntries && this.areaMapLayersByData.data.size > 0) {
      this.updateMapTowerCompletionInPlace(this.cachedMapTowerEntries);
    } else {
      this.loadAreaMap(this.shownAreaMap);
    }
  }

  private updateMapTowerCompletionInPlace(entries: Array<[string, any]>) {
    const fillOpacity = (this.showAreaColor) ? 0.2 : 0.0;
    const completion = this.computeMapTowerCompletion(entries);
    for (const [data, features] of entries) {
      const completionInfo = completion.get(data);
      const completionColor = completionInfo ? this.completionToColor(completionInfo.ratio) : undefined;
      const layers = this.areaMapLayersByData.data.get(data);
      if (!layers)
        continue;
      const title = (features[0] && features[0].properties && features[0].properties.title) || data;
      const total = completionInfo ? completionInfo.total : 0;
      const completed = completionInfo ? completionInfo.completed : 0;
      const percent = completionInfo ? Math.round(completionInfo.ratio * 100) : 0;
      for (const layer of layers as L.GeoJSON[]) {
        if (completionColor) {
          layer.setStyle({ color: completionColor, fillOpacity });
        }
        layer.setTooltipContent(`${title}<br/>${percent}% (${completed}/${total})`);
      }
    }
  }

  private lerpColor(a: string, b: string, t: number): string {
    const ai = parseInt(a.replace('#', ''), 16);
    const bi = parseInt(b.replace('#', ''), 16);
    const ar = (ai >> 16) & 0xff;
    const ag = (ai >> 8) & 0xff;
    const ab = ai & 0xff;
    const br = (bi >> 16) & 0xff;
    const bg = (bi >> 8) & 0xff;
    const bb = bi & 0xff;
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return `#${((1 << 24) + (rr << 16) + (rg << 8) + rb).toString(16).slice(1)}`;
  }

  private completionToColor(ratio: number): string {
    const colors = ['#2b6fff', '#2ecc71', '#f1c40f', '#e67e22', '#e74c3c'];
    const clamped = Math.max(0, Math.min(1, ratio));
    const seg = (colors.length - 1) * clamped;
    const idx = Math.floor(seg);
    const t = seg - idx;
    if (idx >= colors.length - 1)
      return colors[colors.length - 1];
    return this.lerpColor(colors[idx], colors[idx + 1], t);
  }

  private initCaveDetailHover() {
    if (this.caveDetailHoverInitialized)
      return;
    this.caveDetailHoverInitialized = true;

    // Track whether any non-cave-detail tooltip is open (i.e. a marker tooltip).
    // When one is, suppress our manual cave-area tooltip entirely.
    this.map.m.on('tooltipopen', (e: any) => {
      if (e.tooltip && e.tooltip !== this.caveDetailTooltip) {
        this.markerTooltipOpen = true;
        this.clearCaveDetailHover();
      }
    });
    this.map.m.on('tooltipclose', (e: any) => {
      if (e.tooltip && e.tooltip !== this.caveDetailTooltip) {
        this.markerTooltipOpen = false;
      }
    });

    this.map.m.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (!this.caveDetailEntries.length)
        return;
      if (this.markerTooltipOpen) {
        this.clearCaveDetailHover();
        return;
      }

      let found: { title: string, layers: L.GeoJSON[] } | null = null;

      for (const entry of this.caveDetailEntries) {
        let hit = false;
        for (const layer of entry.layers) {
          layer.eachLayer((subLayer: any) => {
            if (hit) return;
            if (subLayer.getBounds && subLayer.getBounds().contains(e.latlng)) {
              // Bounds check passed — do precise point-in-polygon using
              // the LatLng rings that Leaflet already parsed from the GeoJSON.
              const rings: L.LatLng[][] = subLayer.getLatLngs();
              if (rings.length && this.pointInRingLatLng(e.latlng, rings[0])) {
                // Check holes: if point is inside a hole, it's not inside the polygon
                let inHole = false;
                for (let h = 1; h < rings.length; h++) {
                  if (this.pointInRingLatLng(e.latlng, rings[h])) {
                    inHole = true;
                    break;
                  }
                }
                if (!inHole) hit = true;
              }
            }
          });
          if (hit) break;
        }
        if (hit) { found = entry; break; }
      }

      const newTitle = found ? found.title : null;
      if (newTitle === this.caveDetailHoveredTitle) {
        if (this.caveDetailTooltip && found) {
          this.caveDetailTooltip.setLatLng(e.latlng);
        }
        return;
      }

      // Unhover previous
      this.clearCaveDetailHover();

      this.caveDetailHoveredTitle = newTitle;

      // Hover new
      if (found) {
        found.layers.forEach(l => l.setStyle({ weight: 4, fillOpacity: (this.showAreaColor) ? 0.3 : 0.0 }));
        const tt = L.tooltip({ pane: 'front', sticky: true })
          .setLatLng(e.latlng)
          .setContent(found.title);
        // Assign BEFORE addTo so the tooltipopen handler recognises this as ours
        this.caveDetailTooltip = tt;
        tt.addTo(this.map.m);
      }
    });
  }

  private clearCaveDetailHover() {
    if (this.caveDetailHoveredTitle) {
      const prev = this.caveDetailEntries.find(e2 => e2.title === this.caveDetailHoveredTitle);
      if (prev) {
        prev.layers.forEach(l => l.setStyle({ weight: 2, fillOpacity: (this.showAreaColor) ? 0.2 : 0.0 }));
      }
    }
    if (this.caveDetailTooltip) {
      this.map.m.closeTooltip(this.caveDetailTooltip);
      this.caveDetailTooltip = null;
    }
    this.caveDetailHoveredTitle = null;
  }

  private pointInRing(x: number, z: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], zi = ring[i][1];
      const xj = ring[j][0], zj = ring[j][1];
      const intersect = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / (zj - zi + 0.0) + xi);
      if (intersect)
        inside = !inside;
    }
    return inside;
  }

  private pointInRingLatLng(latlng: L.LatLng, ring: L.LatLng[]): boolean {
    let inside = false;
    const x = latlng.lng, z = latlng.lat;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].lng, zi = ring[i].lat;
      const xj = ring[j].lng, zj = ring[j].lat;
      const intersect = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
      if (intersect)
        inside = !inside;
    }
    return inside;
  }

  private pointInPolygon(x: number, z: number, rings: number[][][]): boolean {
    if (!rings.length)
      return false;
    if (!this.pointInRing(x, z, rings[0]))
      return false;
    for (let i = 1; i < rings.length; i++) {
      if (this.pointInRing(x, z, rings[i]))
        return false;
    }
    return true;
  }

  private featureToPolygons(feature: any): number[][][][] {
    const type = feature.type || (feature.geometry && feature.geometry.type);
    const coords = feature.coordinates || (feature.geometry && feature.geometry.coordinates);
    if (!type || !coords)
      return [];
    if (type === 'Polygon')
      return [coords];
    if (type === 'MultiPolygon')
      return coords;
    return [];
  }

  private buildAreaIndex(entries: Array<[string, any]>): Array<{ key: string, polygons: { rings: number[][][], bbox: [number, number, number, number] }[] }> {
    return entries.map(([key, features]) => {
      const polygons: { rings: number[][][], bbox: [number, number, number, number] }[] = [];
      features.forEach((feature: any) => {
        const polys = this.featureToPolygons(feature);
        polys.forEach((rings: number[][][]) => {
          let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
          rings[0].forEach((pt: number[]) => {
            minX = Math.min(minX, pt[0]);
            maxX = Math.max(maxX, pt[0]);
            minZ = Math.min(minZ, pt[1]);
            maxZ = Math.max(maxZ, pt[1]);
          });
          polygons.push({ rings, bbox: [minX, minZ, maxX, maxZ] });
        });
      });
      return { key, polygons };
    });
  }

  private findAreaForPoint(x: number, z: number, index: Array<{ key: string, polygons: { rings: number[][][], bbox: [number, number, number, number] }[] }>): string | null {
    for (const area of index) {
      for (const poly of area.polygons) {
        const [minX, minZ, maxX, maxZ] = poly.bbox;
        if (x < minX || x > maxX || z < minZ || z > maxZ)
          continue;
        if (this.pointInPolygon(x, z, poly.rings))
          return area.key;
      }
    }
    return null;
  }

  private computeMapTowerCompletion(entries: Array<[string, any]>): Map<string, { total: number, completed: number, ratio: number }> {
    const completion = new Map<string, { total: number, completed: number, ratio: number }>();
    entries.forEach(([key]) => completion.set(key, { total: 0, completed: 0, ratio: 0 }));

    const areaIndex = this.buildAreaIndex(entries);
    const excludedIds = new Set<number>();
    for (const set of this.searchExcludedSets) {
      set.ids.forEach(id => excludedIds.add(id));
    }

    const seen = new Set<string>();
    for (const group of this.searchGroups) {
      if (group.enabled === false)
        continue;
      for (const marker of group.getMarkers()) {
        const obj = marker.obj;
        if (seen.has(obj.hash_id))
          continue;
        if (excludedIds.has(obj.objid))
          continue;
        if (!isObjectInLayer(obj, this.map.activeLayer))
          continue;
        seen.add(obj.hash_id);

        const areaKey = this.findAreaForPoint(obj.pos[0], obj.pos[2], areaIndex);
        if (!areaKey)
          continue;
        const entry = completion.get(areaKey);
        if (!entry)
          continue;
        entry.total += 1;
        if (this.checklists.isMarked(obj.hash_id))
          entry.completed += 1;
      }
    }

    // Also count items from all checklists that are not already covered by searchGroups.
    for (const list of this.checklists.lists) {
      for (const item of Object.values(list.items) as any[]) {
        if (seen.has(item.hash_id))
          continue;
        const minData = {
          objid: 0,
          hash_id: item.hash_id,
          map_type: item.map_type,
          map_name: item.map_name || '',
          map_static: true,
          name: '',
          pos: item.pos as [number, number, number],
        };
        if (!isObjectInLayer(minData, this.map.activeLayer))
          continue;
        seen.add(item.hash_id);

        const areaKey = this.findAreaForPoint(item.pos[0], item.pos[2], areaIndex);
        if (!areaKey)
          continue;
        const entry = completion.get(areaKey);
        if (!entry)
          continue;
        entry.total += 1;
        if (this.checklists.isMarked(item.hash_id))
          entry.completed += 1;
      }
    }

    completion.forEach((entry) => {
      entry.ratio = entry.total > 0 ? entry.completed / entry.total : 0;
    });

    return completion;
  }

  async loadAreaMap(name: string) {
    this.areaMapLayer.data.clearLayers();
    this.areaMapLayersByData.data.clear();
    this.cachedMapTowerEntries = null;
    this.caveDetailEntries = [];
    this.caveDetailHoveredTitle = null;
    if (this.caveDetailTooltip) {
      this.map.m.closeTooltip(this.caveDetailTooltip);
      this.caveDetailTooltip = null;
    }
    if (!name)
      return;
    const isMapTowerCompletion = name === 'MapTowerCompletion';
    const sourceName = isMapTowerCompletion ? 'MapTower' : name;
    // Order matches that in MapTower.json
    const mapTowerAreas = ["Hebra", "Tabantha", "Gerudo", "Wasteland",
      "Woodland", "Central", "Great Plateau", "Dueling Peaks",
      "Lake", "Eldin", "Akkala", "Lanayru", "Hateno",
      "Faron", "Ridgeland"];
    const climate_names = [
      'HyrulePlainClimate',
      'NorthHyrulePlainClimate',
      'HebraFrostClimate',
      'TabantaAridClimate',
      'FrostClimate',
      'GerudoDesertClimate',
      'GerudoPlateauClimate',
      'EldinClimateLv0',
      'TamourPlainClimate',
      'ZoraTemperateClimate',
      'HateruPlainClimate',
      'FiloneSubtropicalClimate',
      'SouthHateruHumidTemperateClimate',
      'EldinClimateLv1',
      'EldinClimateLv2',
      // sic
      'DarkWoodsClimat',
      'LostWoodClimate',
      'GerudoFrostClimate',
      'KorogForest',
      'GerudoDesertClimateLv2'
    ];

    let areas = await MapMgr.getInstance().fetchAreaMap(sourceName);
    if (this.isFeatureCollection(areas)) {
      areas = this.featureCollectionToPolygons(areas as any)
    }
    const entries = Object.entries(areas);
    if (isMapTowerCompletion) {
      this.cachedMapTowerEntries = entries;
    }
    const completion = isMapTowerCompletion ? this.computeMapTowerCompletion(entries) : null;

    let fillOpacity = (this.showAreaColor) ? 0.2 : 0.0
    let fillOpacityOver = (this.showAreaColor) ? 0.3 : 0.0

    let i = 0;
    for (const [data, features] of entries) {
      const completionInfo = completion ? completion.get(data) : null;
      const completionColor = completionInfo ? this.completionToColor(completionInfo.ratio) : undefined;
      const isCaveDetail = (name == 'cave_polys_detail');
      const layers: L.GeoJSON[] = features.map((feature: any) => {
        if (completionColor) {
          feature.properties = feature.properties || {};
          feature.properties.color = completionColor;
        }
        return L.geoJSON(feature, {
          interactive: !isCaveDetail,
          pointToLayer: function(_geoJsonPoint, latlng) {
            let color = feature.properties.color || '#3388ff'
            return L.marker(latlng, { icon: ui.svgIcon(color) });
          },
          style: function(_) {
            let color = feature.properties.color || ui.genColor(entries.length, i);
            return { weight: 2, fillOpacity, color }
          },
          // @ts-ignore
          contextmenu: true,
          // @ts-ignore
        });
      });
      this.areaMapLayersByData.data.set(data, layers);

      if (isCaveDetail) {
        const title = features[0].properties.title.split('::').at(0) || data;
        this.caveDetailEntries.push({ title, layers, features });
      }

      for (const layer of layers) {
        if (!isCaveDetail) {
          layer.on('mouseover', () => {
            layers.forEach(l => {
              l.setStyle({ weight: 4, fillOpacity: fillOpacityOver });
            });
          });
          layer.on('mouseout', () => {
            layers.forEach(l => l.setStyle({ weight: 2, fillOpacity }));
          });
        }
        if (isMapTowerCompletion) {
          const title = features[0].properties.title || data;
          const total = completionInfo ? completionInfo.total : 0;
          const completed = completionInfo ? completionInfo.completed : 0;
          const percent = completionInfo ? Math.round(completionInfo.ratio * 100) : 0;
          layer.bindTooltip(`${title}<br/>${percent}% (${completed}/${total})`);
          continue;
        }
        if (sourceName == "MapTower" || name == "sky_polys" || name == "cave_polys") {
          layer.bindTooltip(features[0].properties.title);
          continue;
        }
        if (name == "cherry_blossom_trees") {
          layer.bindTooltip(features[0].properties.title);
          continue
        }
        if (name == "cave_polys_detail") {
          continue;
        }
        const area = await MsgMgr.getInstance().getAreaData(name, parseInt(data));
        const climate = await MsgMgr.getInstance().getClimateData(area.Climate);
        const area_name = MsgMgr.getInstance().getMsgWithFile("StaticMsg/LocationMarker", area.Name);
        let label = (area_name) ? `${area_name} #${data}` : `Area #${data}`;
        for (const kind of ['Bluesky', 'Cloudy', 'Rain', 'Storm', 'HeavyRain']) {
          const rate = climate.Weather[`${kind}Rate`];
          if (rate > 0) {
            label += `<br/>${rate}%: ${kind}`;
          }
        }
        if (climate.EnvFireLevel > 0) {
          label += "<br/>"
          for (let i = 0; i < climate.EnvFireLevel; i++)
            label += `&#128293;`; // Ugh, Fire is not Lava
          label += ` Fire Level ${climate.EnvFireLevel}`
        }
        if (name == "Sky" || name == "MinusField") {
          let cname = (name == "Sky") ? "Sky" : "UnderGround";
          let day = climate.DayTemperature[cname];
          let night = climate.NightTemperature[cname]
          let night_emoji = this.temperatureEmoji(night);
          let day_emoji = this.temperatureEmoji(day);

          if (day != night) {
            label += `<br/>${day} ${day_emoji}/ ${night}&deg;C ${night_emoji}`;
          } else {
            label += `<br/>${day}&deg;C ${day_emoji}`;
          }
        }
        layer.bindTooltip(label);
      }
      ++i;
    }
    if (this.caveDetailEntries.length > 0) {
      this.initCaveDetailHover();
    }
    this.updateAreaMapVisibility();
  }

  temperatureEmoji(temp: number) {
    const cold = "&#129398;";
    const hot = "&#129397;";

    if (temp < -10)
      return `${cold}${cold}`;
    else if (temp < 0)
      return cold
    else if (temp > 50)
      return `${hot}${hot}`
    else if (temp > 40)
      return hot
    return "";
  }

  updateAreaMapVisibility() {
    const hasWhitelist = !!this.areaWhitelist;
    const shown = this.areaWhitelist.trim().split(',').map(s => s.trim());
    const hideCaves = (this.shownAreaMap === 'cave_polys_detail' || this.shownAreaMap === 'cave_polys')
      && this.settings && this.settings.showObjectsCurrentLayer
      && this.map.activeLayer !== 'Surface';
    this.areaMapLayer.data.clearLayers();
    if (hideCaves)
      return;
    for (const [data, layers] of this.areaMapLayersByData.data.entries()) {
      if (!hasWhitelist || shown.includes(data))
        layers.forEach(l => {
          this.areaMapLayer.data.addLayer(l);
          // Push area polygons to the back of the canvas draw order so that
          // markers (both filter and search) are always hit-tested first.
          (l as any).bringToBack();
        });
    }
  }

  onShownAreaMapChanged() {
    this.$nextTick(() => this.loadAreaMap(this.shownAreaMap));
  }
  onShownAutoItemChanged() {
    this.$nextTick(() => this.loadAutoItem(this.shownAutoItem));
  }

  async initMapSafeAreas() {
    const areas = await MapMgr.getInstance().fetchAreaMap("AutoSafe");
    let layers: L.Path[] = ui.areaMapToLayers(areas);
    layers.forEach(l => this.mapSafeAreas.data.addLayer(l));
  }

  async initMapCastleAreas() {
    const areas: any = await MapMgr.getInstance().fetchAreaMap("castle");
    const features = areas.features;

    const layers: L.GeoJSON[] = features.map((feature: any, i: number) => {
      let color = ui.genColor(300, feature.properties.y);
      let layer = L.geoJSON(feature, {
        style: function(_) {
          return { weight: 2, fillOpacity: 0.2, color: color };
        },
        // @ts-ignore
        contextmenu: true,
      });
      layer.bindTooltip(`${feature.properties.name} @ ${feature.properties.y}`);
      layer.on('mouseover', () => { layer.setStyle({ weight: 4, fillOpacity: 0.3 }); });
      layer.on('mouseout', () => { layer.setStyle({ weight: 2, fillOpacity: 0.2 }); });
      return layer;
    });
    layers.forEach(l => this.mapCastleAreas.data.addLayer(l));

    this.mapCastleAreas.data.setZIndex(1000);
  }


  initMapUnitGrid() {
    for (let i = 0; i < 10; ++i) {
      for (let j = 0; j < 8; ++j) {
        const topLeft: Point = [-5000.0 + i * 1000.0, 0.0, -4000.0 + j * 1000.0];
        const bottomRight: Point = [-5000.0 + (i + 1) * 1000.0, 0.0, -4000.0 + (j + 1) * 1000.0];
        const rect = L.rectangle(L.latLngBounds(this.map.fromXYZ(topLeft), this.map.fromXYZ(bottomRight)), {
          fill: true,
          stroke: true,
          color: '#009dff',
          fillOpacity: 0.13,
          weight: 2,
          // @ts-ignore
          contextmenu: true,
        });
        rect.bringToBack();
        rect.bindTooltip(map.pointToMapUnit(topLeft), {
          permanent: true,
          direction: 'center',
        });
        this.mapUnitGrid.data.addLayer(rect);
      }
    }
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 8; j++) {
        let x = math.clamp((i - 1) * 1000 - 4500, -5000, 5000)
        let y = math.clamp((j - 1) * 1000 - 3500, -4000, 4000)
        const topLeft: Point = [x, 0, y];
        x = math.clamp((i + 1) * 1000 - 4500, -5000, 5000)
        y = math.clamp((j + 1) * 1000 - 3500, -4000, 4000)
        const bottomRight: Point = [x, 0.0, y]
        const rect = L.rectangle(L.latLngBounds(this.map.fromXYZ(topLeft), this.map.fromXYZ(bottomRight)), {
          fill: true,
          stroke: true,
          color: '#fcc867',
          fillOpacity: 0.02,
          weight: 2,
          // @ts-ignore
          contextmenu: true,
        });
        rect.bringToBack();

        const name = String.fromCharCode('A'.charCodeAt(0) + i) + `-${j + 1}`;
        rect.bindTooltip(name, {
          permanent: true,
          direction: 'center',
        });
        rect.on('mouseover', function(_ev: any) {
          rect.setStyle({ weight: 5, fillOpacity: 0.13 });
        });
        rect.on('mouseout', function(_ev: any) {
          rect.setStyle({ weight: 2, fillOpacity: 0.02 });
        });
        this.revivalMapUnitGrid.data.addLayer(rect);
      }
    }
  }

  onShowMapUnitGridChanged() {
    this.$nextTick(() => {
      this.mapUnitGrid.data.remove();
      this.revivalMapUnitGrid.data.remove();
      if (this.showMapUnitGrid)
        this.mapUnitGrid.data.addTo(this.map.m);
      if (this.showRevivalMapUnitGrid)
        this.revivalMapUnitGrid.data.addTo(this.map.m);
    });
  }

  onShowCastleAreas() {
    this.$nextTick(() => {
      this.mapCastleAreas.data.remove();
      if (this.showCastleAreas) {
        if (this.mapCastleAreas.data.getLayers().length <= 0) {
          this.initMapCastleAreas();
        }
        this.mapCastleAreas.data.addTo(this.map.m);
      }
    });
  }

  onShowSafeAreas() {
    this.$nextTick(() => {
      this.mapSafeAreas.data.remove();
      if (this.showSafeAreas) {
        if (this.mapSafeAreas.data.getLayers().length <= 0) {
          this.initMapSafeAreas();
        }
        this.mapSafeAreas.data.addTo(this.map.m);
      }
    });
  }

  onShowReferenceGrid() {
    this.$nextTick(() => {
      this.map.showReferenceGrid(this.showReferenceGrid);
    });
  }

  private switchToObjectLayer(obj: ObjectMinData) {
    if (!obj.map_name) {
      return;
    }

    if (obj.map_type.startsWith("MinusField")) {
      this.map.switchBaseTileLayer("Depths");
    } else if (obj.map_name.startsWith("Sky")) {
      this.map.switchBaseTileLayer("Sky");
    } else if (obj.map_name.startsWith("LargeDungeon")) {
      if (obj.map_name.startsWith("LargeDungeon__LargeDungeonWater")) {
        this.map.switchBaseTileLayer("Sky");
      } else if (obj.map_name.startsWith("LargeDungeon__LargeDungeonWind")) {
        this.map.switchBaseTileLayer("Sky");
      } else {
        this.map.switchBaseTileLayer("Surface");
      }
    } else {
      this.map.switchBaseTileLayer("Surface");
    }
  }

  created() {
    this.settings = Settings.getInstance();
  }

  async mounted() {
    this.map = new MapBase('lmap');
    this.map.registerZoomChangeCb((zoom) => this.zoom = zoom);
    this.initMapRouteIntegration();
    this.initMarkers();
    this.initAreaMap();
    this.initAutoItem();
    this.initMapUnitGrid();
    this.initSidebar();
    this.initDrawTools();
    this.initMarkerDetails();
    this.initSearch();
    this.initContextMenu();
    this.initEvents();
    this.initSettings();
    this.initChecklist();

    this.localDetails = {};
    this.localSearch = {};

    if (this.$route.query.q) {
      this.searchQuery = this.$route.query.q.toString();
      this.search();
      this.switchPane('spane-search');
    }

    if (this.$route.query.id) {
      // format: MapType,MapName,HashId
      const [mapType, mapName, hashId] = this.$route.query.id.toString().split(',');
      MapMgr.getInstance().getObj(mapType, mapName, hashId)
        .then(async (obj) => {
          if (!obj) {
            obj = await MapMgr.getInstance().getObjByHashId(hashId);

            // The user messed up the map type or map name.
            // Fix the query string for them.
            if (obj) {
              this.$router.replace({
                path: this.$route.fullPath,
                query: {
                  ...this.$route.query,
                  id: [obj.map_type, obj.map_name, obj.hash_id].join(","),
                },
              });
            }
          }

          if (obj) {
            this.$emit('AppMap:open-obj', obj);
          }
        });
    }
  }

  async initChecklist() {
    await this.checklists.init();
    await this.initShrineBgmHashIndex();
    this.clUpdateMarkers();
    this.refreshMapTowerCompletion();
  }

  searchOnHash(hash: string) {
    this.searchQuery = `hash_id: ${hash}`;
    this.search();
    this.switchPane('spane-search');
  }
  searchOnValue(value: string) {
    this.searchQuery = value;
    this.search();
    this.switchPane('spane-search');
  }

  beforeDestroy() {
    this.map.m.remove();
  }

  beforeRouteUpdate(to: any, from: any, next: any) {
    if (!this.updatingRoute)
      this.setViewFromRoute(to);
    next();
  }
}

function interp(a: any, b: any, f: number) {
  return {
    lat: a.lat + f * (b.lat - a.lat),
    lng: a.lng + f * (b.lng - a.lng),
  }
}
