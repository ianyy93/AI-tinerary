/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { doc, onSnapshot, updateDoc, collection, query, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import { Trip, Day, UserSession, CollaboratorRole, TripType, TripStatus } from '../../types';
import ItineraryTimeline from '../timeline/ItineraryTimeline';
import LeafletMap from '../map/LeafletMap';
import CopilotPanel from '../copilot/CopilotPanel';
import { 
  ArrowLeft, Users, Calendar, MapPin, Share2, Plus, Check, Settings, 
  Map as MapIcon, Calendar as CalendarIcon, Sparkles, Dog, ShieldAlert, Smile, Trash2, Plane
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DateTime } from 'luxon';
import { inferTimezone } from '../../utils/timezone';

const migrateTripEvents = async (tripId: string, currentSchemaVersion: number, destination?: string) => {
  if (currentSchemaVersion >= 2) return;
  console.log(`Migrating trip ${tripId} from schema version ${currentSchemaVersion} to 2`);

  try {
    const daysRef = collection(db, `trips/${tripId}/days`);
    const daysSnap = await getDocs(daysRef);
    const daysList = daysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Day);

    const newEventsCollRef = collection(db, `trips/${tripId}/events`);

    for (const day of daysList) {
      const oldEventsRef = collection(db, `trips/${tripId}/days/${day.id}/events`);
      const oldEventsSnap = await getDocs(oldEventsRef);

      for (const eventDoc of oldEventsSnap.docs) {
        const eventData = eventDoc.data();
        const timezone = eventData.timezone || inferTimezone(destination);
        const startTime = eventData.startTime || '09:00';
        const endTime = eventData.endTime || '10:00';

        const startLocal = DateTime.fromFormat(`${day.dateStr} ${startTime}`, 'yyyy-MM-dd HH:mm', { zone: timezone });
        const endLocal = DateTime.fromFormat(`${day.dateStr} ${endTime}`, 'yyyy-MM-dd HH:mm', { zone: timezone });

        let finalEndLocal = endLocal;
        if (endLocal < startLocal) {
          finalEndLocal = endLocal.plus({ days: 1 });
        }

        const startDateTime = startLocal.toISO() || new Date(`${day.dateStr}T${startTime}:00`).toISOString();
        const endDateTime = finalEndLocal.toISO() || new Date(`${day.dateStr}T${endTime}:00`).toISOString();

        const { startTime: _, endTime: __, ...rest } = eventData;
        await addDoc(newEventsCollRef, {
          ...rest,
          startDateTime,
          endDateTime,
          timezone,
        });

        await deleteDoc(doc(db, `trips/${tripId}/days/${day.id}/events`, eventDoc.id));
      }
    }

    const tripDocRef = doc(db, 'trips', tripId);
    await updateDoc(tripDocRef, { schemaVersion: 2 });
    console.log(`Successfully migrated trip ${tripId} to schema version 2`);
  } catch (err) {
    console.error("Failed to migrate trip events:", err);
  }
};

interface TripViewProps {
  tripId: string;
  user: UserSession;
  onBackToHub: () => void;
}

