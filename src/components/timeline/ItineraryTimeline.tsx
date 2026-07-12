/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { Trip, ItineraryEvent, EventCategory, Day } from '../../types';
import { 
  Plus, Edit2, Trash2, Sparkles, MapPin, Clock, Home, Plane, Compass, X, Utensils, Info, 
  Dog, AlertCircle, FileText, CheckCircle2, Link, Globe, ChevronRight, HelpCircle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DateTime } from 'luxon';
import { inferTimezone } from '../../utils/timezone';
import { AnchorExtractionFlow } from '../hub/AnchorExtractionFlow';

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
  const [shortlistItems, setShortlistItems] = useState<any[]>([]);
  const [overnightMarkers, setOvernightMarkers] = useState<{start: string[], end: string[]}>({ start: [], end: [] });
    // Pending deletes
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const deleteTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ItineraryEvent | null>(null);
  const [shortlistSourceId, setShortlistSourceId] = useState<string | null>(null);
  const [isShortlistModalOpen, setIsShortlistModalOpen] = useState(false);
  const [expandedPendingEventId, setExpandedPendingEventId] = useState<string | null>(null);
  const [customOptionText, setCustomOptionText] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('activity');
  const [startDateTimeLocal, setStartDateTimeLocal] = useState('');
  const [endDateTimeLocal, setEndDateTimeLocal] = useState('');
  const [timezone, setTimezone] = useState(() => inferTimezone(trip.destination));
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
  const [filterTravelerId, setFilterTravelerId] = useState<string>('everyone');
  const [eventTravelerIds, setEventTravelerIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [pendingEvents, setPendingEvents] = useState<any[] | null>(null);
  const [showExpandConfirm, setShowExpandConfirm] = useState(false);
  

  
  const geocodeLocation = async (locName: string, addr: string): Promise<{ lat: number; lng: number } | null> => {
    const queries: string[] = [];
    if (addr && locName) queries.push(`${locName}, ${addr}`);
    if (addr) queries.push(`${addr}, ${trip.destination}`);
    if (locName) queries.push(`${locName}, ${trip.destination}`);
    if (locName) queries.push(locName);

    for (const q of queries) {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&limit=1`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data && json.data.length > 0) {
            return {
              lat: parseFloat(json.data[0].lat),
              lng: parseFloat(json.data[0].lon)
            };
          }
        }
      } catch (err) {
        console.error("Geocoding failed for:", q, err);
      }
    }
    return null;
  };

  const handleAutoGeocode = async () => {
    if (!locationName.trim()) {
      alert("Please enter a Location Name first.");
      return;
    }
    setIsGeocoding(true);
    const coords = await geocodeLocation(locationName, address);
    setIsGeocoding(false);
    if (coords) {
      setLat(coords.lat.toString());
      setLng(coords.lng.toString());
    } else {
      alert(`Could not automatically find coordinates for "${locationName}". You can enter them manually if you'd like.`);
    }
  };

  // Detect user timezone to pre-populate or fallback to trip destination timezone
  useEffect(() => {
    try {
      const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detectedTz) {
        setTimezone(detectedTz);
      } else {
        setTimezone(inferTimezone(trip.destination));
      }
    } catch (e) {
      setTimezone(inferTimezone(trip.destination));
    }
  }, [trip.destination]);

  // Sync / listen to events for the selected day from the flat collection (or all stays & flights)
  useEffect(() => {
    if (!trip.id) return;
    const shortlistRef = collection(db, `trips/${trip.id}/shortlist`);
    const unsub = onSnapshot(shortlistRef, (snap) => {
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShortlistItems(items);
    });
    return () => unsub();
  }, [trip.id]);

  useEffect(() => {
    if (!trip.id || (!selectedDayId && selectedDayId !== 'shortlist') || (!days.length && selectedDayId !== 'shortlist')) return;

    const isStaysFlights = selectedDayId === 'stays-flights';
    const currentDay = days.find(d => d.id === selectedDayId);
    if (!currentDay && !isStaysFlights) return;

    const eventsRef = collection(db, `trips/${trip.id}/events`);

    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const items: ItineraryEvent[] = [];
      const allStays: ItineraryEvent[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.category === 'stay') {
          allStays.push({ id: doc.id, ...data } as ItineraryEvent);
        }
        if (isStaysFlights) {
          if (data.category === 'stay' || data.category === 'travel') {
            items.push({ id: doc.id, ...data } as ItineraryEvent);
          }
        } else {
          const startLocal = DateTime.fromISO(data.startDateTime).setZone(data.timezone || inferTimezone(trip.destination));
          if (currentDay && startLocal.toFormat('yyyy-MM-dd') === currentDay.dateStr) {
            items.push({ id: doc.id, ...data } as ItineraryEvent);
          }
        }
      });

      const markers = { start: [] as string[], end: [] as string[] };
      if (!isStaysFlights && currentDay) {
        const staysByRes: Record<string, ItineraryEvent[]> = {};
        allStays.forEach(stay => {
          if (stay.reservationNumber) {
            if (!staysByRes[stay.reservationNumber]) staysByRes[stay.reservationNumber] = [];
            staysByRes[stay.reservationNumber].push(stay);
          }
        });

        Object.values(staysByRes).forEach(group => {
          if (group.length >= 2) {
            group.sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));
            const checkInEvent = group[0];
            const checkOutEvent = group[group.length - 1];
            
            const checkInLocal = DateTime.fromISO(checkInEvent.startDateTime).setZone(checkInEvent.timezone || inferTimezone(trip.destination));
            const checkOutLocal = DateTime.fromISO(checkOutEvent.startDateTime).setZone(checkOutEvent.timezone || inferTimezone(trip.destination));
            
            const checkInDateStr = checkInLocal.toFormat('yyyy-MM-dd');
            const checkOutDateStr = checkOutLocal.toFormat('yyyy-MM-dd');
            
            const hotelName = checkInEvent.locationName || checkInEvent.title.replace('Check-in: ', '').replace('Check-out: ', '');

            if (currentDay.dateStr === checkInDateStr && checkInDateStr !== checkOutDateStr) {
              markers.end.push(hotelName);
            } else if (currentDay.dateStr > checkInDateStr && currentDay.dateStr < checkOutDateStr) {
              markers.start.push(hotelName);
              markers.end.push(hotelName);
            } else if (currentDay.dateStr === checkOutDateStr && checkInDateStr !== checkOutDateStr) {
              markers.start.push(hotelName);
            }
          }
        });
      }
      setOvernightMarkers(markers);

      // Sort chronologically by startDateTime
      items.sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''));
      setEvents(items);
    }, (err) => {
      console.error("Error listening to events:", err);
      handleFirestoreError(err, OperationType.LIST, `trips/${trip.id}/events`);
    });

    return () => unsubscribe();
  }, [trip.id, selectedDayId, days]);

  // Open modal for addition
  const openAddModal = () => {
    if (userRole === 'viewer') return;
    setEditingEvent(null);
    setShortlistSourceId(null);
    setTitle('');
    
    const isStaysFlights = selectedDayId === 'stays-flights';
    setCategory(isStaysFlights ? 'stay' : 'activity');
    
    const currentDay = isStaysFlights ? days[0] : days.find(d => d.id === selectedDayId);
    const dateStr = currentDay ? currentDay.dateStr : new Date().toISOString().split('T')[0];
    setStartDateTimeLocal(`${dateStr}T09:00`);
    setEndDateTimeLocal(`${dateStr}T10:00`);
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
    setEventTravelerIds([]);
    setIsModalOpen(true);
  };

  const openScheduleModal = (item: any) => {
    if (userRole === 'viewer') return;
    setEditingEvent(null);
    setShortlistSourceId(item.id);
    setTitle(item.title || '');
    setCategory(item.category || 'activity');
    const currentDay = days.length > 0 ? days[0] : null;
    const dateStr = currentDay ? currentDay.dateStr : new Date().toISOString().split('T')[0];
    setStartDateTimeLocal(`${dateStr}T09:00`);
    setEndDateTimeLocal(`${dateStr}T10:00`);
    setLocationName(item.locationName || '');
    setAddress(item.address || '');
    setLat(item.coordinates?.lat?.toString() || '');
    setLng(item.coordinates?.lng?.toString() || '');
    setNotes(item.notes || '');
    setReservationNumber('');
    setDogFriendly(item.dogFriendly || false);
    setFileUrl('');
    setFileName('');
    setEventTravelerIds([]);
    setErrorMsg('');
    setIsModalOpen(true);
  };

  // Open modal for edit
  const openEditModal = (event: ItineraryEvent) => {
    if (userRole === 'viewer') return;
    setEditingEvent(event);
    setShortlistSourceId(null);
    setTitle(event.title || '');
    setCategory(event.category || 'activity');

    const tzFallback = inferTimezone(trip.destination);
    const startLocal = DateTime.fromISO(event.startDateTime).setZone(event.timezone || tzFallback);
    const endLocal = DateTime.fromISO(event.endDateTime).setZone(event.timezone || tzFallback);
    setStartDateTimeLocal(startLocal.isValid ? startLocal.toFormat("yyyy-MM-dd'T'HH:mm") : '');
    setEndDateTimeLocal(endLocal.isValid ? endLocal.toFormat("yyyy-MM-dd'T'HH:mm") : '');

    setTimezone(event.timezone || tzFallback);
    setLocationName(event.locationName || '');
    setAddress(event.address || '');
    setLat(event.coordinates?.lat?.toString() || '');
    setLng(event.coordinates?.lng?.toString() || '');
    setNotes(event.notes || '');
    setReservationNumber(event.reservationNumber || '');
    setDogFriendly(event.dogFriendly || false);
    setFileUrl(event.fileUrl || '');
    setFileName(event.fileName || '');
    setEventTravelerIds(event.travelerIds || []);
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

    if (!title.trim() || !locationName.trim() || !startDateTimeLocal || !endDateTimeLocal) {
      setErrorMsg('Please fill in required fields: Title, Location, and Time slots.');
      return;
    }

    setIsSaving(true);
    try {
      let finalLat = parseFloat(lat);
      let finalLng = parseFloat(lng);

      if (isNaN(finalLat) || isNaN(finalLng)) {
        // Automatically attempt to geocode
        const autoCoords = await geocodeLocation(locationName, address);
        if (autoCoords) {
          finalLat = autoCoords.lat;
          finalLng = autoCoords.lng;
        }
      }

      const startLocal = DateTime.fromFormat(startDateTimeLocal, "yyyy-MM-dd'T'HH:mm", { zone: timezone });
      const endLocal = DateTime.fromFormat(endDateTimeLocal, "yyyy-MM-dd'T'HH:mm", { zone: timezone });

      let finalEndLocal = endLocal;
      if (endLocal < startLocal) {
        finalEndLocal = endLocal.plus({ days: 1 });
      }

      const startDateTime = startLocal.toISO()!;
      const endDateTime = finalEndLocal.toISO()!;

      const eventData: any = {
        title,
        category,
        startDateTime,
        endDateTime,
        timezone,
        locationName,
        address: address || '',
        notes: notes || '',
        reservationNumber: reservationNumber || '',
        dogFriendly: trip.petFriendly ? dogFriendly : false,
        fileUrl: fileUrl || '',
        fileName: fileName || '',
        travelerIds: eventTravelerIds,
        updatedAt: new Date().toISOString(),
        timeUnknown: false,
        status: editingEvent ? (editingEvent.status || 'confirmed') : 'confirmed',
      };

      if (editingEvent && editingEvent.options) {
        eventData.options = editingEvent.options;
      }

      if (!isNaN(finalLat) && !isNaN(finalLng)) {
        eventData.coordinates = { lat: finalLat, lng: finalLng };
      }

      if (editingEvent) {
        // Edit existing
        const eventDocRef = doc(db, `trips/${trip.id}/events`, editingEvent.id);
        try {
          await updateDoc(eventDocRef, eventData);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}/events/${editingEvent.id}`);
          throw err;
        }
      } else {
        // Add new
        const eventsCollRef = collection(db, `trips/${trip.id}/events`);
        try {
          await addDoc(eventsCollRef, eventData);
          if (shortlistSourceId) {
            const shortlistDocRef = doc(db, `trips/${trip.id}/shortlist`, shortlistSourceId);
            await deleteDoc(shortlistDocRef);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `trips/${trip.id}/events`);
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
    } finally {
      setIsSaving(false);
    }
  };

  // Delete Event
  const handleDeleteEvent = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (userRole === 'viewer') return;
    
    // Optimistically hide
    setPendingDeletes(prev => [...prev, eventId]);

    // Schedule actual delete
    deleteTimeouts.current[eventId] = setTimeout(async () => {
      try {
        const eventDocRef = doc(db, `trips/${trip.id}/events`, eventId);
        await deleteDoc(eventDocRef);
      } catch (err: any) {
        console.error("Error deleting event:", err);
      }
      setPendingDeletes(prev => prev.filter(id => id !== eventId));
    }, 5000);
  };

  const handleUndoDelete = (eventId: string) => {
    if (deleteTimeouts.current[eventId]) {
      clearTimeout(deleteTimeouts.current[eventId]);
      delete deleteTimeouts.current[eventId];
    }
    setPendingDeletes(prev => prev.filter(id => id !== eventId));
  };

  const executeSaveEvents = async (eventsToSave: any[]) => {
    try {
      const sortedDates = eventsToSave.map(e => new Date(e.date).getTime()).sort((a,b) => a-b);
      const earliestStr = new Date(sortedDates[0]).toISOString().split('T')[0];
      const latestStr = new Date(sortedDates[sortedDates.length - 1]).toISOString().split('T')[0];

      let updatedStart = trip.startDate;
      let updatedEnd = trip.endDate;

      if (!updatedStart || earliestStr < updatedStart) {
        updatedStart = earliestStr;
      }
      if (!updatedEnd || latestStr > updatedEnd) {
        updatedEnd = latestStr;
      }

      const updates: any = {};
      if (updatedStart !== trip.startDate) updates.startDate = updatedStart;
      if (updatedEnd !== trip.endDate) updates.endDate = updatedEnd;

      if (trip.status === 'planning' || trip.status === 'upcoming' || trip.status === 'draft' || trip.status === 'dreaming') {
        updates.status = 'booking';
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date().toISOString();
        await updateDoc(doc(db, 'trips', trip.id), updates);
      }

      for (const ev of eventsToSave) {
        const startDateTime = `${ev.date}T${ev.startTime}`;
        const endDateTime = `${ev.date}T${ev.endTime}`;
        await addDoc(collection(db, `trips/${trip.id}/events`), {
          category: ev.category,
          title: ev.title,
          startDateTime,
          endDateTime,
          locationName: ev.locationName,
          address: ev.address || '',
          notes: ev.notes || '',
          isAnchor: true,
          source: 'anchor',
          reservationNumber: ev.isBooked ? 'Confirmed' : '',
          timezone: ev.timezone || inferTimezone(trip.destination),
          coordinates: ev.lat && ev.lng ? { lat: ev.lat, lng: ev.lng } : null,
          status: 'confirmed'
        });
      }
      setIsBookingModalOpen(false);
    } catch (e) {
      console.error("Failed to add booking events:", e);
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
          <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBookingModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-emerald-700"
            title="Add Booking (AI)"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Add Booking
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition bg-indigo-50 hover:bg-indigo-100 border-indigo-100 text-indigo-700"
            title="Add Stop"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        </div>
        )}
      </div>

      {/* Days Scroller */}
      <div className="flex gap-2 overflow-x-auto py-3 border-b border-slate-100 scrollbar-none" id="days-tabs">
        {days.length > 0 && (
          <>
          <button
            onClick={() => onSelectDay('shortlist')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 border transition flex flex-col items-center justify-center ${
              selectedDayId === 'shortlist'
                ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-100'
                : 'bg-purple-50 border-purple-100 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <div className="font-bold">📝 Shortlist {shortlistItems.length > 0 && `(${shortlistItems.length})`}</div>
            <div className={`text-[9px] ${selectedDayId === 'shortlist' ? 'text-purple-100' : 'text-purple-600'} mt-0.5`}>
              Unscheduled ideas
            </div>
          </button>
          <button
            onClick={() => onSelectDay('stays-flights')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 border transition flex flex-col items-center justify-center ${
              selectedDayId === 'stays-flights'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100'
                : 'bg-emerald-50 border-emerald-100 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <div className="font-bold">🏨 Stays & Flights</div>
            <div className={`text-[9px] ${selectedDayId === 'stays-flights' ? 'text-emerald-100' : 'text-emerald-600'} mt-0.5`}>
              All bookings
            </div>
          </button>
          {userRole !== 'viewer' && (
            <button
              onClick={() => setIsBookingModalOpen(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold shrink-0 border border-emerald-200/60 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition flex flex-col items-center justify-center cursor-pointer"
              title="Add Booking (AI)"
            >
              <div className="font-bold flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 animate-pulse" /> Add a booking
              </div>
              <div className="text-[9px] text-emerald-500 mt-0.5 font-normal">
                Paste confirmations
              </div>
            </button>
          )}
          </>
        )}

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

      {/* Traveler Filter Control */}
      {trip.travelers && trip.travelers.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3 px-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filter Timeline</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterTravelerId('everyone')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
                filterTravelerId === 'everyone'
                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>Everyone</span>
            </button>
            {trip.travelers.map((traveler) => {
              const isSelected = filterTravelerId === traveler.id;
              const initials = traveler.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <button
                  key={traveler.id}
                  onClick={() => setFilterTravelerId(traveler.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-3.5 w-3.5 rounded-full ${traveler.color || 'bg-slate-500'} text-[8px] font-bold text-white flex items-center justify-center`}>
                    {initials}
                  </span>
                  <span>{traveler.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedDayId === 'shortlist' ? (
        <div className="flex-1 overflow-y-auto mt-4 pr-1 relative flex flex-col gap-3">
          {shortlistItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Sparkles className="h-10 w-10 text-slate-300 mb-3" />
              <h4 className="font-display font-bold text-sm text-slate-800">Shortlist is Empty</h4>
              {userRole !== 'viewer' && (
                <button 
                  onClick={() => setIsShortlistModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Add Idea Manually
                </button>
              )}
              <p className="text-xs text-slate-400 max-w-xs mt-1.5">
                Great ideas without a specific day will show up here. Use the Copilot or Add to Shortlist directly!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end mb-2">
                {userRole !== 'viewer' && (
                  <button 
                    onClick={() => setIsShortlistModalOpen(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition shadow-sm"
                  >
                    + Add Idea
                  </button>
                )}
              </div>
              {shortlistItems.map(item => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-display font-bold text-sm text-slate-900">{item.title}</h4>
                    <p className="text-[11px] text-slate-500 font-medium">{item.locationName}</p>
                    {item.notes && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.notes}</p>}
                  </div>
                  {userRole !== 'viewer' && (
                    <button 
                      onClick={() => {
                        openScheduleModal(item);
                      }}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg transition"
                    >
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            ))}
            </div>
          )}
        </div>
      ) : (() => {
        const filteredEvents = events.filter((event) => {
          if (pendingDeletes.includes(event.id)) return false;
          if (filterTravelerId === 'everyone') {
            return true;
          }
          return !event.travelerIds || event.travelerIds.length === 0 || event.travelerIds.includes(filterTravelerId);
        });

        return (
          <div className="flex-1 overflow-y-auto mt-4 pr-1 relative flex flex-col gap-6" id="timeline-list">
            {filteredEvents.length === 0 && overnightMarkers.start.length === 0 && overnightMarkers.end.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Compass className="h-10 w-10 text-slate-300 animate-pulse mb-3" />
                <h4 className="font-display font-bold text-sm text-slate-800">
                  {selectedDayId === 'stays-flights' 
                    ? 'No Stays or Flights Logged' 
                    : events.length === 0 
                      ? 'No Stops Planned Yet' 
                      : 'No Stops for this Traveler'}
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mt-1.5">
                  {selectedDayId === 'stays-flights'
                    ? 'Add accommodation locations (hotels, stays) or transit flights using the Add Stop button!'
                    : events.length === 0 
                      ? 'Select our AI travel copilot panel to curate a custom itinerary with a single wizard-wizard flow!'
                      : 'This traveler has no specific assignments on any stops for this day.'}
                </p>
                {events.length === 0 && userRole !== 'viewer' && (
                  <button 
                    onClick={() => {
                      if (selectedDayId === 'stays-flights') {
                        setIsBookingModalOpen(true);
                      } else {
                        openAddModal();
                      }
                    }}
                    className="mt-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg border border-slate-200 transition"
                  >
                    {selectedDayId === 'stays-flights' ? 'Add Stay / Flight (AI)' : 'Add Custom Stop'}
                  </button>
                )}
              </div>
            ) : (
              <div className="relative pl-6 flex flex-col gap-5">
                {/* Timeline connection line */}
                <div className="absolute top-2 bottom-2 left-[10px] w-0.5 bg-slate-100" />
                {overnightMarkers.start.map((hotelName, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={`start-marker-${idx}`} 
                    className="relative group bg-indigo-50/50 border border-indigo-100/50 rounded-xl p-3 shadow-sm flex items-center gap-3"
                  >
                    <div className="absolute -left-[22px] top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center shadow-sm bg-indigo-100 text-indigo-600">
                      <span className="text-[10px]">🌙</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">🌙 <span className="font-bold">{hotelName}</span></p>
                    </div>
                  </motion.div>
                ))}

                {filteredEvents.map((event, index) => {
                  const cat = getCatConfig(event.category);
                  const Icon = cat.icon;

                  // Generate navigation deep-links
                  const mapsSearchQuery = encodeURIComponent(`${event.locationName} ${event.address || ''}`);
                  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsSearchQuery}`;
                  const appleMapsUrl = `maps://?q=${mapsSearchQuery}`;

                  const nextEvent = filteredEvents[index + 1];
                  let showTransit = false;
                  if (nextEvent && event.locationName && nextEvent.locationName && event.locationName.trim() !== nextEvent.locationName.trim()) {
                    showTransit = true;
                  }

                  const isPending = event.status === 'pending';
                  const isExpanded = expandedPendingEventId === event.id;

                  return (
                    <React.Fragment key={event.id}>
                    <motion.div 
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`relative group bg-white border rounded-xl p-4 shadow-sm transition ${
                          isPending 
                            ? 'border-dashed border-2 border-indigo-300 hover:border-indigo-400/90 bg-indigo-50/5 cursor-pointer' 
                            : 'border-slate-100 hover:border-slate-200/80 hover:shadow-md'
                        }`}
                        onClick={() => {
                          if (isPending) {
                            setExpandedPendingEventId(isExpanded ? null : event.id);
                            setCustomOptionText('');
                          }
                        }}
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
                              {isPending && (
                                <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[9px] font-bold border border-indigo-200 animate-pulse flex items-center gap-1">
                                  <HelpCircle className="h-3 w-3 text-indigo-500" />
                                  Pick one
                                </span>
                              )}
                              {(event.source === 'anchor' || event.isAnchor) && (
                                <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[9px] font-bold border border-blue-100 flex items-center gap-1" title="Fixed/Booked Anchor Event">
                                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                  Anchor
                                </span>
                              )}
                              {event.source === 'wizard' && (
                                <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-100 flex items-center gap-1" title="Wizard Suggested Entry">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Wizard
                                </span>
                              )}
                              {event.source === 'ai-suggested' && (
                                <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[9px] font-bold border border-purple-100 flex items-center gap-1" title="AI Copilot Suggested Entry">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  AI Suggestion
                                </span>
                              )}
                              {event.dogFriendly && (
                                <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 border border-emerald-100" title="Dog Friendly Stop">
                                  <Dog className="h-2.5 w-2.5" />
                                  Dog Friendly
                                </span>
                              )}
                            </div>

                            {userRole !== 'viewer' && (
                              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
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
                            {!event.timeUnknown && (() => {
                              const startLocal = DateTime.fromISO(event.startDateTime).setZone(event.timezone);
                              const endLocal = DateTime.fromISO(event.endDateTime).setZone(event.timezone);
                              const isSpanning = startLocal.toFormat('yyyy-MM-dd') !== endLocal.toFormat('yyyy-MM-dd');
                              const timeStr = isSpanning 
                                ? `${startLocal.toFormat('MMM dd, HH:mm')} → ${endLocal.toFormat('MMM dd, HH:mm')}`
                                : `${startLocal.toFormat('HH:mm')} — ${endLocal.toFormat('HH:mm')}`;
                              return (
                                <span className="text-[11px] font-mono text-indigo-600 font-bold shrink-0 bg-indigo-50/50 px-2 py-0.5 rounded">
                                  {timeStr}
                                </span>
                              );
                            })()}
                          </div>

                          {/* Assigned Travelers Initials badges */}
                          {event.travelerIds && event.travelerIds.length > 0 && trip.travelers && trip.travelers.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="text-[9px] text-slate-400 font-medium font-mono uppercase tracking-wider">Travelers:</span>
                              <div className="flex -space-x-1 overflow-hidden">
                                {trip.travelers
                                  .filter((t) => event.travelerIds?.includes(t.id))
                                  .map((traveler) => {
                                    const initials = traveler.name
                                      .split(' ')
                                      .map((n) => n[0])
                                      .join('')
                                      .toUpperCase()
                                      .slice(0, 2);
                                    return (
                                      <div
                                        key={traveler.id}
                                        className={`inline-block h-5 w-5 rounded-full ${traveler.color || 'bg-slate-500'} text-[8px] font-bold text-white flex items-center justify-center ring-2 ring-white select-none`}
                                        title={traveler.name}
                                      >
                                        {initials}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}

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
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    <span>View Receipt ({event.fileName ? (event.fileName.length > 15 ? event.fileName.slice(0, 15) + '...' : event.fileName) : 'Attached'})</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Interactive Option Selector Panel for Pending Events */}
                          {isPending && isExpanded && (
                            <div className="mt-3 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                              <div className="text-[10px] font-mono text-indigo-800 uppercase tracking-wider font-bold">Choose a restaurant/option:</div>
                              
                              <div className="flex flex-col gap-2.5">
                                {event.options && event.options.map((opt, oIdx) => (
                                  <div key={oIdx} className="bg-white border border-slate-100 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:border-indigo-200 transition">
                                    <div className="flex-1">
                                      <div className="font-bold text-xs text-slate-800">{opt.name}</div>
                                      {opt.notes && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{opt.notes}</p>}
                                      {opt.address && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{opt.address}</p>}
                                    </div>
                                    <button
                                      onClick={async () => {
                                        if (userRole === 'viewer') return;
                                        const eventDocRef = doc(db, `trips/${trip.id}/events`, event.id);
                                        await updateDoc(eventDocRef, {
                                          title: opt.name,
                                          locationName: opt.name,
                                          address: opt.address || '',
                                          coordinates: opt.lat && opt.lng ? { lat: opt.lat, lng: opt.lng } : null,
                                          notes: opt.notes || '',
                                          status: 'confirmed',
                                          options: null, // Clear choice options
                                          updatedAt: new Date().toISOString()
                                        });
                                        setExpandedPendingEventId(null);
                                      }}
                                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg transition shrink-0 self-end sm:self-center cursor-pointer"
                                    >
                                      Choose
                                    </button>
                                  </div>
                                ))}
                              </div>

                              {/* Custom Option Input */}
                              <div className="border-t border-slate-200/60 pt-2.5 mt-1 flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Or type custom restaurant / place:</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Type customized name..."
                                    value={customOptionText}
                                    onChange={(e) => setCustomOptionText(e.target.value)}
                                    className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-indigo-500"
                                  />
                                  <button
                                    onClick={async () => {
                                      if (!customOptionText.trim()) return;
                                      if (userRole === 'viewer') return;
                                      const eventDocRef = doc(db, `trips/${trip.id}/events`, event.id);
                                      
                                      let customLat: number | undefined = undefined;
                                      let customLng: number | undefined = undefined;
                                      try {
                                        const coords = await geocodeLocation(customOptionText, '');
                                        if (coords) {
                                          customLat = coords.lat;
                                          customLng = coords.lng;
                                        }
                                      } catch (e) {
                                        console.error("Geocoding custom option failed:", e);
                                      }

                                      await updateDoc(eventDocRef, {
                                        title: customOptionText,
                                        locationName: customOptionText,
                                        address: '',
                                        coordinates: customLat && customLng ? { lat: customLat, lng: customLng } : null,
                                        notes: 'Custom option chosen',
                                        status: 'confirmed',
                                        options: null,
                                        updatedAt: new Date().toISOString()
                                      });
                                      setExpandedPendingEventId(null);
                                      setCustomOptionText('');
                                    }}
                                    className="px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer"
                                  >
                                    Submit
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Map Navigation Direct Link buttons - Hide for pending */}
                          {!isPending && (
                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50" onClick={(e) => e.stopPropagation()}>
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
                          )}
                        </div>
                      </motion.div>
                    
                    {showTransit && (
                      <div className="relative pl-2 py-2 flex items-center gap-3 opacity-80 hover:opacity-100 transition">
                        <div className="absolute -left-[15px] top-1/2 -translate-y-1/2 h-4 w-4 bg-slate-100 border-2 border-white rounded-full flex items-center justify-center">
                          <Plane className="h-2 w-2 text-slate-400" />
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-2 border border-dashed border-slate-200 rounded-lg px-3 py-2 w-full">
                          <span className="flex items-center gap-1 text-slate-500 truncate max-w-[200px]">
                            <MapPin className="h-3 w-3 text-slate-400 shrink-0" /> Transit to {nextEvent.locationName}
                          </span>
                          <span className="flex-1 border-b border-dashed border-slate-200 h-px hidden sm:block"></span>
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1&origin=${mapsSearchQuery}&destination=${encodeURIComponent(`${nextEvent.locationName} ${nextEvent.address || ''}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-500 hover:text-indigo-600 transition flex items-center gap-1 shrink-0"
                          >
                            <Globe className="h-3 w-3" /> Get Directions
                          </a>
                        </div>
                      </div>
                    )}
                    </React.Fragment>
                  );
                })}
                {overnightMarkers.end.map((hotelName, idx) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={`end-marker-${idx}`} 
                    className="relative group bg-indigo-50/50 border border-indigo-100/50 rounded-xl p-3 shadow-sm flex items-center gap-3 mt-1"
                  >
                    <div className="absolute -left-[22px] top-1/2 -translate-y-1/2 h-6 w-6 rounded-full border-2 border-white flex items-center justify-center shadow-sm bg-indigo-100 text-indigo-600">
                      <span className="text-[10px]">🌙</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">🌙 <span className="font-bold">{hotelName}</span></p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      
      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-emerald-600" />
                <h3 className="font-display font-bold text-slate-800 text-base">Add a Booking with AI</h3>
              </div>
              <button onClick={() => setIsBookingModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <AnchorExtractionFlow
                tripId={trip.id}
                onConfirm={async (events) => {
                  if (events.length === 0) return;
                  
                  const sortedDates = events.map(e => new Date(e.date).getTime()).sort((a,b) => a-b);
                  const earliestStr = new Date(sortedDates[0]).toISOString().split('T')[0];
                  const latestStr = new Date(sortedDates[sortedDates.length - 1]).toISOString().split('T')[0];

                  const hasExistingDates = trip.startDate && trip.endDate;
                  const isOutside = hasExistingDates && (earliestStr < trip.startDate || latestStr > trip.endDate);

                  if (isOutside) {
                    setPendingEvents(events);
                    setShowExpandConfirm(true);
                  } else {
                    await executeSaveEvents(events);
                  }
                }}
                onCancel={() => setIsBookingModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* EVENT ADD/EDIT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
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

                

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Date & Time *</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={startDateTimeLocal}
                      onChange={(e) => setStartDateTimeLocal(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Date & Time *</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={endDateTimeLocal}
                      onChange={(e) => setEndDateTimeLocal(e.target.value)}
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

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Map Coordinates</label>
                    <button
                      type="button"
                      onClick={handleAutoGeocode}
                      disabled={isGeocoding || !locationName.trim()}
                      className="text-[10px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg transition disabled:opacity-50 cursor-pointer"
                    >
                      {isGeocoding ? "🔍 Finding..." : "📍 Auto-Detect"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-1">
                    <div className="flex flex-col gap-1">
                      <input 
                        type="text" 
                        placeholder="Latitude (e.g. 34.8519)"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition font-mono"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <input 
                        type="text" 
                        placeholder="Longitude (e.g. -111.7874)"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition font-mono"
                      />
                    </div>
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

                {/* Traveler Assignment Selector */}
                {trip.travelers && trip.travelers.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Assign Travelers (Split-Trip)
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Select which travelers are participating in this stop. Leave all unchecked/empty for "Everyone".
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {trip.travelers.map((traveler) => {
                        const isAssigned = eventTravelerIds.includes(traveler.id);
                        const initials = traveler.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);
                        return (
                          <button
                            type="button"
                            key={traveler.id}
                            onClick={() => {
                              if (isAssigned) {
                                setEventTravelerIds(eventTravelerIds.filter((id) => id !== traveler.id));
                              } else {
                                setEventTravelerIds([...eventTravelerIds, traveler.id]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition ${
                              isAssigned
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`h-4.5 w-4.5 rounded-full ${traveler.color || 'bg-slate-500'} text-[9px] font-bold text-white flex items-center justify-center`}>
                              {initials}
                            </span>
                            <span>{traveler.name}</span>
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={() => {}} // Click handled by button
                              className="h-3 w-3 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 ml-1"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                    disabled={isSaving || isGeocoding}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || isGeocoding}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      "Save Stop"
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showExpandConfirm && pendingEvents && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-2xl max-w-md w-full flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h4 className="font-display font-bold text-base text-slate-900">Expand Trip Dates?</h4>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Some of your added bookings fall outside your current trip dates (<span className="font-semibold text-slate-800">{trip.startDate}</span> to <span className="font-semibold text-slate-800">{trip.endDate}</span>).
              <br /><br />
              Would you like to expand the trip's date range to include these new bookings?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowExpandConfirm(false);
                  setPendingEvents(null);
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold transition"
              >
                No, Go Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  const eventsToSave = pendingEvents;
                  setShowExpandConfirm(false);
                  setPendingEvents(null);
                  await executeSaveEvents(eventsToSave);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-100"
              >
                Yes, Expand & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
