/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { Trip, ItineraryEvent, Day } from '../../types';
import { 
  Trash2, Sparkles, ShieldCheck, Check, RotateCcw, AlertTriangle, HelpCircle, 
  Dog, ChevronRight, Play, Info, CheckCircle2, ThumbsUp, Layers, HelpCircle as HelpIcon 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DateTime } from 'luxon';
import { inferTimezone } from '../../utils/timezone';

interface CopilotPanelProps {
  trip: Trip;
  selectedDayId: string | null;
  days: Day[];
  userRole: 'owner' | 'editor' | 'viewer';
  viewMode: 'timeline' | 'shortlist' | 'bookings';
}

const WIZARD_STEPS = [
  { step: 1, name: 'Accommodations & Stays', desc: 'Select top places to stay tailored to your destination.' },
  { step: 2, name: 'Morning Sightseeing', desc: 'Active exploration, hikes, or historical center guides.' },
  { step: 3, name: 'Afternoon Adventures', desc: 'Art centers, leisure walks, shopping, or local secrets.' },
  { step: 4, name: 'Evening Sunset Views', desc: 'Scenic lookout points, twilight strolls, or quiet lounges.' },
  { step: 5, name: 'Local Dining & Cafés', desc: 'Authentic local breakfast, lunch, or cozy patio dinners.' },
  { step: 6, name: 'Logistics & scenic drives', desc: 'Scenic travel paths, transfers, or helpful travel hacks.' },
];