export default function TripView({ tripId, user, onBackToHub }: TripViewProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Collaboration state
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>('editor');

  // Travelers state
  const [isTravelerOpen, setIsTravelerOpen] = useState(false);
  const [travelerName, setTravelerName] = useState('');
  const [travelerColor, setTravelerColor] = useState('bg-indigo-500');
  const [travelerEmail, setTravelerEmail] = useState('');

  const TRAVELER_COLORS = [
    { name: 'Indigo', class: 'bg-indigo-500' },
    { name: 'Red', class: 'bg-red-500' },
    { name: 'Orange', class: 'bg-orange-500' },
    { name: 'Amber', class: 'bg-amber-500' },
    { name: 'Emerald', class: 'bg-emerald-500' },
    { name: 'Teal', class: 'bg-teal-500' },
    { name: 'Blue', class: 'bg-blue-500' },
    { name: 'Purple', class: 'bg-purple-500' },
    { name: 'Pink', class: 'bg-pink-500' },
    { name: 'Slate', class: 'bg-slate-500' },
  ];

  // Mobile navigation tabs
  const [mobileTab, setMobileTab] = useState<'timeline' | 'map' | 'copilot'>('timeline');

  // Edit Trip state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editTripType, setEditTripType] = useState<TripType>('mixed');
  const [editPetFriendly, setEditPetFriendly] = useState(false);
  const [editCoverColor, setEditCoverColor] = useState('bg-blue-50 border-blue-100 text-blue-700');
  const [editStatus, setEditStatus] = useState<TripStatus>('planning');
  const [editStatusOverride, setEditStatusOverride] = useState(false);
  const [showOrphanedBanner, setShowOrphanedBanner] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [events, setEvents] = useState<any[]>([]);


  useEffect(() => {
    if (trip && isEditOpen) {
      setEditTitle(trip.title);
      setEditDestination(trip.destination);
      setEditStartDate(trip.startDate || '');
      setEditEndDate(trip.endDate || '');
      setEditTripType(trip.tripType);
      setEditPetFriendly(trip.petFriendly);
      setEditCoverColor(trip.coverColor);
      setEditStatus(trip.status);
      setEditStatusOverride(!!trip.statusOverride);
    }
  }, [isEditOpen, trip]);

  // Automatic status progression checked on load of the trip details
  useEffect(() => {
    if (!trip) return;
    if (trip.status === 'archived' || trip.statusOverride) return;

    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    let targetStatus: TripStatus | null = null;

    if (!trip.startDate || !trip.endDate) {
      if (trip.status !== 'dreaming') {
        targetStatus = 'dreaming';
      }
    } else {
      if (trip.status === 'dreaming') {
        targetStatus = 'planning';
      } else if (todayStr >= trip.startDate && todayStr <= trip.endDate) {
        if (trip.status !== 'active') {
          targetStatus = 'active';
        }
      } else if (todayStr > trip.endDate) {
        if (trip.status !== 'completed') {
          targetStatus = 'completed';
        }
      } else {
        // Today is before trip.startDate
        if (trip.status === 'active' || trip.status === 'completed') {
          targetStatus = 'upcoming';
        }
      }
    }

    if (targetStatus && targetStatus !== trip.status) {
      const tripRef = doc(db, 'trips', trip.id);
      updateDoc(tripRef, { status: targetStatus }).catch((err) => {
        console.error("Failed to auto-progress status on load:", err);
      });
    }
  }, [trip]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;

    if (!editTitle.trim() || !editDestination.trim()) {
      alert("Title and Destination are required.");
      return;
    }

    try {
      const docRef = doc(db, 'trips', trip.id);
      
      const updateData: any = {
        title: editTitle,
        destination: editDestination,
        tripType: editTripType,
        coverColor: editCoverColor,
        petFriendly: editPetFriendly,
        status: editStatus,
        statusOverride: editStatusOverride,
      };

      const datesAddedOrChanged = editStartDate !== trip.startDate || editEndDate !== trip.endDate;

      if (datesAddedOrChanged) {
        if (editStartDate && editEndDate) {
          if (new Date(editStartDate) > new Date(editEndDate)) {
            alert("Start date cannot be after end date.");
            return;
          }
          updateData.startDate = editStartDate;
          updateData.endDate = editEndDate;
          
          // dreaming -> planning transition when dates are added
          if (trip.status === 'dreaming' && editStatus === 'dreaming') {
            updateData.status = 'planning';
          }
        } else {
          updateData.startDate = '';
          updateData.endDate = '';
        }
      }

      await updateDoc(docRef, updateData);

      // If dates were added or modified, update/recreate the days list
      if (datesAddedOrChanged) {
        const daysRef = collection(db, `trips/${trip.id}/days`);
        const daysSnap = await getDocs(daysRef);
        
        // Delete all old days
        for (const dDoc of daysSnap.docs) {
          await deleteDoc(doc(db, `trips/${trip.id}/days`, dDoc.id));
        }

        if (editStartDate && editEndDate) {
          const start = new Date(editStartDate);
          const end = new Date(editEndDate);
          const dayDiff = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          for (let i = 0; i < dayDiff; i++) {
            const currentDate = new Date(start);
            currentDate.setDate(start.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];
            await addDoc(daysRef, {
              id: `day-${i + 1}`,
              dateStr,
              title: `Day ${i + 1}`,
            });
          }
        }
      }

      setIsEditOpen(false);
    } catch (err: any) {
      console.error("Error saving trip edits:", err);
      alert("Failed to update trip details.");
    }
  };

  // 1. Listen to current Trip Metadata
  useEffect(() => {
    if (!tripId) return;

    const docRef = doc(db, 'trips', tripId);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const tripData = { id: snapshot.id, ...snapshot.data() } as Trip;
        setTrip(tripData);

        if (!tripData.schemaVersion || tripData.schemaVersion < 2) {
          migrateTripEvents(snapshot.id, tripData.schemaVersion || 1, tripData.destination);
        }
      } else {
        alert("Trip has been deleted or is inaccessible.");
        onBackToHub();
      }
    }, (err) => {
      console.error("Error listening to trip details:", err);
      handleFirestoreError(err, OperationType.GET, `trips/${tripId}`);
    });

    return () => unsubscribe();
  }, [tripId]);

  // 2. Fetch/listen to Days list
  useEffect(() => {
    if (!tripId) return;

    const daysRef = collection(db, `trips/${tripId}/days`);
    const unsubscribe = onSnapshot(daysRef, (snapshot) => {
      const items: Day[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as Day);
      });
      // Sort days chronologically by date
      items.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      setDays(items);

      if (items.length > 0) {
        const stillExists = selectedDayId === 'stays-flights' || items.some(d => d.id === selectedDayId);
        if (!stillExists) {
          setSelectedDayId(items[0].id);
        }
      } else {
        setSelectedDayId(selectedDayId === 'stays-flights' ? 'stays-flights' : null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error listening to days:", err);
      handleFirestoreError(err, OperationType.LIST, `trips/${tripId}/days`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tripId, selectedDayId]);

  // 2.1 Fetch/listen to Events list in real-time
  useEffect(() => {
    if (!tripId) return;

    const eventsRef = collection(db, `trips/${tripId}/events`);
    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setEvents(items);
    }, (err) => {
      console.error("Error listening to events:", err);
      handleFirestoreError(err, OperationType.LIST, `trips/${tripId}/events`);
    });

    return () => unsubscribe();
  }, [tripId]);

  // 2.2 Calculate orphaned events reactively
  const orphanedEvents = React.useMemo(() => {
    if (!trip || !trip.startDate || !trip.endDate || events.length === 0) return [];
    const tz = inferTimezone(trip.destination);
    return events.filter(ev => {
      if (!ev.startDateTime) return false;
      const startLocal = DateTime.fromISO(ev.startDateTime).setZone(ev.timezone || tz);
      const eventDateStr = startLocal.toFormat('yyyy-MM-dd');
      return eventDateStr < trip.startDate || eventDateStr > trip.endDate;
    });
  }, [events, trip]);

  // 3. User Role resolution
  const userIdentifier = user.email || user.uid || '';
  const collaborators = trip?.collaborators || {};
  const userRole: CollaboratorRole = collaborators[userIdentifier] || collaborators[user.uid] || (trip?.userId === user.uid ? 'owner' : 'viewer');

  // 4. Invite collaborator handler
  const handleInviteCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    if (userRole !== 'owner' && userRole !== 'editor') {
      alert("Only owners or editors can invite collaborators.");
      return;
    }

    if (!inviteEmail.trim()) return;

    try {
      const emailLower = inviteEmail.trim().toLowerCase();
      const updatedCollaborators = {
        ...trip.collaborators,
        [emailLower]: inviteRole
      };

      const updatedEmails = Array.from(new Set([
        ...(trip.collaboratorEmails || []),
        emailLower
      ]));

      const docRef = doc(db, 'trips', trip.id);
      try {
        await updateDoc(docRef, {
          collaborators: updatedCollaborators,
          collaboratorEmails: updatedEmails
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `trips/${trip.id}`);
        throw err;
      }

      setInviteEmail('');
      alert(`Successfully added ${inviteEmail} as ${inviteRole}!`);
    } catch (e: any) {
      console.error("Error adding collaborator:", e);
      alert("Failed to invite collaborator.");
    }
  };

  // Traveler management handlers
  const handleAddTraveler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip) return;
    if (userRole === 'viewer') {
      alert("Only owners or editors can add travelers.");
      return;
    }
    if (!travelerName.trim()) return;

    try {
      const newTraveler: any = {
        id: `trv-${Math.random().toString(36).substr(2, 9)}`,
        name: travelerName.trim(),
        color: travelerColor,
      };
      
      if (travelerEmail.trim()) {
        newTraveler.email = travelerEmail.trim().toLowerCase();
      }

      const updatedTravelers = [...(trip.travelers || []), newTraveler];

      const docRef = doc(db, 'trips', trip.id);
      await updateDoc(docRef, {
        travelers: updatedTravelers,
      });

      setTravelerName('');
      setTravelerEmail('');
      // set color to a random default color
      const nextColor = TRAVELER_COLORS[Math.floor(Math.random() * TRAVELER_COLORS.length)].class;
      setTravelerColor(nextColor);
    } catch (err: any) {
      console.error("Error adding traveler:", err);
      alert("Failed to add traveler.");
    }
  };

  const handleRemoveTraveler = async (travelerId: string) => {
    if (!trip) return;
    if (userRole === 'viewer') {
      alert("Only owners or editors can remove travelers.");
      return;
    }

    if (!confirm("Are you sure you want to remove this traveler? They will be removed from this list, but their past assignments remain.")) {
      return;
    }

    try {
      const updatedTravelers = (trip.travelers || []).filter(t => t.id !== travelerId);

      const docRef = doc(db, 'trips', trip.id);
      await updateDoc(docRef, {
        travelers: updatedTravelers,
      });
    } catch (err: any) {
      console.error("Error removing traveler:", err);
      alert("Failed to remove traveler.");
    }
  };

  // Event reassignment and removal handlers
  const handleReassignEvent = async (eventId: string, newDateStr: string) => {
    if (!trip) return;
    try {
      const ev = events.find(e => e.id === eventId);
      if (!ev) return;
      const tz = ev.timezone || inferTimezone(trip.destination);
      
      const dateParts = DateTime.fromISO(newDateStr);
      const startOld = DateTime.fromISO(ev.startDateTime).setZone(tz);
      const endOld = DateTime.fromISO(ev.endDateTime).setZone(tz);
      const duration = endOld.diff(startOld);

      const startNew = startOld.set({
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day
      });
      const endNew = startNew.plus(duration);

      const eventDocRef = doc(db, `trips/${trip.id}/events`, eventId);
      await updateDoc(eventDocRef, {
        startDateTime: startNew.toISO(),
        endDateTime: endNew.toISO()
      });
    } catch (err) {
      console.error("Failed to reassign event date:", err);
      alert("Failed to reassign event date.");
    }
  };

  const handleRemoveEvent = async (eventId: string) => {
    if (!trip) return;
    if (!confirm("Are you sure you want to permanently delete this event?")) return;
    try {
      const eventDocRef = doc(db, `trips/${trip.id}/events`, eventId);
      await deleteDoc(eventDocRef);
    } catch (err) {
      console.error("Failed to delete event:", err);
      alert("Failed to delete event.");
    }
  };

  if (loading || !trip) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-500 font-medium font-sans">Syncing plans in real-time...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans h-screen overflow-hidden" id="trip-view-root">
      
      {/* Dynamic Header */}
      <header className="bg-white border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0" id="header">
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          <button 
            onClick={onBackToHub}
            className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-base sm:text-lg text-slate-900 truncate leading-snug max-w-[200px] sm:max-w-none">
                {trip.title}
              </h2>
              <div className="flex items-center gap-1 shrink-0">
                {userRole !== 'viewer' && (
                  <button 
                    onClick={() => setIsEditOpen(true)}
                    className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                    title="Trip Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                )}
                {trip.petFriendly && (
                  <div className="h-5 w-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Dog className="h-3 w-3" />
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1">📍 {trip.destination}</span>
              <span className="text-slate-300 hidden sm:inline">&bull;</span>
              <span>
                {trip.status === 'dreaming' || !trip.startDate || !trip.endDate ? (
                  <span className="text-purple-600 font-semibold bg-purple-50 px-1.5 py-0.5 rounded text-[10px]">
                    🔮 Dreaming (No dates set)
                  </span>
                ) : (
                  <span className="flex items-center gap-1">📅 {trip.startDate} to {trip.endDate}</span>
                )}
              </span>
              <span className="text-slate-300 hidden sm:inline">&bull;</span>
              <span className="font-mono text-[10px] text-indigo-500 bg-indigo-50/70 px-1.5 py-0.2 rounded uppercase font-bold tracking-wider">
                {userRole}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end sm:justify-start w-full sm:w-auto shrink-0">


          {/* Travelers Button */}
          <button 
            onClick={() => setIsTravelerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition shadow-sm"
            id="travelers-btn"
          >
            <Smile className="h-3.5 w-3.5 text-indigo-500" />
            <span>Travelers</span>
          </button>

          {/* Collaborator Sharing Button */}
          <button 
            onClick={() => setIsShareOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition shadow-sm"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Collaborators</span>
          </button>
        </div>
      </header>
      {orphanedEvents.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2 text-amber-800 text-xs">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" />
            <span>
              <b>Review needed:</b> You shrunk the trip dates, and <b>{orphanedEvents.length} event{orphanedEvents.length > 1 ? 's' : ''}</b> fall{orphanedEvents.length === 1 ? 's' : ''} outside your new dates ({trip.startDate} to {trip.endDate}).
            </span>
          </div>
          <button 
            onClick={() => setIsReviewOpen(true)}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            Review & Reassign
          </button>
        </div>
      )}

      {/* Main Split-Pane Layout */}
      <div className="flex-1 overflow-hidden relative flex flex-col" id="split-pane">
        
        {/* Desktop View Grid (Always persistent on screens md and larger) */}
        <div className="hidden md:grid grid-cols-12 h-full gap-4 p-5 overflow-hidden">
          {/* Scrollable Timeline */}
          <div className="col-span-5 h-full overflow-hidden">
            <ItineraryTimeline 
              trip={trip}
              selectedDayId={selectedDayId}
              days={days}
              onSelectDay={setSelectedDayId}
              userRole={userRole}
            />
          </div>

          {/* Interactive Map Pane */}
          <div className="col-span-4 h-full overflow-hidden">
            <LeafletMap 
              trip={trip}
              selectedDayId={selectedDayId}
              days={days}
            />
          </div>

          {/* Gemini AI Trip Copilot panel */}
          <div className="col-span-3 h-full overflow-hidden">
            <CopilotPanel 
              trip={trip}
              selectedDayId={selectedDayId}
              days={days}
              userRole={userRole}
            />
          </div>
        </div>

        {/* Mobile View with simplified Tab fallback for field check */}
        <div className="flex-1 md:hidden flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden p-4">
            {mobileTab === 'timeline' && (
              <ItineraryTimeline 
                trip={trip}
                selectedDayId={selectedDayId}
                days={days}
                onSelectDay={setSelectedDayId}
                userRole={userRole}
              />
            )}
            {mobileTab === 'map' && (
              <LeafletMap 
                trip={trip}
                selectedDayId={selectedDayId}
                days={days}
              />
            )}
            {mobileTab === 'copilot' && (
              <CopilotPanel 
                trip={trip}
                selectedDayId={selectedDayId}
                days={days}
                userRole={userRole}
              />
            )}
          </div>

          {/* Mobile Bottom Tab Navigator */}
          <div className="h-16 bg-white border-t border-slate-100 flex items-center justify-around px-4 shrink-0 shadow-lg">
            <button
              onClick={() => setMobileTab('timeline')}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${
                mobileTab === 'timeline' ? 'text-indigo-600 font-bold' : 'text-slate-400'
              }`}
            >
              <CalendarIcon className="h-4.5 w-4.5" />
              <span>Itinerary</span>
            </button>
            <button
              onClick={() => setMobileTab('map')}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${
                mobileTab === 'map' ? 'text-indigo-600 font-bold' : 'text-slate-400'
              }`}
            >
              <MapIcon className="h-4.5 w-4.5" />
              <span>Map View</span>
            </button>
            <button
              onClick={() => setMobileTab('copilot')}
              className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold ${
                mobileTab === 'copilot' ? 'text-indigo-600 font-bold' : 'text-slate-400'
              }`}
            >
              <Sparkles className="h-4.5 w-4.5" />
              <span>AI Copilot</span>
            </button>
          </div>
        </div>
      </div>

      {/* COLLABORATOR SHARING PANEL MODAL */}
      <AnimatePresence>
        {isReviewOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full border border-slate-100 p-6 shadow-xl flex flex-col gap-4 overflow-hidden"
              id="review-modal"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Review Excluded Events</h3>
                  <p className="text-xs text-slate-400">These events are preserved but currently sit outside your trip dates.</p>
                </div>
                <button 
                  onClick={() => setIsReviewOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition text-lg"
                >
                  &times;
                </button>
              </div>

              <div className="flex flex-col gap-3.5 max-h-[300px] overflow-y-auto pr-1">
                {orphanedEvents.map((ev) => {
                  const startLocal = DateTime.fromISO(ev.startDateTime).setZone(ev.timezone || inferTimezone(trip.destination));
                  const currentEventDate = startLocal.toFormat('yyyy-MM-dd');
                  const currentEventTime = startLocal.toFormat('HH:mm');
                  
                  return (
                    <div key={ev.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex flex-col gap-3" id={`orphaned-event-${ev.id}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-xs text-slate-850">{ev.title}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Original Date: <span className="font-mono text-slate-500">{currentEventDate}</span>{!ev.timeUnknown && ` at ${currentEventTime}`}
                          </div>
                          {ev.locationName && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              📍 {ev.locationName}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveEvent(ev.id)}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                          title="Delete Event"
                          id={`remove-orphaned-event-btn-${ev.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 border-t border-slate-100/60 pt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Move to:</span>
                        <input 
                          type="date"
                          min={trip.startDate}
                          max={trip.endDate}
                          defaultValue={trip.startDate}
                          id={`reassign-date-${ev.id}`}
                          className="px-2 py-1 border border-slate-200 rounded-md text-[11px] outline-none focus:border-indigo-500 bg-white"
                        />
                        <button
                          onClick={() => {
                            const inputEl = document.getElementById(`reassign-date-${ev.id}`) as HTMLInputElement;
                            if (inputEl) {
                              handleReassignEvent(ev.id, inputEl.value);
                            }
                          }}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[10px] font-bold transition ml-auto"
                          id={`confirm-reassign-btn-${ev.id}`}
                        >
                          Confirm Move
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end border-t border-slate-100 pt-3 mt-1">
                <button
                  onClick={() => setIsReviewOpen(false)}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition"
                  id="close-review-modal-btn"
                >
                  Done Reviewing
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* COLLABORATOR SHARING PANEL MODAL */}
      <AnimatePresence>
        {isShareOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full border border-slate-100 p-6 shadow-xl flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Trip Collaborators</h3>
                  <p className="text-xs text-slate-400">Share itinerary access with family and friends.</p>
                </div>
                <button 
                  onClick={() => setIsShareOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition text-lg"
                >
                  &times;
                </button>
              </div>

              {/* Collaborators allow-list Display */}
              <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Collaborators List</div>
                
                {/* All collaborators */}
                {Object.entries(trip.collaborators || {}).map(([email, role]) => (
                  <div key={email} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-700 truncate max-w-[200px]">{email}</span>
                      {role === 'owner' && <span className="text-[10px] text-slate-400">Creator</span>}
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded font-mono ${role === 'owner' ? 'bg-slate-200 text-slate-700' : 'bg-indigo-50 text-indigo-700'}`}>
                      {role}
                    </span>
                  </div>
                ))}
              </div>

              {/* Invite Form */}
              {userRole !== 'viewer' ? (
                <form onSubmit={handleInviteCollaborator} className="flex flex-col gap-3.5 border-t border-slate-100 pt-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Collaborator Email / UID</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. friend@gmail.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Access Privilege Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as CollaboratorRole)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 bg-white transition"
                    >
                      <option value="editor">Editor (Can edit timeline and use AI)</option>
                      <option value="viewer">Viewer (Read-only timeline view)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-100 font-sans"
                  >
                    Add Collaborator
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-400 mt-2">
                  <ShieldAlert className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                  <span>Viewers are not permitted to invite other collaborators.</span>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TRIP TRAVELERS PANEL MODAL */}
      <AnimatePresence>
        {isTravelerOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full border border-slate-100 p-6 shadow-xl flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Trip Travelers</h3>
                  <p className="text-xs text-slate-400">Manage who is physically traveling on this trip.</p>
                </div>
                <button 
                  onClick={() => setIsTravelerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition text-lg"
                >
                  &times;
                </button>
              </div>

              {/* Travelers list display */}
              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider font-bold">Travelers List</div>
                
                {(!trip.travelers || trip.travelers.length === 0) ? (
                  <div className="text-center py-6 text-xs text-slate-400 italic">
                    No travelers specified yet. Add travelers below to split itineraries.
                  </div>
                ) : (
                  trip.travelers.map((traveler) => {
                    const initials = traveler.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase()
                      .slice(0, 2);
                    return (
                      <div key={traveler.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-7 w-7 rounded-full ${traveler.color || 'bg-slate-500'} text-[10px] font-bold text-white flex items-center justify-center`}>
                            {initials}
                          </span>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-700">{traveler.name}</span>
                            {traveler.email && (
                              <span className="text-[10px] text-slate-400 font-mono">Linked: {traveler.email}</span>
                            )}
                          </div>
                        </div>
                        {userRole !== 'viewer' && (
                          <button
                            onClick={() => handleRemoveTraveler(traveler.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="Remove Traveler"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Traveler Form */}
              {userRole !== 'viewer' ? (
                <form onSubmit={handleAddTraveler} className="flex flex-col gap-3.5 border-t border-slate-100 pt-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Traveler's Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. John Doe, Emma (Kid)"
                      value={travelerName}
                      onChange={(e) => setTravelerName(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  {/* Avatar Color Picker */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avatar Color Accent</label>
                    <div className="flex flex-wrap gap-1.5">
                      {TRAVELER_COLORS.map((col) => (
                        <button
                          type="button"
                          key={col.class}
                          onClick={() => setTravelerColor(col.class)}
                          className={`h-5 w-5 rounded-full ${col.class} transition flex items-center justify-center ${
                            travelerColor === col.class ? 'ring-2 ring-indigo-500 ring-offset-1 scale-110 shadow-sm' : 'hover:scale-105'
                          }`}
                          title={col.name}
                        >
                          {travelerColor === col.class && <Check className="h-3 w-3 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Optional Linked Collaborator Email */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Linked Collaborator (Optional)</label>
                    <select
                      value={travelerEmail}
                      onChange={(e) => setTravelerEmail(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 bg-white transition"
                    >
                      <option value="">-- Unlinked / No account (e.g. kids) --</option>
                      {Array.from(new Set([...(user.email ? [user.email] : []), ...Object.keys(trip.collaborators || {})])).map((email) => (
                        <option key={email} value={email}>
                          {email}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5 font-sans"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Traveler</span>
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-400 mt-2">
                  <ShieldAlert className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                  <span>Viewers are not permitted to manage travelers.</span>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT TRIP DETAILS MODAL */}
      <AnimatePresence>
        {isEditOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-lg w-full border border-slate-100 p-6 shadow-xl flex flex-col gap-4 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Edit Trip Settings</h3>
                  <p className="text-xs text-slate-400">Update dates, destination, type, and manual status override.</p>
                </div>
                <button 
                  onClick={() => setIsEditOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition text-lg"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="flex flex-col gap-4 overflow-y-auto max-h-[80vh] pr-1">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trip Title</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Europe 2026 Adventure"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Destination</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Rome, Italy"
                    value={editDestination}
                    onChange={(e) => setEditDestination(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Date (Optional)</label>
                    <input 
                      type="date" 
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Date (Optional)</label>
                    <input 
                      type="date" 
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trip Type</label>
                    <select
                      value={editTripType}
                      onChange={(e) => setEditTripType(e.target.value as TripType)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 bg-white transition"
                    >
                      <option value="mixed">Mixed Travel</option>
                      <option value="road-trip">🚗 Road Trip</option>
                      <option value="flights">✈️ Flights Only</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trip Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => {
                        setEditStatus(e.target.value as TripStatus);
                        setEditStatusOverride(true); // Manually set status acts as override
                      }}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 bg-white transition"
                    >
                      <option value="dreaming">🔮 Dreaming (No dates)</option>
                      <option value="planning">📋 Planning</option>
                      <option value="booking">🎟️ Booking</option>
                      <option value="upcoming">📅 Upcoming</option>
                      <option value="active">🟢 Active</option>
                      <option value="completed">🔘 Completed</option>
                      <option value="archived">📁 Archived</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-1">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700">Pet Friendly Trip?</span>
                      <span className="text-[10px] text-slate-400">Shows dog-friendly tags on stops.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={editPetFriendly}
                      onChange={(e) => setEditPetFriendly(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700">Manual Status Lock?</span>
                      <span className="text-[10px] text-slate-400">Lock status; ignore automatic progress.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={editStatusOverride}
                      onChange={(e) => setEditStatusOverride(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Accent Theme Color</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { class: 'bg-blue-50 border-blue-100 text-blue-700', label: 'Classic Blue' },
                      { class: 'bg-purple-50 border-purple-100 text-purple-700', label: 'Royal Violet' },
                      { class: 'bg-emerald-50 border-emerald-100 text-emerald-700', label: 'Forest Green' },
                      { class: 'bg-rose-50 border-rose-100 text-rose-700', label: 'Sunset Crimson' }
                    ].map((theme) => (
                      <button
                        key={theme.label}
                        type="button"
                        onClick={() => setEditCoverColor(theme.class)}
                        className={`p-2 rounded-xl border text-[10px] font-semibold transition text-center ${theme.class} ${
                          editCoverColor === theme.class ? 'ring-2 ring-indigo-500 font-bold border-transparent' : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TRAVELERS MANAGEMENT INSIDE SETTINGS */}
                <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3 mt-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Travelers list</label>
                  
                  {/* Current Travelers Display */}
                  <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                    {(!trip.travelers || trip.travelers.length === 0) ? (
                      <div className="text-center py-4 text-[11px] text-slate-400 italic">
                        No travelers specified yet. Add travelers below.
                      </div>
                    ) : (
                      trip.travelers.map((traveler) => {
                        const initials = traveler.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2);
                        return (
                          <div key={traveler.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`h-6 w-6 rounded-full ${traveler.color || 'bg-slate-500'} text-[9px] font-bold text-white flex items-center justify-center`}>
                                {initials}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-700">{traveler.name}</span>
                                {traveler.email && (
                                  <span className="text-[9px] text-slate-400 font-mono">Linked: {traveler.email}</span>
                                )}
                              </div>
                            </div>
                            {userRole !== 'viewer' && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTraveler(traveler.id)}
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                                title="Remove Traveler"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Traveler Subsection */}
                  {userRole !== 'viewer' && (
                    <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/60 flex flex-col gap-2.5">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Add New Traveler</span>
                      
                      <div className="flex flex-col gap-1">
                        <input 
                          type="text" 
                          placeholder="Traveler name (e.g. John Doe)"
                          value={travelerName}
                          onChange={(e) => setTravelerName(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 bg-white"
                        />
                      </div>

                      {/* Avatar Color Picker */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Avatar Color</span>
                        <div className="flex flex-wrap gap-1">
                          {TRAVELER_COLORS.map((col) => (
                            <button
                              type="button"
                              key={col.class}
                              onClick={() => setTravelerColor(col.class)}
                              className={`h-4.5 w-4.5 rounded-full ${col.class} transition flex items-center justify-center ${
                                travelerColor === col.class ? 'ring-2 ring-indigo-500 scale-110 shadow-sm' : 'hover:scale-105'
                              }`}
                              title={col.name}
                            >
                              {travelerColor === col.class && <Check className="h-2.5 w-2.5 text-white" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Optional Linked Collaborator Email */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Linked Collaborator (Optional)</span>
                        <select
                          value={travelerEmail}
                          onChange={(e) => setTravelerEmail(e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-500 bg-white transition"
                        >
                          <option value="">-- Unlinked / No account (e.g. kids) --</option>
                          {Array.from(new Set([...(user.email ? [user.email] : []), ...Object.keys(trip.collaborators || {})])).map((email) => (
                            <option key={email} value={email}>
                              {email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleAddTraveler(e)}
                        className="py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition flex items-center justify-center gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add to List</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-3.5 border-t border-slate-100 pt-4 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditOpen(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-md shadow-indigo-100"
                  >
                    Save Changes
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

