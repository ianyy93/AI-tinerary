/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Trip, ItineraryEvent, EventCategory, Day } from '../../types';
import { 
  Plus, Edit2, Trash2, MapPin, Clock, Home, Plane, Compass, Utensils, Info, 
  Dog, AlertCircle, FileText, CheckCircle2, Link, Globe, ChevronRight 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ItineraryTimelineProps {
  trip: Trip;
  selectedDayId: string | null;
  days: Day[];
  onSelectDay: (dayId: string) => void;
  userRole: 'owner' | 'editor' | 'viewer';
}

const CATEGORIES: { value: EventCategory; label: string; icon: any; colorClass: string; textClass: string }[] = [
  { value: 'stay', label: 'Stay / Accommodation', icon: Home, colorClass: 'bg-emerald-50 border-emerald-100 text-emerald-800', textClass: 'text-emerald-700' },
  { value: 'travel', label: 'Travel & Transit', icon: Plane, colorClass: 'bg-amber-50 border-amber-100 text-amber-800', textClass: 'text-amber-700' },
  { value: 'activity', label: 'Activity & Sight', icon: Compass, colorClass: 'bg-blue-50 border-blue-100 text-blue-800', textClass: 'text-blue-700' },
  { value: 'food', label: 'Food & Dining', icon: Utensils, colorClass: 'bg-orange-50 border-orange-100 text-orange-800', textClass: 'text-orange-700' },
  { value: 'logistics', label: 'Logistics', icon: Info, colorClass: 'bg-purple-50 border-purple-100 text-purple-800', textClass: 'text-purple-700' },
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

export default function ItineraryTimeline({ trip, selectedDayId, days, onSelectDay, userRole }: ItineraryTimelineProps) {
  const [events, setEvents] = useState<ItineraryEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ItineraryEvent | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('activity');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [timezone, setTimezone] = useState('America/New_York');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [notes, setNotes] = useState('');
  const [reservationNumber, setReservationNumber] = useState('');
  const [dogFriendly, setDogFriendly] = useState(false);
  const [fileUrl, setFileUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Detect user timezone to pre-populate
  useEffect(() => {
    try {
      const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedTz) setTimezone(detectedTz);
    } catch (e) {
      // Ignore
    }
  }, []);

  // Sync / listen to events for the selected day
  useEffect(() => {
    if (!trip.id || !selectedDayId) return;

    const eventsRef = collection(db, `trips/${trip.id}/days/${selectedDayId}/events`);
    const q = query(eventsRef, orderBy('startTime', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: ItineraryEvent[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as ItineraryEvent);
      });
      // Ensure local chronological sort as fallback
      items.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setEvents(items);
    }, (err) => {
      console.error("Error listening to events:", err);
      handleFirestoreError(err, OperationType.LIST, `trips/${trip.id}/days/${selectedDayId}/events`);
    });

    return () => unsubscribe();
  }, [trip.id, selectedDayId]);

  // Open modal for addition
  const openAddModal = () => {
    if (userRole === 'viewer') return;
    setEditingEvent(null);
    setTitle('');
    setCategory('activity');
    setStartTime('09:00');
    setEndTime('10:00');
    setLocationName('');
    setAddress('');
    setLat('');
    setLng('');
    setNotes('');
    setReservationNumber('');
    setDogFriendly(false);
    setFileUrl('');
    setFileName('');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  // Open modal for edit
  const openEditModal = (event: ItineraryEvent) => {
    if (userRole === 'viewer') return;
    setEditingEvent(event);
    setTitle(event.title || '');
    setCategory(event.category || 'activity');
    setStartTime(event.startTime || '09:00');
    setEndTime(event.endTime || '10:00');
    setTimezone(event.timezone || 'America/New_York');
    setLocationName(event.locationName || '');
    setAddress(event.address || '');
    setLat(event.coordinates?.lat?.toString() || '');
    setLng(event.coordinates?.lng?.toString() || '');
    setNotes(event.notes || '');
    setReservationNumber(event.reservationNumber || '');
    setDogFriendly(event.dogFriendly || false);
    setFileUrl(event.fileUrl || '');
    setFileName(event.fileName || '');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  // Handle file reservation attachment upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      alert("Attachment size exceeds 1.5MB. Please upload a smaller receipt or image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFileUrl(event.target.result as string);
        setFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  // Save Event
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'viewer') return;

    if (!title.trim() || !locationName.trim() || !startTime || !endTime) {
      setErrorMsg('Please fill in required fields: Title, Location, and Time slots.');
      return;
    }

    try {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      const eventData: any = {
        title,
        category,
        startTime,
        endTime,
        timezone,
        locationName,
        address: address || '',
        notes: notes || '',
        reservationNumber: reservationNumber || '',
        dogFriendly: trip.petFriendly ? dogFriendly : false,
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        updatedAt: new Date().toISOString(),
      };

      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        eventData.coordinates = { lat: parsedLat, lng: parsedLng };
      }

      if (editingEvent) {
        // Edit existing
        const eventDocRef = doc(db, `trips/${trip.id}/days/${selectedDayId}/events`, editingEvent.id);
        try {
          await updateDoc(eventDocRef, eventData);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}/days/${selectedDayId}/events/${editingEvent.id}`);
          throw err;
        }
      } else {
        // Add new
        const eventsCollRef = collection(db, `trips/${trip.id}/days/${selectedDayId}/events`);
        try {
          await addDoc(eventsCollRef, eventData);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `trips/${trip.id}/days/${selectedDayId}/events`);
          throw err;
        }
      }

      // Transition planning, upcoming, or draft status to booking if confirmation is added
      if (reservationNumber.trim() && (trip.status === 'planning' || trip.status === 'upcoming' || trip.status === 'draft' || trip.status === 'dreaming')) {
        try {
          const tripDocRef = doc(db, 'trips', trip.id);
          await updateDoc(tripDocRef, { status: 'booking' });
        } catch (err) {
          console.error("Error auto-updating trip status to booking:", err);
        }
      }

      setIsModalOpen(false);
    } catch (e: any) {
      console.error("Error saving event:", e);
      setErrorMsg(e.message || 'Error saving event');
    }
  };

  // Delete Event
  const handleDeleteEvent = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (userRole === 'viewer') return;
    if (!window.confirm("Are you sure you want to delete this event?")) return;

    try {
      const eventDocRef = doc(db, `trips/${trip.id}/days/${selectedDayId}/events`, eventId);
      await deleteDoc(eventDocRef);
    } catch (e: any) {
      console.error("Error deleting event:", e);
      handleFirestoreError(e, OperationType.DELETE, `trips/${trip.id}/days/${selectedDayId}/events/${eventId}`);
    }
  };

  // Get category config helper
  const getCatConfig = (cat: EventCategory) => {
    return CATEGORIES.find(c => c.value === cat) || CATEGORIES[2];
  };

  return (
    <div className="flex flex-col h-full bg-white border border-slate-100 rounded-2xl p-5 shadow-sm overflow-hidden" id="timeline-container">
      {/* Horizonal Day Tabs selector */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100" id="tabs-header">
        <div className="flex items-center gap-2">
          <Globe className="h-4.5 w-4.5 text-indigo-500" />
          <h2 className="font-display font-bold text-base text-slate-900">Trip Timeline</h2>
        </div>

        {userRole !== 'viewer' && (
          <button
            onClick={openAddModal}
            disabled={days.length === 0}
            className={`flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition ${
              days.length === 0 
                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-100 text-indigo-700'
            }`}
            title={days.length === 0 ? "Set a trip date range to plan stops" : "Add Stop"}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        )}
      </div>

      {/* Days Scroller */}
      <div className="flex gap-2 overflow-x-auto py-3 border-b border-slate-100 scrollbar-none" id="days-tabs">
        {days.length === 0 ? (
          <div className="text-xs text-slate-400 font-medium py-2 px-1">
            No dates set yet. Click <b>Edit Trip</b> above to set dates.
          </div>
        ) : (
          days.map((day) => {
            const isSelected = selectedDayId === day.id;
            return (
              <button
                key={day.id}
                onClick={() => onSelectDay(day.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 border transition ${
                  isSelected 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' 
                    : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="font-bold">{day.title}</div>
                <div className={`text-[10px] ${isSelected ? 'text-indigo-100' : 'text-slate-400'} mt-0.5`}>
                  {day.dateStr.split('-').slice(1).join('/')}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Timezone display for current active day */}
      {events.length > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-50 border border-slate-100/70 px-3 py-1.5 rounded-lg mt-3">
          <Clock className="h-3.5 w-3.5" />
          <span>Day timezone: <b>{events[0]?.timezone || 'Not Specified'}</b></span>
        </div>
      )}

      {/* Vertical Timeline View */}
      <div className="flex-1 overflow-y-auto mt-4 pr-1 relative flex flex-col gap-6" id="timeline-list">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Compass className="h-10 w-10 text-slate-300 animate-pulse mb-3" />
            <h4 className="font-display font-bold text-sm text-slate-800">No Stops Planned Yet</h4>
            <p className="text-xs text-slate-400 max-w-xs mt-1.5">
              Select our AI travel copilot panel to curate a custom itinerary with a single wizard-wizard flow!
            </p>
            {userRole !== 'viewer' && (
              <button 
                onClick={openAddModal}
                className="mt-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg border border-slate-200 transition"
              >
                Add Custom Stop
              </button>
            )}
          </div>
        ) : (
          <div className="relative pl-6 flex flex-col gap-5">
            {/* Timeline connection line */}
            <div className="absolute top-2 bottom-2 left-[10px] w-0.5 bg-slate-100" />

            {events.map((event, index) => {
              const cat = getCatConfig(event.category);
              const Icon = cat.icon;

              // Generate navigation deep-links
              const mapsSearchQuery = encodeURIComponent(`${event.locationName} ${event.address || ''}`);
              const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsSearchQuery}`;
              const appleMapsUrl = `maps://?q=${mapsSearchQuery}`;

              return (
                <motion.div 
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={event.id}
                  className="relative group bg-white border border-slate-100 hover:border-slate-200/80 rounded-xl p-4 shadow-sm hover:shadow-md transition"
                >
                  {/* Category icon node on timeline line */}
                  <div className={`absolute -left-[22px] top-4.5 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center shadow-sm ${cat.colorClass}`}>
                    <Icon className="h-3 w-3" />
                  </div>

                  {/* Event content */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${cat.colorClass}`}>
                          {cat.label}
                        </span>
                        {event.dogFriendly && (
                          <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 border border-emerald-100" title="Dog Friendly Stop">
                            <Dog className="h-2.5 w-2.5" />
                            Dog Friendly
                          </span>
                        )}
                      </div>

                      {userRole !== 'viewer' && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => openEditModal(event)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteEvent(event.id, e)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1.5 mt-1">
                      <h4 className="font-display font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition leading-tight">
                        {event.title}
                      </h4>
                      <span className="text-[11px] font-mono text-indigo-600 font-bold shrink-0 bg-indigo-50/50 px-2 py-0.5 rounded">
                        {event.startTime} &mdash; {event.endTime}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{event.locationName}</span>
                    </div>

                    {event.notes && (
                      <p className="text-xs text-slate-500/90 leading-relaxed bg-slate-50/70 p-2.5 rounded-lg border border-slate-100/50 italic mt-1">
                        {event.notes}
                      </p>
                    )}

                    {/* Reservation details & Maps Integration panel */}
                    {(event.reservationNumber || event.fileUrl) && (
                      <div className="bg-slate-50/50 border border-slate-100/80 p-2.5 rounded-lg mt-1 flex flex-col gap-1.5">
                        <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Reservation Info</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                          {event.reservationNumber && (
                            <div className="flex items-center gap-1 text-xs font-medium text-slate-700">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              <span>Code: <b className="font-mono">{event.reservationNumber}</b></span>
                            </div>
                          )}
                          {event.fileUrl && (
                            <a
                              href={event.fileUrl}
                              download={event.fileName || 'reservation-receipt'}
                              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:underline"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>View Receipt ({event.fileName ? (event.fileName.length > 15 ? event.fileName.slice(0, 15) + '...' : event.fileName) : 'Attached'})</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Map Navigation Direct Link buttons */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Navigate:</span>
                      <a 
                        href={googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 border border-slate-200/50 rounded text-[10px] font-semibold transition"
                      >
                        Google Maps
                      </a>
                      <a 
                        href={appleMapsUrl}
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 border border-slate-200/50 rounded text-[10px] font-semibold transition"
                      >
                        Apple Maps
                      </a>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* EVENT ADD/EDIT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full border border-slate-100 p-6 shadow-xl flex flex-col gap-4 overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900">
                    {editingEvent ? 'Edit Itinerary Stop' : 'Add Itinerary Stop'}
                  </h3>
                  <p className="text-xs text-slate-500">Add detailed accommodations, activities, or dining spots.</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                >
                  &times;
                </button>
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-xl text-xs font-medium">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleSaveEvent} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stop Title *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Helicopter Canyon Flight"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as EventCategory)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition"
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Time *</label>
                    <input 
                      type="time" 
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Time *</label>
                    <input 
                      type="time" 
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition text-xs"
                    >
                      {COMMON_TIMEZONES.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Sedona Airport Mesa"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Street Address</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 123 Scenic Overlook Road"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Latitude (Optional Map Placement)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 34.8519"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition font-mono"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Longitude (Optional Map Placement)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. -111.7874"
                      value={lng}
                      onChange={(e) => setLng(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition font-mono"
                    />
                  </div>
                </div>

                {trip.petFriendly && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                    <input 
                      type="checkbox"
                      id="dogFriendlyEvent"
                      checked={dogFriendly}
                      onChange={(e) => setDogFriendly(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="dogFriendlyEvent" className="text-xs font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5 select-none">
                      <Dog className="h-4 w-4 text-emerald-600" />
                      Dog Friendly Activity (Trips is pet-friendly)
                    </label>
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notes & Tips</label>
                  <textarea 
                    placeholder="e.g. Pack layers, sunset is best. Dog park rules apply."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirmation # / Code</label>
                    <input 
                      type="text" 
                      placeholder="e.g. RESERVATION-7X89B"
                      value={reservationNumber}
                      onChange={(e) => setReservationNumber(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition font-mono text-xs"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attach Receipt / screenshot (Max 1.5MB)</label>
                    <input 
                      type="file" 
                      accept="image/*,application/pdf"
                      onChange={handleFileUpload}
                      className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer pt-1"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
                  >
                    Save Stop
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
