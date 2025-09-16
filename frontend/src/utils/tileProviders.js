// Helper to select tile provider and attribution. Default is OpenStreetMap.
const PROVIDERS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors'
  },
  carto: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO & OpenStreetMap contributors'
  },
  stamen: {
    url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    attribution: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.'
  },
  mapbox: {
    // requires MAPBOX_ACCESS_TOKEN to be provided in env
    url: (token) => `https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=${token}`,
    attribution: '&copy; Mapbox & OpenStreetMap contributors',
    id: 'mapbox/streets-v11'
  }
};

export function getTileProvider(envProvider) {
  // Use Vite's import.meta.env in the browser build; allow optional override via envProvider arg.
  const providerEnv = envProvider ?? (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAP_PROVIDER) ?? 'osm';
  const mapboxToken = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN) || '';
  const key = (providerEnv || 'osm').toLowerCase();
  const provider = PROVIDERS[key] || PROVIDERS['osm'];
  if (key === 'mapbox') {
    return {
      url: provider.url(mapboxToken || ''),
      attribution: provider.attribution
    };
  }
  return provider;
}
