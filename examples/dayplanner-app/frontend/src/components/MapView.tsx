import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle } from 'react-leaflet';
import type { Location, Itinerary } from '../types';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon - use Leaflet's default icon URLs
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapViewProps {
  location: Location | null;
  onLocationSelect: (location: Location) => void;
  itinerary: Itinerary | null;
  radius: number;
}

function LocationMarker({ onLocationSelect }: { onLocationSelect: (location: Location) => void }) {
  const [position, setPosition] = useState<[number, number] | null>(null);

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      onLocationSelect({
        lat,
        lon: lng,
        address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
    },
  });

  return position ? <Marker position={position}><Popup>Starting location</Popup></Marker> : null;
}

export default function MapView({ location, onLocationSelect, itinerary, radius }: MapViewProps) {
  const [center, setCenter] = useState<[number, number]>([60.1699, 24.9384]); // Helsinki default

  useEffect(() => {
    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCenter([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.log('Geolocation error:', error);
        }
      );
    }
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <LocationMarker onLocationSelect={onLocationSelect} />

      {location && (
        <Circle
          center={[location.lat, location.lon]}
          radius={radius * 1000}
          pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
        />
      )}

      {itinerary && itinerary.activities.map((activity) => (
        <Marker
          key={activity.id}
          position={[activity.location.lat, activity.location.lon]}
        >
          <Popup>
            <strong>{activity.name}</strong>
            <br />
            {activity.description}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
