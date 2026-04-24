import * as L from 'leaflet';
import { MapMarker } from '@/MapMarker';
import { makeClusterGroup } from '@/util/leaflet_cluster';

export class MapMarkerGroup {
  public markerGroup: L.MarkerClusterGroup;
  private markers: MapMarker[] = [];
  private shownMarkers: boolean[] = [];
  private enableUpdates: boolean;
  private isInitialUpdate: boolean = true;

  constructor(markers: MapMarker[], preloadPad: number = 1, enableUpdates = true) {
    this.markerGroup = makeClusterGroup(preloadPad);
    this.markers = markers;
    this.enableUpdates = enableUpdates;
  }

  destroy() {
    this.markerGroup.remove();
    this.markerGroup.clearLayers();
    this.markers = [];
    this.shownMarkers = [];
  }

  addToMap(map: L.Map) { this.markerGroup.addTo(map); }
  removeFromMap(map: L.Map) { this.markerGroup.removeFrom(map); }
  showOnMap(map: L.Map, doShow: boolean) {
    if (doShow)
      this.addToMap(map);
    else
      this.removeFromMap(map);
  }

  update() {
    if (!this.enableUpdates && !this.isInitialUpdate)
      return;

    const toShow: boolean[] = this.markers.map(m => m.shouldBeShown());

    // Check if the desired visible set has actually changed.
    const changed = this.isInitialUpdate ||
      toShow.some((show, i) => show !== this.shownMarkers[i]);

    if (!changed) {
      this.isInitialUpdate = false;
      return;
    }

    this.shownMarkers = toShow;
    this.isInitialUpdate = false;

    // Full rebuild: clear, then add only the markers that should be shown.
    // A delta-based removeLayers/addLayers approach leaves leaflet.markercluster
    // in inconsistent internal state (stale featureGroup entries, wrong
    // _recursivelyAddChildrenToMap calls) which causes wrong-layer markers to
    // reappear. Full rebuild is safe and fast because chunkedLoading:false and
    // disableClusteringAtZoom bypass the expensive distance-grid computation.
    this.markerGroup.clearLayers();
    const addMarkers = this.markers
      .filter((_, i) => toShow[i])
      .map(m => m.getMarker());
    if (addMarkers.length > 0)
      this.markerGroup.addLayers(addMarkers);
  }

  find(predicate: (marker: MapMarker) => boolean) {
    return this.markers.find(predicate)
  }
}
