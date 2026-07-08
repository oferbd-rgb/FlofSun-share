import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getLocation, setLocation } from "./appState";

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`,
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const a = data.address ?? {};
    const city = a.city ?? a.town ?? a.village ?? a.county ?? a.state;
    const country = a.country;
    if (city && country) return `${city}, ${country}`;
    if (country) return country;
    return data.display_name ?? fallbackLabel(lat, lng);
  } catch {
    return fallbackLabel(lat, lng);
  }
}

function fallbackLabel(lat: number, lng: number): string {
  return `Lat ${lat.toFixed(2)}, Lon ${lng.toFixed(2)}`;
}

export interface LocationPicker {
  element: HTMLElement;
}

export function createLocationPicker(container: HTMLElement): LocationPicker {
  const panel = document.createElement("div");
  panel.className = "location-picker";

  const mapDiv = document.createElement("div");
  mapDiv.className = "location-picker-map";
  panel.appendChild(mapDiv);

  const infoLine = document.createElement("div");
  infoLine.className = "location-picker-info";
  panel.appendChild(infoLine);

  container.appendChild(panel);

  const initial = getLocation();

  function refreshInfo(loc: ReturnType<typeof getLocation>) {
    infoLine.textContent = `${loc.label} (${loc.latitude.toFixed(2)}, ${loc.longitude.toFixed(2)})`;
  }
  refreshInfo(initial);

  const map = L.map(mapDiv, { attributionControl: true, zoomControl: true }).setView(
    [initial.latitude, initial.longitude],
    2,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);

  const marker = L.circleMarker([initial.latitude, initial.longitude], {
    radius: 7,
    color: "#ffcc00",
    fillColor: "#ffcc00",
    fillOpacity: 0.9,
  }).addTo(map);

  map.on("click", (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng;
    marker.setLatLng([lat, lng]);
    setLocation({ latitude: lat, longitude: lng, label: "Loading…" });
    refreshInfo({ latitude: lat, longitude: lng, label: "Loading…" });

    reverseGeocode(lat, lng).then((label) => {
      const updated = { latitude: lat, longitude: lng, label };
      setLocation(updated);
      refreshInfo(updated);
    });
  });

  // Resolve a friendly label for the default location on startup.
  reverseGeocode(initial.latitude, initial.longitude).then((label) => {
    const updated = { latitude: initial.latitude, longitude: initial.longitude, label };
    setLocation(updated);
    refreshInfo(updated);
  });

  return { element: panel };
}
