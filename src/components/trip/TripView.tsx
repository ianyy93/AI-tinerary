/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { doc, onSnapshot, updateDoc, collection, query, getDocs, addDoc } from 'firebase/firestore';
import { Trip, Day, UserSession, CollaboratorRole, TripType, TripStatus } from '../../types';
import ItineraryTimeline from '../timeline/ItineraryTimeline';
import LeafletMap from '../map/LeafletMap';
import CopilotPanel from '../copilot/CopilotPanel';
import { 
  ArrowLeft, Users, Calendar, MapPin, Share2, Plus, Check, Settings, 
  Map as MapIcon, Calendar as CalendarIcon, Sparkles, Dog, ShieldAlert 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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

      // If dates were added or modified, check if we need to initialize day documents
      if (datesAddedOrChanged && editStartDate && editEndDate) {
        const daysRef = collection(db, `trips/${trip.id}/days`);
        const daysSnap = await getDocs(daysRef);
        
        if (daysSnap.empty) {
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
        setTrip({ id: snapshot.id, ...snapshot.data() } as Trip);
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

      if (items.length > 0 && !selectedDayId) {
        setSelectedDayId(items[0].id);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error listening to days:", err);
      handleFirestoreError(err, OperationType.LIST, `trips/${tripId}/days`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tripId, selectedDayId]);

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
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0" id="header">
        <div className="flex items-center gap-3 min-w-0">
          <button 
            onClick={onBackToHub}
            className="p-2 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-slate-900 truncate leading-snug">
                {trip.title}
              </h2>
              {trip.petFriendly && (
                <div className="h-5 w-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Dog className="h-3 w-3" />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>📍 {trip.destination}</span>
              <span>&bull;</span>
              <span>
                {trip.status === 'dreaming' || !trip.startDate || !trip.endDate ? (
                  <span className="text-purple-600 font-semibold bg-purple-50 px-1.5 py-0.5 rounded">
                    🔮 Dreaming (No dates set)
                  </span>
                ) : (
                  `📅 ${trip.startDate} to ${trip.endDate}`
                )}
              </span>
              <span>&bull;</span>
              <span className="font-mono text-[10px] text-indigo-500 bg-indigo-50/70 px-1.5 py-0.2 rounded uppercase font-bold">
                {userRole}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit Trip Settings Button */}
          {userRole !== 'viewer' && (
            <button 
              onClick={() => setIsEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition shadow-sm"
              id="edit-trip-btn"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit Trip</span>
            </button>
          )}

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
                userRole="viewer" // Forces read-only single column fallback on mobile!
              />
            )}
            {mobileTab === 'map' && (
              <LeafletMap 
                trip={trip}
                selectedDayId={selectedDayId}
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
        {isShareOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
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
                
                {/* Creator / Owner info */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-700 truncate max-w-[200px]">{user.email || 'Anonymous'}</span>
                    <span className="text-[10px] text-slate-400">Creator</span>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[9px] font-bold uppercase rounded font-mono">
                    Owner
                  </span>
                </div>

                {/* Additional collaborators */}
                {Object.entries(trip.collaborators || {}).map(([email, role]) => (
                  <div key={email} className="flex items-center justify-between bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs">
                    <span className="font-bold text-slate-700 truncate max-w-[200px]">{email}</span>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-bold uppercase rounded font-mono">
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
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-100"
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

      {/* EDIT TRIP DETAILS MODAL */}
      <AnimatePresence>
        {isEditOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
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
