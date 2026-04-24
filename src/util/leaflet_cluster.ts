import 'leaflet.markercluster';

import L from 'leaflet';

/// Returns a MarkerClusterGroup whose main purpose is to cull invisible objects.
export function makeClusterGroup(pad: number = 1, disableCluster = true): L.MarkerClusterGroup {
  const cg = L.markerClusterGroup({
    disableClusteringAtZoom: disableCluster ? -10 : 6,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: false,
    removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: false,
    // chunkedLoading must be false: when addLayers() is mid-chunk and
    // removeLayers() is called, the pending setTimeout re-adds the removed
    // markers (hasLayer() returns false after __parent is deleted), leaving
    // stale markers on-screen after a layer switch. With removeOutsideVisibleBounds
    // only viewport-visible markers hit the DOM, so sync processing is fast.
    chunkedLoading: false,
  });
  // Override _getExpandedVisibleBounds to reduce the number of rendered markers for better perf.
  // @ts-ignore
  cg._getExpandedVisibleBounds = function() {
    // @ts-ignore
    return this._checkBoundsMaxLat(this._map.getBounds().pad(pad));
  };
  return cg;
}