export default function CopilotPanel({ trip, selectedDayId, days, userRole, viewMode }: CopilotPanelProps) {
  // Wizard States
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [showWizardConfig, setShowWizardConfig] = useState(false);
  const [selectedWizardSteps, setSelectedWizardSteps] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [wizardData, setWizardData] = useState<any>({
    stays: [],
    morning: [],
    afternoon: [],
    evening: [],
    dining: [],
    logistics: [],
  });
  const [currentSuggestions, setCurrentSuggestions] = useState<any[]>([]);
  const [selectedSuggestionIndices, setSelectedSuggestionIndices] = useState<number[]>([]);
  const [activeStepPrompt, setActiveStepPrompt] = useState('');
  const [customDayPrompt, setCustomDayPrompt] = useState('');

  // Action states
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionResponse, setActionResponse] = useState<string>('');
  const [actionError, setActionError] = useState('');
  const [proposedChanges, setProposedChanges] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [isCached, setIsCached] = useState(false);
  const debounceTimers = useRef<Record<string, any>>({});


  // Daily Usage Tracking
  const [aiUsageCount, setAiUsageCount] = useState(0);
  const MAX_DAILY_CALLS = 15;

  useEffect(() => {
    // Load local AI usage stats
    const stored = localStorage.getItem('aitinerary_ai_usage_date');
    const count = localStorage.getItem('aitinerary_ai_usage_count');
    const today = new Date().toISOString().split('T')[0];

    if (stored === today) {
      setAiUsageCount(count ? parseInt(count) : 0);
    } else {
      localStorage.setItem('aitinerary_ai_usage_date', today);
      localStorage.setItem('aitinerary_ai_usage_count', '0');
      setAiUsageCount(0);
    }
  }, []);

  const incrementAiUsage = () => {
    const today = new Date().toISOString().split('T')[0];
    const newCount = aiUsageCount + 1;
    setAiUsageCount(newCount);
    localStorage.setItem('aitinerary_ai_usage_date', today);
    localStorage.setItem('aitinerary_ai_usage_count', newCount.toString());
  };

  // Check quota limit
  const isQuotaReached = aiUsageCount >= MAX_DAILY_CALLS;

  // Listen to events in real-time
  useEffect(() => {
    if (!trip.id) return;
    const eventsRef = collection(db, `trips/${trip.id}/events`);
    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(list);
    }, (error) => {
      console.error("Error listening to events in CopilotPanel:", error);
    });
    return () => unsubscribe();
  }, [trip.id]);

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const calculateInputSignature = (dayEvents: any[]) => {
    const eventsSignature = JSON.stringify(
      dayEvents.map(e => ({
        id: e.id || '',
        title: e.title || '',
        category: e.category || '',
        startDateTime: e.startDateTime || '',
        endDateTime: e.endDateTime || '',
        locationName: e.locationName || '',
        address: e.address || '',
        notes: e.notes || '',
      })).sort((a, b) => (a.startDateTime || '').localeCompare(b.startDateTime || ''))
    );
    return JSON.stringify({
      destination: trip.destination,
      events: eventsSignature
    });
  };

  // Load cached advice/proposedChanges if reopened with nothing changed since
  useEffect(() => {
    if (viewMode !== 'timeline' || !selectedDayId || !trip.id) {
      setActionResponse('');
      setProposedChanges([]);
      setActionError('');
      setIsCached(false);
      return;
    }
    const currentDay = days.find(d => d.id === selectedDayId);
    if (!currentDay) return;

    // Filter events for selectedDayId
    const dayEvents = events.filter(data => {
      const startLocal = DateTime.fromISO(data.startDateTime).setZone(data.timezone || inferTimezone(trip.destination));
      return startLocal.toFormat('yyyy-MM-dd') === currentDay.dateStr;
    });

    const currentSignature = calculateInputSignature(dayEvents);
    const lastAction = localStorage.getItem(`aitinerary_last_action_${trip.id}_${selectedDayId}`);

    if (lastAction) {
      const cacheKey = `aitinerary_cache_${trip.id}_${selectedDayId}_${lastAction}`;
      const cacheStr = localStorage.getItem(cacheKey);
      if (cacheStr) {
        try {
          const cache = JSON.parse(cacheStr);
          if (cache.inputSignature === currentSignature) {
            setActionResponse(cache.advice || '');
            setProposedChanges(cache.proposedChanges || []);
            setActionError('');
            setIsCached(true);
            return;
          }
        } catch (e) {
          console.error("Error parsing cache:", e);
        }
      }
    }

    // Clear states if no valid cache matches
    setActionResponse('');
    setProposedChanges([]);
    setActionError('');
    setIsCached(false);
  }, [selectedDayId, trip.id, events, trip.destination, days, viewMode]);

  // 1. Generate current Wizard Step
  const handleGenerateStep = async (stepNum: number) => {
    if (userRole === 'viewer') return;
    if (isQuotaReached) {
      alert("You have reached your free daily AI copilot quota. The app is still fully editable manually!");
      return;
    }

    setIsGenerating(true);
    setCurrentSuggestions([]);
    setSelectedSuggestionIndices([]);
    try {
      const response = await fetch('/api/copilot/wizard-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: stepNum,
          destination: trip.destination,
          tripType: trip.tripType,
          petFriendly: trip.petFriendly,
          startDate: trip.startDate,
          endDate: trip.endDate,
          previousData: wizardData,
          existingEvents: events,
          customPrompt: activeStepPrompt,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Server error (${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || errMsg;
        } catch {
          if (errText && errText.length < 200) errMsg = errText;
        }
        throw new Error(errMsg);
      }

      const res = await response.json();
      if (res.success && Array.isArray(res.data)) {
        setCurrentSuggestions(res.data);
        setSelectedSuggestionIndices(res.data.map((_, i) => i));
        incrementAiUsage();
      } else {
        alert(res.error || 'Failed to generate travel items.');
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Error communicating with Gemini travel Copilot.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Accept and proceed step
  const handleAcceptStep = async (stepNum: number) => {
    setIsGenerating(true);
    try {
      const keyMap: Record<number, string> = {
        1: 'stays',
        2: 'morning',
        3: 'afternoon',
        4: 'evening',
        5: 'dining',
        6: 'logistics',
      };

      const key = keyMap[stepNum];
      const acceptedItems = currentSuggestions.filter((_, idx) => selectedSuggestionIndices.includes(idx));

      // Save to local wizardData for summary screen
      setWizardData((prev: any) => ({
        ...prev,
        [key]: acceptedItems,
      }));

      // Commit to firestore immediately
      const tripDays = [...days].sort((a, b) => a.dateStr.localeCompare(b.dateStr));

      if (stepNum === 1 && acceptedItems.length > 0 && tripDays.length > 0) {
        const firstDay = tripDays[0];
        const lastDay = tripDays[tripDays.length - 1];
        const staysColl = collection(db, `trips/${trip.id}/events`);
        for (const stay of acceptedItems) {
          if (stay.addToShortlist) {
            const shortlistColl = collection(db, `trips/${trip.id}/shortlist`);
            await addDoc(shortlistColl, {
              title: stay.title,
              category: 'stay',
              locationName: stay.locationName,
              address: stay.address,
              notes: stay.notes,
              coordinates: { lat: stay.lat, lng: stay.lng },
              dogFriendly: trip.petFriendly,
              addedFrom: 'wizard',
              createdAt: new Date().toISOString()
            });
            continue;
          }

          const stayTz = inferTimezone(stay.locationName || trip.destination);
          
          const reservationNumber = `RES-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

          const startLocalIn = DateTime.fromFormat(`${firstDay.dateStr} 22:00`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          const endLocalIn = DateTime.fromFormat(`${firstDay.dateStr} 22:30`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          await addDoc(staysColl, {
            title: `Check-in: ${stay.title}`,
            category: 'stay',
            startDateTime: startLocalIn.toISO(),
            endDateTime: endLocalIn.toISO(),
            timezone: stayTz,
            locationName: stay.locationName,
            address: stay.address,
            notes: stay.notes,
            coordinates: { lat: stay.lat, lng: stay.lng },
            dogFriendly: trip.petFriendly,
            reservationNumber,
            timeUnknown: true,
            source: 'wizard',
            reviewed: false,
          });

          const startLocalOut = DateTime.fromFormat(`${lastDay.dateStr} 08:00`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          const endLocalOut = DateTime.fromFormat(`${lastDay.dateStr} 08:30`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          await addDoc(staysColl, {
            title: `Check-out: ${stay.title}`,
            category: 'stay',
            startDateTime: startLocalOut.toISO(),
            endDateTime: endLocalOut.toISO(),
            timezone: stayTz,
            locationName: stay.locationName,
            address: stay.address,
            notes: stay.notes,
            coordinates: { lat: stay.lat, lng: stay.lng },
            dogFriendly: trip.petFriendly,
            reservationNumber,
            timeUnknown: true,
            source: 'wizard',
            reviewed: false,
          });
        }
        
        if (trip.status === 'planning' || trip.status === 'upcoming' || trip.status === 'draft') {
          const tripDocRef = doc(db, 'trips', trip.id);
          await updateDoc(tripDocRef, { status: 'booking' });
        }
      } else if (stepNum > 1 && acceptedItems.length > 0) {
        const categoryMap: Record<number, string> = {
          2: 'activity',
          3: 'activity',
          4: 'activity',
          5: 'food',
          6: 'logistics',
        };
        const category = categoryMap[stepNum];
        const eventsColl = collection(db, `trips/${trip.id}/events`);
        
        for (const item of acceptedItems) {
          const dayIdx = item.dayIndex || 0;
          if (dayIdx >= 0 && dayIdx < tripDays.length) {
            const targetDay = tripDays[dayIdx];
            const itemStartTime = item.startTime || '10:00';
            const itemEndTime = item.endTime || '11:30';

            const itemTz = inferTimezone(item.locationName || item.title || trip.destination);
            const startLocal = DateTime.fromFormat(`${targetDay.dateStr} ${itemStartTime}`, 'yyyy-MM-dd HH:mm', { zone: itemTz });
            const endLocal = DateTime.fromFormat(`${targetDay.dateStr} ${itemEndTime}`, 'yyyy-MM-dd HH:mm', { zone: itemTz });

            let finalEndLocal = endLocal;
            if (endLocal < startLocal) {
              finalEndLocal = endLocal.plus({ days: 1 });
            }

            if (item.addToShortlist) {
              const shortlistColl = collection(db, `trips/${trip.id}/shortlist`);
              await addDoc(shortlistColl, {
                title: item.title,
                category: category,
                locationName: item.locationName,
                address: item.address,
                notes: item.notes,
                coordinates: { lat: item.lat, lng: item.lng },
                dogFriendly: trip.petFriendly,
                addedFrom: 'wizard',
                createdAt: new Date().toISOString()
              });
            } else {
              const docPayload: any = {
                title: item.title,
                category: category,
                startDateTime: startLocal.toISO(),
                endDateTime: finalEndLocal.toISO(),
                timezone: itemTz,
                locationName: item.locationName,
                address: item.address,
                notes: item.notes,
                dogFriendly: trip.petFriendly,
                source: 'wizard',
                reviewed: false,
                status: item.status || 'confirmed',
              };
              if (item.lat !== undefined && item.lng !== undefined) {
                docPayload.coordinates = { lat: item.lat, lng: item.lng };
              }
              if (item.options) {
                docPayload.options = item.options;
              }
              await addDoc(eventsColl, docPayload);
            }
          }
        }
      }

      setActiveStepPrompt('');
      setCurrentSuggestions([]);
      setSelectedSuggestionIndices([]);

      const currentIndex = selectedWizardSteps.indexOf(stepNum);
      const nextStepNum = selectedWizardSteps[currentIndex + 1];

      if (nextStepNum) {
        setActiveStep(nextStepNum);
        // Automatically generate next step's suggestions for smoother wizard UX
        handleGenerateStep(nextStepNum);
      } else {
        // Finished all steps
        setActiveStep(7); // Show assembly completion view!
      }
    } catch (e: any) {
      console.error(e);
      alert('Error saving items: ' + e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 2b. Skip step and proceed
  const handleSkipStep = (stepNum: number) => {
    const keyMap: Record<number, string> = {
      1: 'stays',
      2: 'morning',
      3: 'afternoon',
      4: 'evening',
      5: 'dining',
      6: 'logistics',
    };

    const key = keyMap[stepNum];
    setWizardData((prev: any) => ({
      ...prev,
      [key]: [],
    }));

    setActiveStepPrompt('');
    setCurrentSuggestions([]);

    const currentIndex = selectedWizardSteps.indexOf(stepNum);
    const nextStepNum = selectedWizardSteps[currentIndex + 1];

    if (nextStepNum) {
      setActiveStep(nextStepNum);
      // Automatically generate next step's suggestions for smoother wizard UX
      handleGenerateStep(nextStepNum);
    } else {
      setActiveStep(7);
    }
  };

  const handleFinishWizard = () => {
    setActiveStep(null);
    setWizardData({ stays: [], morning: [], afternoon: [], evening: [], dining: [], logistics: [] });
    setCurrentSuggestions([]);
    setShowWizardConfig(false);
  };

  // Day-to-Day Handlers
  const handleAcceptChange = async (change: any, index: number) => {
    if (userRole === 'viewer') return;
    try {
      const currentDay = days.find(d => d.id === selectedDayId);
      if (!currentDay) return;
      const eventsColl = collection(db, `trips/${trip.id}/events`);
      
      const changeTz = inferTimezone(change.event?.locationName || change.event?.title || trip.destination);
      let startDateTime = '', endDateTime = '';
      if (change.event && change.event.startTime && change.event.endTime) {
        const startLocal = DateTime.fromFormat(`${currentDay.dateStr} ${change.event.startTime}`, 'yyyy-MM-dd HH:mm', { zone: changeTz });
        const endLocal = DateTime.fromFormat(`${currentDay.dateStr} ${change.event.endTime}`, 'yyyy-MM-dd HH:mm', { zone: changeTz });
        let finalEndLocal = endLocal;
        if (endLocal < startLocal) finalEndLocal = endLocal.plus({ days: 1 });
        startDateTime = startLocal.toISO();
        endDateTime = finalEndLocal.toISO();
      }

      if (change.type === 'add') {
        await addDoc(eventsColl, {
          title: change.event.title,
          category: change.event.category || 'activity',
          startDateTime,
          endDateTime,
          timezone: changeTz,
          locationName: change.event.locationName || change.event.title,
          notes: change.event.notes || '',
          dogFriendly: trip.petFriendly,
          source: 'ai-suggested',
          reviewed: false
        });
      } else if (change.type === 'update' && change.eventId) {
        const docRef = doc(db, `trips/${trip.id}/events`, change.eventId);
        await updateDoc(docRef, {
          title: change.event.title,
          startDateTime,
          endDateTime,
          timezone: changeTz,
          source: 'ai-suggested',
          reviewed: false
        });
      } else if (change.type === 'delete' && change.eventId) {
        const docRef = doc(db, `trips/${trip.id}/events`, change.eventId);
        await deleteDoc(docRef);
      }
      
      setProposedChanges(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      console.error(e);
      alert("Failed to apply change");
    }
  };

  const handleRejectChange = (index: number) => {
    setProposedChanges(prev => prev.filter((_, i) => i !== index));
  };
  // 4. Interactive Day-by-Day Copilot Actions
  const handleCopilotAction = (action: 'reorder' | 'connection-check' | 'dog-friendly' | 'replan' | 'custom') => {
    if (isQuotaReached) {
      alert("AI daily quota limit reached. Please come back tomorrow.");
      return;
    }

    setIsExecutingAction(true);
    setActionResponse('');
    setActionError('');
    setIsCached(false);

    // Debounce repeated rapid-fire requests from the same trigger
    if (debounceTimers.current[action]) {
      console.log(`Debouncing rapid-fire trigger for: ${action}`);
      clearTimeout(debounceTimers.current[action]);
    }

    debounceTimers.current[action] = setTimeout(() => {
      executeCopilotAction(action);
    }, 400);
  };

  const executeCopilotAction = async (action: 'reorder' | 'connection-check' | 'dog-friendly' | 'replan' | 'custom') => {
    try {
      const currentDay = days.find(d => d.id === selectedDayId);
      if (!currentDay) {
        throw new Error("No active day selected.");
      }

      // Filter events for selectedDayId using state instead of raw fetch
      const dayEvents = events.filter(data => {
        const startLocal = DateTime.fromISO(data.startDateTime).setZone(data.timezone || inferTimezone(trip.destination));
        return startLocal.toFormat('yyyy-MM-dd') === currentDay.dateStr;
      });

      const currentSignature = calculateInputSignature(dayEvents);
      const cacheKey = `aitinerary_cache_${trip.id}_${selectedDayId}_${action}`;

      // Check Cache FIRST: skip API call if nothing has changed (ignore for custom prompt since it varies)
      if (action !== 'custom') {
        const cacheStr = localStorage.getItem(cacheKey);
        if (cacheStr) {
          try {
            const cache = JSON.parse(cacheStr);
            if (cache.inputSignature === currentSignature) {
              console.log(`Cache HIT for action: ${action} on day: ${selectedDayId}`);
              setActionResponse(cache.advice || '');
              setProposedChanges(cache.proposedChanges || []);
              setIsCached(true);
              setIsExecutingAction(false);
              // Save last active action for restoration on reload/reopen
              localStorage.setItem(`aitinerary_last_action_${trip.id}_${selectedDayId}`, action);
              return;
            }
          } catch (e) {
            console.error("Cache parsing error:", e);
          }
        }
      }

      // Cache MISS: call API
      console.log(`Cache MISS or Custom Prompt for action: ${action}. Making live API call...`);
      const response = await fetch('/api/copilot/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          currentEvents: dayEvents,
          tripDetails: { destination: trip.destination },
          customPrompt: action === 'custom' ? customDayPrompt : undefined,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Server error (${response.status})`;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error || errMsg;
        } catch {
          if (errText && errText.length < 200) errMsg = errText;
        }
        throw new Error(errMsg);
      }

      const res = await response.json();
      if (res.success) {
        const advice = res.advice || 'No advice generated.';
        const changes = res.proposedChanges || [];

        setActionResponse(advice);
        setProposedChanges(changes);
        setIsCached(false);

        if (action === 'custom') {
          setCustomDayPrompt('');
        } else {
          // Store in cache for non-custom actions
          const cacheData = {
            inputSignature: currentSignature,
            advice,
            proposedChanges: changes,
          };
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
          localStorage.setItem(`aitinerary_last_action_${trip.id}_${selectedDayId}`, action);
        }

        incrementAiUsage();
      } else {
        setActionError(res.error || 'Failed to execute Copilot suggestion.');
      }
    } catch (e: any) {
      setActionError(e.message || 'Error communicating with AI Copilot.');
    } finally {
      setIsExecutingAction(false);
    }
  };

  // Simple Markdown renderer helper
  const renderMarkdownText = (text: string) => {
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('###')) {
        return <h5 key={idx} className="text-xs font-bold font-display text-slate-800 mt-3 mb-1">{line.replace('###', '')}</h5>;
      }
      if (line.startsWith('##')) {
        return <h4 key={idx} className="text-sm font-bold font-display text-indigo-700 mt-4 mb-2">{line.replace('##', '')}</h4>;
      }
      if (line.startsWith('*') || line.startsWith('-')) {
        return <li key={idx} className="text-xs text-slate-600 leading-normal ml-3 list-disc mt-1">{line.substring(1).trim()}</li>;
      }
      if (line.trim().match(/^\d+\./)) {
        return <li key={idx} className="text-xs text-slate-600 leading-normal ml-3 list-decimal mt-1">{line.replace(/^\d+\./, '').trim()}</li>;
      }
      return line.trim() ? <p key={idx} className="text-xs text-slate-500 leading-relaxed mt-2">{line}</p> : null;
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white rounded-2xl p-5 shadow-xl border border-slate-800/80" id="copilot-panel">
      {/* Copilot Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-800" id="copilot-header">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm">Gemini AI Copilot</h3>
            <p className="text-[10px] text-slate-400">Tailored multi-trip concierge</p>
          </div>
        </div>

        {/* Quota limit Indicator */}
        <div className="text-[9px] font-mono bg-slate-800 border border-slate-700 px-2 py-1 rounded-md text-slate-400">
          Quota: <b>{aiUsageCount} / {MAX_DAILY_CALLS}</b> used
        </div>
      </div>

      {userRole === 'viewer' ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 text-center gap-2">
          <ShieldCheck className="h-8 w-8 text-slate-500" />
          <h4 className="font-display font-bold text-xs">Viewer Access Mode</h4>
          <p className="text-[11px] text-slate-400 max-w-[200px]">
            AI Copilot controls are restricted to trip Owners and Editors to optimize usage quotas.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto mt-4 pr-1">
          
          {/* MULTI-STEP AI WIZARD INITIATOR / MANAGER */}
          {activeStep === null ? (
            <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-xl flex flex-col gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-display font-bold text-xs">Multi-Step AI Trip Builder</h4>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Assemble a flawless itinerary from accommodations to final logistics through 6 discrete, cacheable AI steps.
                  </p>
                </div>
              </div>

              {showWizardConfig ? (
                <div className="flex flex-col gap-2 mt-2 border-t border-slate-700/50 pt-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Categories</span>
                  {WIZARD_STEPS.map(step => (
                    <label key={step.step} className="flex items-center gap-2 cursor-pointer group">
                      <input 
                        type="checkbox"
                        checked={selectedWizardSteps.includes(step.step)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedWizardSteps(prev => [...prev, step.step].sort((a, b) => a - b));
                          } else {
                            setSelectedWizardSteps(prev => prev.filter(s => s !== step.step));
                          }
                        }}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30"
                      />
                      <span className="text-[11px] text-slate-300 group-hover:text-white transition">{step.name}</span>
                    </label>
                  ))}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        const firstStep = selectedWizardSteps[0];
                        if (firstStep) {
                          setActiveStep(firstStep);
                          handleGenerateStep(firstStep);
                          setShowWizardConfig(false);
                        }
                      }}
                      disabled={selectedWizardSteps.length === 0}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-md shadow-indigo-950 flex items-center justify-center gap-1.5"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start
                    </button>
                    <button
                      onClick={() => setShowWizardConfig(false)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowWizardConfig(true)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition shadow-md shadow-indigo-950 flex items-center justify-center gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" />
                  Launch 6-Step Wizard
                </button>
              )}
            </div>
          ) : (
            /* ACTIVE WIZARD STAGE VIEW */
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-col gap-3">
              {/* Progress Tracker */}
              <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <div className="text-[11px] font-mono text-slate-400 font-semibold">
                  Wizard: Step {activeStep <= 6 && selectedWizardSteps.includes(activeStep) ? `${selectedWizardSteps.indexOf(activeStep) + 1} / ${selectedWizardSteps.length}` : 'Assembly'}
                </div>
                <button
                  onClick={() => {
                    setActiveStep(null);
                    setWizardData({ stays: [], morning: [], afternoon: [], evening: [], dining: [], logistics: [] });
                    setShowWizardConfig(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-white transition"
                >
                  Exit Wizard
                </button>
              </div>

              {activeStep <= 6 ? (
                /* Step Suggestion Preview */
                <div className="flex flex-col gap-3">
                  <div>
                    <h5 className="font-display font-bold text-xs text-white">{WIZARD_STEPS[activeStep - 1].name}</h5>
                    <p className="text-[10px] text-slate-400 mt-0.5">{WIZARD_STEPS[activeStep - 1].desc}</p>
                  </div>

                  {/* Custom preference input */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-medium text-slate-400">Custom Preference (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., 'boutique hotel only', 'vegetarian friendly'"
                      value={activeStepPrompt}
                      onChange={(e) => setActiveStepPrompt(e.target.value)}
                      className="text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
                      <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px] font-mono">Consulting local databases...</span>
                    </div>
                  ) : currentSuggestions.length === 0 ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGenerateStep(activeStep)}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold"
                      >
                        Load Suggestions
                      </button>
                      <button
                        onClick={() => handleSkipStep(activeStep)}
                        className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold"
                      >
                        Skip Step
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                      {currentSuggestions.map((s, idx) => (
                        <label key={idx} className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex gap-2 items-start cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedSuggestionIndices.includes(idx)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSuggestionIndices(prev => [...prev, idx]);
                              } else {
                                setSelectedSuggestionIndices(prev => prev.filter(i => i !== idx));
                              }
                            }}
                            className="mt-0.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500/30"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-indigo-400">{s.title || s.locationName}</span>
                              {s.dayIndex !== undefined && (
                                <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1 py-0.5 rounded">Day {s.dayIndex + 1}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 leading-snug">{s.notes}</p>
                            <div className="text-[9px] font-mono text-slate-500 mt-1">{s.address}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {!isGenerating && currentSuggestions.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleGenerateStep(activeStep)}
                        className="py-1.5 px-2 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-bold flex items-center justify-center gap-1"
                        title="Regenerate with current preferences"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Regenerate
                      </button>
                      <button
                        onClick={() => handleSkipStep(activeStep)}
                        className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 rounded text-[10px] font-bold flex items-center justify-center"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => handleAcceptStep(activeStep)}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-[10px] font-bold flex items-center justify-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        Accept & Next
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* ASSEMBLY STAGE */
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-4.5 w-4.5" />
                    <h5 className="font-display font-bold text-xs">Trip Populated!</h5>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    All selected wizard categories have been processed and added to your itinerary.
                  </p>
                  
                  <div className="bg-slate-900/50 rounded-lg p-3 text-[10px] text-slate-300 font-mono">
                    <div className="mb-1 text-slate-500 uppercase font-bold tracking-wider">Items Added</div>
                    <ul className="space-y-1">
                      <li>Stays: {wizardData.stays.length}</li>
                      <li>Morning: {wizardData.morning.length}</li>
                      <li>Afternoon: {wizardData.afternoon.length}</li>
                      <li>Evening: {wizardData.evening.length}</li>
                      <li>Dining: {wizardData.dining.length}</li>
                      <li>Logistics: {wizardData.logistics.length}</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleFinishWizard}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition flex items-center justify-center gap-1"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DAY-TO-DAY CONCIERGE ACTIONS */}
          <div className="flex flex-col gap-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Day Concierge Actions</h4>
            
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'reorder', label: 'Optimize Route' },
                { id: 'connection-check', label: 'Safety Check' },
                { id: 'dog-friendly', label: 'Dog-Friendly Patio' },
                { id: 'replan', label: 'Replan Day' },
              ].map(action => {
                if (action.id === 'dog-friendly' && !trip.petFriendly) return null;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleCopilotAction(action.id as any)}
                    disabled={isExecutingAction || !selectedDayId || viewMode !== 'timeline'}
                    className="py-2 bg-slate-800 hover:bg-slate-700/80 rounded-xl text-[11px] font-bold border border-slate-700/60 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Day Instruction / Prompt Input */}
            <div className="mt-1 flex flex-col gap-1.5">
              <label className="text-[9px] font-medium text-slate-400">Custom Day Instruction / Prompt</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 'Add a coffee shop stop at 3pm', 'remove all hiking'"
                  value={customDayPrompt}
                  onChange={(e) => setCustomDayPrompt(e.target.value)}
                  disabled={isExecutingAction || !selectedDayId || viewMode !== 'timeline'}
                  className="flex-1 text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 disabled:opacity-40"
                />
                <button
                  onClick={() => handleCopilotAction('custom')}
                  disabled={isExecutingAction || !selectedDayId || !customDayPrompt.trim() || viewMode !== 'timeline'}
                  className="px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-3 w-3" />
                  Apply
                </button>
              </div>
            </div>
          </div>

          {/* COPILOT ADVICE / RESPONSE BOX */}
          <div className="flex-1 min-h-[160px] bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider font-bold">Copilot Log Output</span>
                {isCached && (
                  <span className="text-[9px] font-mono bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded font-bold uppercase border border-indigo-900/60">
                    Cached
                  </span>
                )}
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
            </div>

            <div className="flex-1 overflow-y-auto pr-1 text-slate-300">
              {isExecutingAction ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <div className="h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] font-mono text-slate-400">Evaluating connections...</span>
                </div>
              ) : actionError ? (
                <div className="flex items-center gap-1.5 text-xs text-red-400 p-2 border border-red-950/40 bg-red-950/20 rounded-lg">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
                  <span>{actionError}</span>
                </div>
              ) : actionResponse ? (

                <div className="flex flex-col gap-1.5">
                  {renderMarkdownText(actionResponse)}
                  {proposedChanges.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider mb-1">Proposed Changes</div>
                      {proposedChanges.map((change, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 flex flex-col gap-2 relative overflow-hidden group">
                           {change.type === 'delete' && <div className="absolute inset-0 bg-red-950/20 pointer-events-none" />}
                           {change.type === 'add' && <div className="absolute inset-0 bg-emerald-950/20 pointer-events-none" />}
                           {change.type === 'update' && <div className="absolute inset-0 bg-amber-950/20 pointer-events-none" />}
                           <div className="relative flex justify-between items-start">
                             <div className="flex flex-col">
                               <div className="flex items-center gap-1.5">
                                 <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${change.type === 'add' ? 'bg-emerald-900 text-emerald-300' : change.type === 'delete' ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300'}`}>
                                   {change.type}
                                 </span>
                                 <span className="text-xs font-bold text-white">{change.event?.title || 'Event'}</span>
                               </div>
                               {change.type !== 'delete' && (
                                 <span className="text-[10px] text-slate-400 mt-1">{change.event?.startTime} - {change.event?.endTime}</span>
                               )}
                             </div>
                             <div className="flex items-center gap-1">
                               <button 
                                 onClick={() => handleAcceptChange(change, idx)}
                                 className="p-1 rounded bg-slate-800 hover:bg-emerald-900 text-slate-400 hover:text-emerald-400 transition"
                                 title="Accept"
                               >
                                 <Check className="h-3 w-3" />
                               </button>
                               <button 
                                 onClick={() => handleRejectChange(idx)}
                                 className="p-1 rounded bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-red-400 transition"
                                 title="Reject"
                               >
                                 <Trash2 className="h-3 w-3" />
                               </button>
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center text-slate-500 gap-1.5">
                  <Info className="h-5 w-5 text-slate-600" />
                  <p className="text-[10px] leading-relaxed max-w-[180px]">
                    Trigger a Day action above to check safety, optimize driving/transit, or suggest new patio options!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
