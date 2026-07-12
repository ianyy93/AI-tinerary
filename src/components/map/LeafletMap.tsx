/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { db } from '../../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Trip, ItineraryEvent, EventCategory, Day } from '../../types';
import { MapPin, Navigation, Map as MapIcon, Layers } from 'lucide-react';
import { DateTime } from 'luxon';
import { inferTimezone } from '../../utils/timezone';

interface LeafletMapProps {
  trip: Trip;
  selectedDayId: string | null;
  days: Day[];
  viewMode: 'timeline' | 'shortlist' | 'bookings';
}

// Custom map recenterer helper using the useMap hook
function MapBoundsRecenter({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView(points[0], 13, { animate: true });
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
    }
  }, [points, map]);

  return null;
}

// Custom map helper to center on destination city
function MapDestinationRecenter({ center }: { center: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.setView(center, 12, { animate: true });
  }, [center, map]);

  return null;
}

export default function LeafletMap({ trip, selectedDayId, days, viewMode }: LeafletMapProps) {
  const [dayEvents, setDayEvents] = useState<ItineraryEvent[]>([]);
  const [destinationCenter, setDestinationCenter] = useState<[number, number] | null>(null);

  // Geocode destination city on mount or change
  useEffect(() => {
    if (!trip.destination) return;

    const cacheKey = `destination_coords_${trip.destination.toLowerCase()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setDestinationCenter([parsed.lat, parsed.lng]);
        return;
      } catch (e) {}
    }

    const fetchDestCoords = async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(trip.destination)}&limit=1`);
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
          const lat = parseFloat(json.data[0].lat);
          const lng = parseFloat(json.data[0].lon);
          setDestinationCenter([lat, lng]);
          localStorage.setItem(cacheKey, JSON.stringify({ lat, lng }));
        }
      } catch (err) {
        console.error("Error geocoding destination:", err);
      }
    };
    fetchDestCoords();
  }, [trip.destination]);

  // 1. Fetch events with coordinates for this specific day (or all stays & flights)
  useEffect(() => {
    if (!trip.id || !days.length) return;

    if (viewMode === 'shortlist') {
      setDayEvents([]);
      return;
    }

    const isStaysFlights = viewMode === 'bookings';
    const currentDay = viewMode === 'timeline' ? days.find(d => d.id === selectedDayId) : null;
    if (!currentDay && !isStaysFlights) {
      setDayEvents([]);
      return;
    }

    const eventsRef = collection(db, `trips/${trip.id}/events`);

    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const list: ItineraryEvent[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.coordinates && typeof data.coordinates.lat === 'number' && typeof data.coordinates.lng === 'number') {
          if (isStaysFlights) {
            if (data.category === 'stay' || data.category === 'travel') {
              list.push({ id: doc.id, ...data } as ItineraryEvent);
            }
          } else {
            const startLocal = DateTime.fromISO(data.startDateTime).setZone(data.timezone || inferTimezone(trip.destination));
            if (currentDay && startLocal.toFormat('yyyy-MM-dd') === currentDay.dateStr) {
              list.push({ id: doc.id, ...data } as ItineraryEvent);
            }
          }
        }
      });
      // Sort chronologically by startDateTime
      list.sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));
      setDayEvents(list);
    }, (err) => {
      console.error("Error fetching map coordinates:", err);
    });

    return () => unsubscribe();
  }, [trip.id, selectedDayId, days, viewMode]);

  // Extract lat/lng array for bounds calculations
  const coordinates: [number, number][] = dayEvents.map(e => [e.coordinates!.lat, e.coordinates!.lng]);

  // Define marker icons for category highlights
  const createCategoryIcon = (category: EventCategory, title: string, index: number) => {
    let colorHex = '#3b82f6'; // sapphire blue
    if (category === 'stay') colorHex = '#10b981'; // emerald green
    if (category === 'travel') colorHex = '#f59e0b'; // amber
    if (category === 'food') colorHex = '#f97316'; // orange
    if (category === 'logistics') colorHex = '#8b5cf6'; // violet

    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="relative flex items-center justify-center">
          <!-- Outer Pulsing Glow -->
          <span class="animate-ping absolute inline-flex h-7 w-7 rounded-full opacity-35" style="background-color: ${colorHex}"></span>
          <!-- Pin Body -->
          <div class="relative h-6 w-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-[10px] font-bold" style="background-color: ${colorHex}">
            ${index + 1}
          </div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  // Determine paths between same-day stops: road-following lines for drives, dashed arcs for flights
  // In a lightweight Leaflet layer, we draw polyline lines connecting them.
  // We can render each segment individually so we can apply styles depending on category!
  const polylineSegments = dayEvents.map((event, idx) => {
    if (idx === 0) return null;
    const prev = dayEvents[idx - 1];
    const curr = event;
    const pathCoords: [number, number][] = [
      [prev.coordinates!.lat, prev.coordinates!.lng],
      [curr.coordinates!.lat, curr.coordinates!.lng]
    ];

    const isFlight = trip.tripType === 'flights' || prev.category === 'travel' || curr.category === 'travel';

    return {
      coords: pathCoords,
      dashArray: isFlight ? '6, 8' : undefined,
      color: isFlight ? '#3b82f6' : '#6366f1', // Sapphire vs Indigo
      weight: isFlight ? 3 : 4,
    };
  }).filter(Boolean);

  // Default coordinate if no events are added
  const defaultCenter: [number, number] = [34.8697, -111.7601]; // Default Sedona

  return (
    <div className="flex flex-col h-full bg-white border border-slate-100 rounded-2xl p-5 shadow-sm" id="map-pane-container">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4" id="map-header">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4.5 w-4.5 text-indigo-500" />
          <h2 className="font-display font-bold text-base text-slate-900">Live Map Track</h2>
        </div>
        <div className="text-xs text-slate-400 font-medium flex items-center gap-1 bg-slate-50 border border-slate-100/70 px-2 py-1 rounded-lg">
          <Layers className="h-3.5 w-3.5" />
          <span>{dayEvents.length} Stops Tracked</span>
        </div>
      </div>

      <div className="flex-1 min-h-[300px] relative rounded-xl overflow-hidden border border-slate-100">
        {coordinates.length === 0 ? (
          <div className="absolute bottom-4 left-4 right-4 z-[450] bg-white/95 backdrop-blur-sm border border-slate-100 rounded-xl p-3 shadow-md flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <Navigation className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-display font-bold text-xs text-slate-800 leading-tight">Map Centered on {trip.destination}</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                Stops on this day do not have map coordinates yet. They will auto-detect as you save!
              </p>
            </div>
          </div>
        ) : null}

        <MapContainer 
          center={coordinates[0] || destinationCenter || defaultCenter} 
          zoom={12} 
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {coordinates.length === 0 && <MapDestinationRecenter center={destinationCenter} />}

          {/* Render polyline connections between stops */}
          {polylineSegments.map((seg, idx) => (
            <Polyline
              key={idx}
              positions={seg!.coords}
              pathOptions={{
                color: seg!.color,
                dashArray: seg!.dashArray,
                weight: seg!.weight,
                opacity: 0.8,
              }}
            />
          ))}

          {/* Render markers */}
          {dayEvents.map((event, idx) => (
            <Marker
              key={event.id}
              position={[event.coordinates!.lat, event.coordinates!.lng]}
              icon={createCategoryIcon(event.category, event.title, idx)}
            >
              <Popup>
                <div className="p-1 max-w-[200px]" id={`popup-${event.id}`}>
                  <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase">
                    {event.category}
                  </span>
                  <h4 className="font-display font-bold text-xs text-slate-900 mt-1 leading-tight">{event.title}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">{event.locationName}</p>
                  {!event.timeUnknown && (() => {
                    const startLocal = DateTime.fromISO(event.startDateTime).setZone(event.timezone);
                    const endLocal = DateTime.fromISO(event.endDateTime).setZone(event.timezone);
                    const isSpanning = startLocal.toFormat('yyyy-MM-dd') !== endLocal.toFormat('yyyy-MM-dd');
                    const timeStr = isSpanning 
                      ? `${startLocal.toFormat('MMM dd, HH:mm')} → ${endLocal.toFormat('MMM dd, HH:mm')}`
                      : `${startLocal.toFormat('HH:mm')} — ${endLocal.toFormat('HH:mm')}`;
                    return (
                      <p className="text-[10px] font-mono text-slate-400 mt-1 flex items-center gap-1">
                        <span>🕒 {timeStr}</span>
                      </p>
                    );
                  })()}
                  {event.notes && (
                    <p className="text-[10px] italic text-slate-400 mt-1 border-t border-slate-100 pt-1 leading-normal">
                      "{event.notes.length > 50 ? event.notes.slice(0, 50) + '...' : event.notes}"
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Automatically center & fit bounds to pins on load */}
          <MapBoundsRecenter points={coordinates} />
        </MapContainer>
      </div>
    </div>
  );
}
