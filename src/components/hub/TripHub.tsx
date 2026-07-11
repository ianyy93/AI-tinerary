/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, query, where, or, onSnapshot, addDoc, doc, updateDoc, writeBatch, getDocs, deleteDoc } from 'firebase/firestore';
import { Trip, TripType, TripStatus, UserSession } from '../../types';
import { 
  Plus, Search, Copy, Archive, Trash2, Users, Calendar, MapPin, 
  Dog, Shield, Globe, Compass, ArrowRight, Clock, Sparkles, Filter 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DateTime } from 'luxon';
import { inferTimezone } from '../../utils/timezone';
import { AnchorExtractionFlow } from './AnchorExtractionFlow';

interface TripHubProps {
  user: UserSession;
  onSelectTrip: (tripId: string) => void;
  onLogout: () => void;
}

const COVER_COLORS = [
  { name: 'Sapphire', class: 'bg-blue-50 border-blue-100 text-blue-700 hover:bg-blue-100/50' },
  { name: 'Emerald', class: 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/50' },
  { name: 'Amber', class: 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100/50' },
  { name: 'Orange', class: 'bg-orange-50 border-orange-100 text-orange-700 hover:bg-orange-100/50' },
  { name: 'Violet', class: 'bg-purple-50 border-purple-100 text-purple-700 hover:bg-purple-100/50' },
  { name: 'Slate', class: 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100/50' },
];

export default function TripHub({ user, onSelectTrip, onLogout }: TripHubProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<TripStatus | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [globalEventsSearch, setGlobalEventsSearch] = useState<any[]>([]);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newDestination, setNewDestination] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTripType, setNewTripType] = useState<TripType>('mixed');
  const [newCoverColor, setNewCoverColor] = useState('bg-blue-50 border-blue-100 text-blue-700');
  const [newPetFriendly, setNewPetFriendly] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Creation Flow Path State: 'fork' | 'anchor' | 'brainstorm' | null
  const [creationPath, setCreationPath] = useState<'fork' | 'anchor' | 'brainstorm' | null>(null);
  
  // Anchor-first states
  const [anchorText, setAnchorText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  // Confirmed extracted fields states
  const [confirmedTitle, setConfirmedTitle] = useState('');
  const [confirmedDestination, setConfirmedDestination] = useState('');
  const [confirmedStartDate, setConfirmedStartDate] = useState('');
  const [confirmedEndDate, setConfirmedEndDate] = useState('');
  const [confirmedTripType, setConfirmedTripType] = useState<TripType>('mixed');
  const [confirmedCoverColor, setConfirmedCoverColor] = useState('bg-blue-50 border-blue-100 text-blue-700');
  const [confirmedPetFriendly, setConfirmedPetFriendly] = useState(false);

  // Extracted first event states
                  
  // 1. Fetch trips for which user is a collaborator
  useEffect(() => {
    if (!user.uid) return;

    const tripsRef = collection(db, 'trips');
    const userEmail = (user.email || '').toLowerCase();

    // Fetch only the trips for which user has access (owner, collaborator UID, or collaborator email)
    const q = userEmail ? query(
      tripsRef,
      or(
        where('userId', '==', user.uid),
        where('collaboratorUids', 'array-contains', user.uid),
        where('collaboratorEmails', 'array-contains', userEmail)
      )
    ) : query(
      tripsRef,
      or(
        where('userId', '==', user.uid),
        where('collaboratorUids', 'array-contains', user.uid)
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsList: Trip[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const collaborators = data.collaborators || {};
        const collaboratorEmails = data.collaboratorEmails || [];
        const collaboratorUids = data.collaboratorUids || [];
        const userIdentifier = user.email || user.uid || '';

        if (
          data.userId === user.uid ||
          collaborators[userIdentifier] ||
          collaborators[user.uid] ||
          collaboratorEmails.includes(userEmail) ||
          collaboratorUids.includes(user.uid)
        ) {
          tripsList.push({
            id: doc.id,
            ...data,
          } as Trip);
        }
      });
      // Sort by start date (descending), putting empty dates (dreaming) at the end, and sorting those by createdAt desc
      tripsList.sort((a, b) => {
        if (!a.startDate && !b.startDate) {
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      });

      setTrips(tripsList);
      setLoading(false);

      // Automatic status progression on load of the trip hub list
      const runAutoStatusProgression = async () => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        for (const trip of tripsList) {
          if (trip.status === 'archived' || trip.statusOverride) continue;

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
            try {
              const tripRef = doc(db, 'trips', trip.id);
              await updateDoc(tripRef, { status: targetStatus });
            } catch (err) {
              console.error("Failed to auto-progress status in Hub load:", err);
            }
          }
        }
      };

      runAutoStatusProgression();
    }, (err) => {
      console.error("Error fetching trips:", err);
      handleFirestoreError(err, OperationType.LIST, 'trips');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Global search across all trips and their events (stays, activities, notes)
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setGlobalEventsSearch([]);
      return;
    }

    const searchLower = searchQuery.toLowerCase();
    const matches: any[] = [];

    const fetchAndSearchEvents = async () => {
      for (const trip of trips) {
        try {
          const eventsRef = collection(db, `trips/${trip.id}/events`);
          const eventsSnap = await getDocs(eventsRef);
          
          eventsSnap.forEach((eventDoc) => {
            const event = eventDoc.data();
            const eventTitle = (event.title || '').toLowerCase();
            const notes = (event.notes || '').toLowerCase();
            const locationName = (event.locationName || '').toLowerCase();
            const address = (event.address || '').toLowerCase();
            const resNum = (event.reservationNumber || '').toLowerCase();

            if (
              eventTitle.includes(searchLower) ||
              notes.includes(searchLower) ||
              locationName.includes(searchLower) ||
              address.includes(searchLower) ||
              resNum.includes(searchLower)
            ) {
              const startLocal = DateTime.fromISO(event.startDateTime).setZone(event.timezone || inferTimezone(trip.destination));
              const dayStr = startLocal.isValid ? startLocal.toFormat('MMM dd') : 'Event';

              matches.push({
                tripId: trip.id,
                tripTitle: trip.title,
                event: { id: eventDoc.id, ...event },
                dayTitle: dayStr,
              });
            }
          });
        } catch (e) {
          console.error("Error searching trip events:", e);
        }
      }
      setGlobalEventsSearch(matches);
    };

    const timer = setTimeout(() => {
      fetchAndSearchEvents();
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, trips]);

  // 3. Create Trip handlers

  // Standard creation handler
  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDestination.trim() || !newStartDate || !newEndDate) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }

    if (new Date(newStartDate) > new Date(newEndDate)) {
      setErrorMsg('Start date cannot be after end date.');
      return;
    }

    try {
      setErrorMsg('');
      const userIdentifier = user.email || user.uid;
      const userEmail = (user.email || '').toLowerCase();
      const tripData = {
        title: newTitle,
        destination: newDestination,
        tripType: newTripType,
        startDate: newStartDate,
        endDate: newEndDate,
        coverColor: newCoverColor,
        petFriendly: newPetFriendly,
        status: 'planning', // Automatically starts as planning
        userId: user.uid,
        collaborators: {
          [userIdentifier]: 'owner'
        },
        collaboratorEmails: userEmail ? [userEmail] : [],
        collaboratorUids: [user.uid],
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, 'trips'), tripData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'trips');
        throw err;
      }

      setIsCreateOpen(false);
      setCreationPath(null);
      // Reset form
      setNewTitle('');
      setNewDestination('');
      setNewStartDate('');
      setNewEndDate('');
      setNewTripType('mixed');
      setNewPetFriendly(false);
      onSelectTrip(docRef.id);
    } catch (e: any) {
      console.error("Error creating trip:", e);
      setErrorMsg(e.message || 'Error creating trip');
    }
  };
  const handleCreateBrainstormTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDestination.trim()) {
      setErrorMsg("Destination is required for brainstorming ideas.");
      return;
    }

    try {
      setErrorMsg('');
      const userIdentifier = user.email || user.uid;
      const userEmail = (user.email || '').toLowerCase();
      
      const tripData = {
        title: newTitle.trim() || `Dreaming of ${newDestination}`,
        destination: newDestination,
        tripType: newTripType,
        startDate: '',
        endDate: '',
        coverColor: newCoverColor,
        petFriendly: newPetFriendly,
        status: 'dreaming',
        userId: user.uid,
        collaborators: {
          [userIdentifier]: 'owner'
        },
        collaboratorEmails: userEmail ? [userEmail] : [],
        collaboratorUids: [user.uid],
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, 'trips'), tripData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'trips');
        throw err;
      }

      setIsCreateOpen(false);
      setCreationPath(null);
      // Reset form
      setNewTitle('');
      setNewDestination('');
      setNewTripType('mixed');
      setNewPetFriendly(false);
      onSelectTrip(docRef.id);
    } catch (e: any) {
      console.error("Error creating brainstorming trip:", e);
      setErrorMsg(e.message || 'Error creating brainstorming trip');
    }
  };

  // 4. Duplicate Trip handler
  const handleDuplicateTrip = async (trip: Trip, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const userIdentifier = user.email || user.uid;
      const userEmail = (user.email || '').toLowerCase();
      const duplicateData = {
        title: `Copy of ${trip.title}`,
        destination: trip.destination,
        tripType: trip.tripType,
        startDate: trip.startDate,
        endDate: trip.endDate,
        coverColor: trip.coverColor,
        petFriendly: trip.petFriendly,
        status: 'draft',
        userId: user.uid,
        collaborators: {
          [userIdentifier]: 'owner'
        },
        collaboratorEmails: userEmail ? [userEmail] : [],
        collaboratorUids: [user.uid],
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, 'trips'), duplicateData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'trips');
        throw err;
      }

    } catch (e: any) {
      console.error("Error duplicating trip:", e);
    }
  };

  // 5. Archive Trip handler
  const handleArchiveTrip = async (trip: Trip, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const tripRef = doc(db, 'trips', trip.id);
      await updateDoc(tripRef, {
        status: trip.status === 'archived' ? 'draft' : 'archived'
      });
    } catch (e: any) {
      console.error("Error archiving trip:", e);
      handleFirestoreError(e, OperationType.UPDATE, `trips/${trip.id}`);
    }
  };

  // 6. Delete Trip handler
  const handleDeleteTrip = async (tripId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this trip and all its plans permanently?")) return;
    try {
      await deleteDoc(doc(db, 'trips', tripId));
    } catch (e: any) {
      console.error("Error deleting trip:", e);
      handleFirestoreError(e, OperationType.DELETE, `trips/${tripId}`);
    }
  };

  const getStatusBadgeClass = (status: TripStatus) => {
    switch (status) {
      case 'dreaming':
        return 'bg-indigo-50 border-indigo-100 text-indigo-700';
      case 'planning':
        return 'bg-amber-50 border-amber-100 text-amber-700';
      case 'booking':
        return 'bg-purple-50 border-purple-100 text-purple-700';
      case 'upcoming':
        return 'bg-blue-50 border-blue-100 text-blue-700';
      case 'active':
        return 'bg-emerald-50 border-emerald-100 text-emerald-700';
      case 'completed':
        return 'bg-slate-50 border-slate-200 text-slate-700';
      case 'archived':
        return 'bg-rose-50 border-rose-100 text-rose-700';
      default:
        return 'bg-slate-50 border-slate-100 text-slate-600';
    }
  };

  const filteredTrips = trips.filter(trip => {
    const matchesSearch = trip.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          trip.destination.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeFilter === 'all') {
      // Exclude archived and dreaming from main active grid
      return matchesSearch && trip.status !== 'archived' && trip.status !== 'dreaming';
    }
    return matchesSearch && trip.status === activeFilter;
  });

  const dreamingTrips = trips.filter(trip => {
    const matchesSearch = trip.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          trip.destination.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && trip.status === 'dreaming';
  });

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 flex flex-col font-sans" id="triphub-root">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between" id="header">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-100">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">AI-tinerary</h1>
            <p className="text-xs text-slate-500 font-medium">Your Travel Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-mono border border-slate-200">
            <Shield className="h-3.5 w-3.5 text-indigo-500" />
            <span className="truncate max-w-[150px]">{user.email || 'Anonymous Traveler'}</span>
          </div>
          <button 
            onClick={onLogout}
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 sm:p-8 flex flex-col gap-8">
        
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-2xl text-slate-900 tracking-tight">
              Welcome back, {user.displayName || 'Traveler'}!
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Organize your next grand adventure or select an upcoming itinerary below.
            </p>
          </div>

          <button
            onClick={() => {
              setIsCreateOpen(true);
              setCreationPath('fork');
              setErrorMsg('');
            }}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-indigo-100 active-pulse"
          >
            <Plus className="h-4 w-4" />
            Create New Trip
          </button>
        </div>

        {/* Global Search and Filter Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white border border-slate-100 p-4 rounded-2xl shadow-sm">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Search destination, hotels, flights, stays..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm transition outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mr-2">
              <Filter className="h-3.5 w-3.5" />
              <span>Filters</span>
            </div>
            {[
              { id: 'all', label: 'All Active' },
              { id: 'dreaming', label: 'Someday/Dreaming' },
              { id: 'planning', label: 'Planning' },
              { id: 'booking', label: 'Booking' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'active', label: 'Active' },
              { id: 'completed', label: 'Completed' },
              { id: 'archived', label: 'Archived' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeFilter === tab.id 
                    ? 'bg-slate-900 text-white' 
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global Deep Search Results */}
        {globalEventsSearch.length > 0 && (
          <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-indigo-800 font-display font-semibold text-sm">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span>Deep-Search Results in Itinerary items ({globalEventsSearch.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {globalEventsSearch.map(({ tripId, tripTitle, event, dayTitle }) => (
                <div 
                  key={event.id}
                  onClick={() => onSelectTrip(tripId)}
                  className="bg-white border border-indigo-100 p-3 rounded-xl hover:border-indigo-300 transition cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <div className="text-xs text-slate-400 font-semibold">{tripTitle} &bull; {dayTitle}</div>
                    <div className="text-sm font-bold text-slate-800 mt-0.5">{event.title}</div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span>{event.locationName}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-indigo-400" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trips Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Syncing trips from Cloud...</p>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto shadow-sm">
            <Globe className="h-12 w-12 text-slate-300 mb-4 animate-bounce" />
            <h3 className="font-display font-bold text-lg text-slate-900">No Trips Found</h3>
            <p className="text-sm text-slate-500 mt-2 max-w-xs">
              {searchQuery ? "We couldn't find any trips matching your search query." : "Let's plan your first destination! Build a tailored day-by-day plan with our Gemini travel Copilot."}
            </p>
            {!searchQuery && (
              <button
                onClick={() => {
                  setIsCreateOpen(true);
                  setCreationPath('fork');
                  setErrorMsg('');
                }}
                className="mt-6 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
              >
                Create Your First Trip
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTrips.map((trip) => {
                const coverColor = COVER_COLORS.find(c => c.name === trip.coverColor) || COVER_COLORS[0];
                const isOwner = trip.userId === user.uid;

                return (
                  <div 
                    key={trip.id}
                    onClick={() => onSelectTrip(trip.id)}
                    className="group relative overflow-hidden bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between h-[230px]"
                  >
                    {/* Highlight Ribbon */}
                    <div className={`absolute top-0 left-0 w-full h-1.5 ${coverColor.class.split(' ')[0]}`} />

                    {/* Header */}
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeClass(trip.status)}`}>
                            {trip.status}
                          </span>
                        </div>

                        {/* Cover Color indicator */}
                        <div className="flex items-center gap-1">
                          {trip.petFriendly && (
                            <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center" title="Dog Friendly Trip">
                              <Dog className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">v{trip.schemaVersion}</span>
                        </div>
                      </div>

                      <h3 className="font-display font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition mt-3 tracking-tight leading-snug">
                        {trip.title}
                      </h3>

                      <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate font-medium">{trip.destination}</span>
                      </div>
                    </div>

                    {/* Footer Stats & Actions */}
                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        {trip.startDate ? (
                          <span>{trip.startDate} &mdash; {trip.endDate}</span>
                        ) : (
                          <span className="italic text-indigo-500 font-semibold">TBD (Someday)</span>
                        )}
                      </div>

                      {/* Actions panel */}
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                        <button
                          title="Duplicate Trip"
                          onClick={(e) => handleDuplicateTrip(trip, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          title={trip.status === 'archived' ? "Unarchive Trip" : "Archive Trip"}
                          onClick={(e) => handleArchiveTrip(trip, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                        {isOwner && (
                          <button
                            title="Delete Trip"
                            onClick={(e) => handleDeleteTrip(trip.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Someday Shelf section */}
            {activeFilter === 'all' && dreamingTrips.length > 0 && (
              <div className="mt-6 pt-8 border-t border-slate-100" id="someday-shelf">
                <div className="flex items-center gap-2 mb-6">
                  <Compass className="h-5 w-5 text-indigo-500" />
                  <div>
                    <h2 className="font-display font-bold text-lg text-slate-900">Someday Shelf</h2>
                    <p className="text-xs text-slate-500">Open-ended trip ideas and brainstorms without fixed dates.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dreamingTrips.map((trip) => {
                    const coverColor = COVER_COLORS.find(c => c.name === trip.coverColor) || COVER_COLORS[0];
                    const isOwner = trip.userId === user.uid;

                    return (
                      <div 
                        key={trip.id}
                        onClick={() => onSelectTrip(trip.id)}
                        className="group relative overflow-hidden bg-slate-50 border border-slate-100 hover:border-indigo-100 hover:bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition cursor-pointer flex flex-col justify-between h-[230px]"
                      >
                        {/* Highlight Ribbon */}
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-200" />

                        {/* Header */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getStatusBadgeClass(trip.status)}`}>
                                {trip.status}
                              </span>
                            </div>

                            {/* Cover Color indicator */}
                            <div className="flex items-center gap-1">
                              {trip.petFriendly && (
                                <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center" title="Dog Friendly Trip">
                                  <Dog className="h-3.5 w-3.5" />
                                </div>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">v{trip.schemaVersion}</span>
                            </div>
                          </div>

                          <h3 className="font-display font-bold text-lg text-slate-900 group-hover:text-indigo-600 transition mt-3 tracking-tight leading-snug">
                            {trip.title}
                          </h3>

                          <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate font-medium">{trip.destination}</span>
                          </div>
                        </div>

                        {/* Footer Stats & Actions */}
                        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span className="italic text-indigo-500 font-semibold">TBD (Someday)</span>
                          </div>

                          {/* Actions panel */}
                          <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition">
                            <button
                              title="Duplicate Trip"
                              onClick={(e) => handleDuplicateTrip(trip, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              title={trip.status === 'archived' ? "Unarchive Trip" : "Archive Trip"}
                              onClick={(e) => handleArchiveTrip(trip, e)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                            {isOwner && (
                              <button
                                title="Delete Trip"
                                onClick={(e) => handleDeleteTrip(trip.id, e)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE NEW TRIP MODAL */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`bg-white rounded-2xl w-full border border-slate-100 p-6 shadow-xl flex flex-col gap-4 overflow-hidden transition-all duration-300 ${
                creationPath === 'anchor' && extractedData ? 'max-w-xl max-h-[90vh]' : 'max-w-md'
              }`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900">
                    {creationPath === 'fork' && 'Plan a New Journey'}
                    {creationPath === 'anchor' && 'Booked / Fixed Anchor Path'}
                    {creationPath === 'brainstorm' && 'Dreaming & Brainstorm Path'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {creationPath === 'fork' && 'Choose your starting approach.'}
                    {creationPath === 'anchor' && (extractedData ? 'Confirm and edit extracted details.' : 'Paste booking confirmations or details.')}
                    {creationPath === 'brainstorm' && 'Log an open-ended travel idea without dates.'}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setIsCreateOpen(false);
                    setCreationPath(null);
                    setExtractedData(null);
                    setAnchorText('');
                  }}
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

              {/* PATH 1: FORK / PATH SELECTION */}
              {creationPath === 'fork' && (
                <div className="flex flex-col gap-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreationPath('anchor');
                      setErrorMsg('');
                    }}
                    className="flex items-start gap-4 p-4 border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/20 rounded-2xl text-left transition group"
                  >
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 group-hover:bg-indigo-100 transition">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-display font-semibold text-sm text-slate-900 group-hover:text-indigo-600 transition">I already have something booked or fixed</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Paste a flight, hotel confirmation, wedding invitation, or write details like "sister's wedding is Sep 15th in Denver". AI will extract dates, location, and seed your first anchor event.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCreationPath('brainstorm');
                      setErrorMsg('');
                    }}
                    className="flex items-start gap-4 p-4 border border-slate-100 hover:border-emerald-100 hover:bg-emerald-50/20 rounded-2xl text-left transition group"
                  >
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 group-hover:bg-emerald-100 transition">
                      <Compass className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-display font-semibold text-sm text-slate-900 group-hover:text-emerald-600 transition">Just an idea (Brainstorming)</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        No fixed dates or bookings yet? Just enter a destination or general concept. The trip will live on your "Someday Shelf" until you decide when to go.
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {/* PATH 2: ANCHOR-FIRST FLOW */}
              {creationPath === 'anchor' && (
                <div className="flex flex-col gap-4 overflow-hidden">
                  <AnchorExtractionFlow
                    onConfirm={async (events) => {
                      if (events.length === 0) return;
                      const sortedDates = events.map(e => new Date(e.date).getTime()).sort((a,b) => a-b);
                      const calculatedStart = new Date(sortedDates[0]).toISOString().split('T')[0];
                      const calculatedEnd = new Date(sortedDates[sortedDates.length - 1]).toISOString().split('T')[0];

                      try {
                        const tripRef = await addDoc(collection(db, 'trips'), {
                          title: events[0].title + ' Trip',
                          destination: events[0].locationName || 'Unknown Destination',
                          startDate: calculatedStart,
                          endDate: calculatedEnd,
                          tripType: 'mixed',
                          coverColor: 'bg-blue-50 border-blue-100 text-blue-700',
                          petFriendly: false,
                          createdAt: new Date().toISOString(),
                          updatedAt: new Date().toISOString(),
                          roles: { [user.uid]: 'owner' }
                        });

                        for (const ev of events) {
                          const startDateTime = `${ev.date}T${ev.startTime}`;
                          const endDateTime = `${ev.date}T${ev.endTime}`;
                          await addDoc(collection(db, `trips/${tripRef.id}/events`), {
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
                            timezone: ev.timezone || 'UTC',
                            coordinates: ev.lat && ev.lng ? { lat: ev.lat, lng: ev.lng } : null
                          });
                        }

                        onSelectTrip(tripRef.id);
                        setIsCreateOpen(false);
                        setCreationPath(null);
                      } catch (err: any) {
                        console.error("Error saving trip with anchor events:", err);
                        setErrorMsg("Failed to save trip. Please try again.");
                      }
                    }}
                    onCancel={() => setCreationPath('fork')}
                  />
                </div>
              )}

              {/* PATH 3: BRAINSTORM-FIRST FLOW */}
              {creationPath === 'brainstorm' && (
                <form onSubmit={handleCreateBrainstormTrip} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Destination *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Kyoto, Japan or Amalfi Coast"
                      value={newDestination}
                      onChange={(e) => setNewDestination(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">General Concept / Title (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Summer food tour with friends"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trip Type</label>
                      <select
                        value={newTripType}
                        onChange={(e) => setNewTripType(e.target.value as TripType)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition"
                      >
                        <option value="mixed">Mixed Travel</option>
                        <option value="road-trip">Road Trip</option>
                        <option value="flights">Flights Only</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 pt-5">
                      <input 
                        type="checkbox"
                        id="newPetFriendly"
                        checked={newPetFriendly}
                        onChange={(e) => setNewPetFriendly(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="newPetFriendly" className="text-xs font-semibold text-slate-600 cursor-pointer flex items-center gap-1 select-none">
                        <Dog className="h-3.5 w-3.5 text-emerald-600" />
                        Pet Friendly
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Accent Theme Color</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      {COVER_COLORS.map(color => (
                        <button
                          type="button"
                          key={color.name}
                          onClick={() => setNewCoverColor(color.name)}
                          className={`h-7 px-3 rounded-lg text-xs font-medium border transition ${
                            newCoverColor === color.name 
                              ? 'ring-2 ring-indigo-500 border-indigo-500 font-bold' 
                              : 'border-slate-200 text-slate-600'
                          }`}
                          style={{ backgroundColor: color.name === 'Sapphire' ? '#f0f9ff' : color.name === 'Emerald' ? '#ecfdf5' : color.name === 'Amber' ? '#fffbeb' : color.name === 'Orange' ? '#fff7ed' : color.name === 'Violet' ? '#faf5ff' : '#f8fafc' }}
                        >
                          {color.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setCreationPath('fork')}
                      className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 transition"
                    >
                      Save to Someday Shelf
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
