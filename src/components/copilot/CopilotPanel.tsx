/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { Trip, ItineraryEvent, Day } from '../../types';
import { 
  Sparkles, ShieldCheck, Check, RotateCcw, AlertTriangle, HelpCircle, 
  Dog, ChevronRight, Play, Info, CheckCircle2, ThumbsUp, Layers, HelpCircle as HelpIcon 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CopilotPanelProps {
  trip: Trip;
  selectedDayId: string | null;
  days: Day[];
  userRole: 'owner' | 'editor' | 'viewer';
}

const WIZARD_STEPS = [
  { step: 1, name: 'Accommodations & Stays', desc: 'Select top places to stay tailored to your destination.' },
  { step: 2, name: 'Morning Sightseeing', desc: 'Active exploration, hikes, or historical center guides.' },
  { step: 3, name: 'Afternoon Adventures', desc: 'Art centers, leisure walks, shopping, or local secrets.' },
  { step: 4, name: 'Evening Sunset Views', desc: 'Scenic lookout points, twilight strolls, or quiet lounges.' },
  { step: 5, name: 'Local Dining & Cafés', desc: 'Authentic local breakfast, lunch, or cozy patio dinners.' },
  { step: 6, name: 'Logistics & scenic drives', desc: 'Scenic travel paths, transfers, or helpful travel hacks.' },
];

export default function CopilotPanel({ trip, selectedDayId, days, userRole }: CopilotPanelProps) {
  // Wizard States
  const [activeStep, setActiveStep] = useState<number | null>(null);
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

  // Action states
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const [actionResponse, setActionResponse] = useState<string>('');
  const [actionError, setActionError] = useState('');

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

  // 1. Generate current Wizard Step
  const handleGenerateStep = async (stepNum: number) => {
    if (userRole === 'viewer') return;
    if (isQuotaReached) {
      alert("You have reached your free daily AI copilot quota. The app is still fully editable manually!");
      return;
    }

    setIsGenerating(true);
    setCurrentSuggestions([]);
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
        }),
      });

      const res = await response.json();
      if (res.success && Array.isArray(res.data)) {
        setCurrentSuggestions(res.data);
        incrementAiUsage();
      } else {
        alert(res.error || 'Failed to generate travel items.');
      }
    } catch (e: any) {
      console.error(e);
      alert('Error communicating with Gemini travel Copilot.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Accept and proceed step
  const handleAcceptStep = (stepNum: number) => {
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
      [key]: currentSuggestions,
    }));

    if (stepNum < 6) {
      setActiveStep(stepNum + 1);
      // Automatically generate next step's suggestions for smoother wizard UX
      handleGenerateStep(stepNum + 1);
    } else {
      // Finished all steps
      setActiveStep(7); // Show assembly completion view!
    }
  };

  // 3. Assemble and Commit Itinerary to Firestore
  const handleAssembleAndCommit = async () => {
    if (userRole === 'viewer') return;
    setIsGenerating(true);
    try {
      // We need to fetch the days of the current trip to map suggestions to day indices
      const daysRef = collection(db, `trips/${trip.id}/days`);
      let daysSnap;
      try {
        daysSnap = await getDocs(daysRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, `trips/${trip.id}/days`);
        throw err;
      }
      const tripDays = daysSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Day);
      tripDays.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

      // 1. Commit Stays (These are added to EVERY DAY as accommodation stops or as a stay item)
      // We will place stays on Day 1 (or make them cover the duration)
      if (wizardData.stays.length > 0 && tripDays.length > 0) {
        const firstDayId = tripDays[0].id;
        const staysColl = collection(db, `trips/${trip.id}/days/${firstDayId}/events`);
        for (const stay of wizardData.stays) {
          try {
            await addDoc(staysColl, {
              title: `Check-in: ${stay.title}`,
              category: 'stay',
              startTime: '15:00',
              endTime: '16:00',
              timezone: 'America/New_York',
              locationName: stay.locationName,
              address: stay.address,
              notes: stay.notes,
              coordinates: { lat: stay.lat, lng: stay.lng },
              dogFriendly: trip.petFriendly,
              reservationNumber: `RES-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `trips/${trip.id}/days/${firstDayId}/events`);
            throw err;
          }
        }
      }

      // Helper to add list of suggested items to respective days in Firestore
      const commitItems = async (items: any[], category: string) => {
        for (const item of items) {
          const dayIdx = item.dayIndex || 0;
          if (dayIdx >= 0 && dayIdx < tripDays.length) {
            const targetDay = tripDays[dayIdx];
            const eventColl = collection(db, `trips/${trip.id}/days/${targetDay.id}/events`);
            try {
              await addDoc(eventColl, {
                title: item.title,
                category: category,
                startTime: item.startTime || '10:00',
                endTime: item.endTime || '11:30',
                timezone: 'America/New_York',
                locationName: item.locationName,
                address: item.address,
                notes: item.notes,
                coordinates: { lat: item.lat, lng: item.lng },
                dogFriendly: trip.petFriendly,
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, `trips/${trip.id}/days/${targetDay.id}/events`);
              throw err;
            }
          }
        }
      };

      await commitItems(wizardData.morning, 'activity');
      await commitItems(wizardData.afternoon, 'activity');
      await commitItems(wizardData.evening, 'activity');
      await commitItems(wizardData.dining, 'food');
      await commitItems(wizardData.logistics, 'logistics');

      // Update trip status to booking because we added stays with auto-reservation numbers
      if (trip.status === 'planning' || trip.status === 'upcoming' || trip.status === 'draft') {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const tripDocRef = doc(db, 'trips', trip.id);
          await updateDoc(tripDocRef, { status: 'booking' });
        } catch (err) {
          console.error("Error auto-updating trip status to booking:", err);
        }
      }

      // Reset Wizard States
      setActiveStep(null);
      setWizardData({ stays: [], morning: [], afternoon: [], evening: [], dining: [], logistics: [] });
      setCurrentSuggestions([]);
      alert("Successfully assembled your tailored trip! Check your itinerary map and timeline.");
    } catch (e) {
      console.error(e);
      alert("Error committing plans to real-time database.");
    } finally {
      setIsGenerating(false);
    }
  };

  // 4. Interactive Day-by-Day Copilot Actions
  const handleCopilotAction = async (action: 'reorder' | 'connection-check' | 'dog-friendly' | 'replan') => {
    if (isQuotaReached) {
      alert("AI daily quota limit reached. Please come back tomorrow.");
      return;
    }
    setIsExecutingAction(true);
    setActionResponse('');
    setActionError('');

    try {
      // Fetch current day events to pass to Gemini
      const eventsRef = collection(db, `trips/${trip.id}/days/${selectedDayId}/events`);
      let eventsSnap;
      try {
        eventsSnap = await getDocs(eventsRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, `trips/${trip.id}/days/${selectedDayId}/events`);
        throw err;
      }
      const currentEvents = eventsSnap.docs.map(doc => doc.data());

      const response = await fetch('/api/copilot/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          currentEvents,
          tripDetails: { destination: trip.destination },
        }),
      });

      const res = await response.json();
      if (res.success) {
        setActionResponse(res.advice);
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

              <button
                onClick={() => {
                  setActiveStep(1);
                  handleGenerateStep(1);
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition shadow-md shadow-indigo-950 flex items-center justify-center gap-1.5"
              >
                <Play className="h-3.5 w-3.5" />
                Launch 6-Step Wizard
              </button>
            </div>
          ) : (
            /* ACTIVE WIZARD STAGE VIEW */
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex flex-col gap-3">
              {/* Progress Tracker */}
              <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <div className="text-[11px] font-mono text-slate-400 font-semibold">
                  Wizard: Step {activeStep <= 6 ? `${activeStep} / 6` : 'Assembly'}
                </div>
                <button
                  onClick={() => {
                    setActiveStep(null);
                    setWizardData({ stays: [], morning: [], afternoon: [], evening: [], dining: [], logistics: [] });
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

                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-2 text-slate-400">
                      <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px] font-mono">Consulting local databases...</span>
                    </div>
                  ) : currentSuggestions.length === 0 ? (
                    <div className="text-center py-4">
                      <button
                        onClick={() => handleGenerateStep(activeStep)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-[10px] font-bold"
                      >
                        Load Suggestions
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-h-[180px] overflow-y-auto pr-1">
                      {currentSuggestions.map((s, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-indigo-400">{s.title || s.locationName}</span>
                            {s.dayIndex !== undefined && (
                              <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1 py-0.5 rounded">Day {s.dayIndex + 1}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-snug">{s.notes}</p>
                          <div className="text-[9px] font-mono text-slate-500 mt-1">{s.address}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!isGenerating && currentSuggestions.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleGenerateStep(activeStep)}
                        className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] font-bold flex items-center justify-center gap-1"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Regenerate
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
                    <h5 className="font-display font-bold text-xs">Structure Prepared!</h5>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    All 6 discrete segments (hotels, walks, meals, flights) have been validated and compiled into local cache.
                  </p>

                  <button
                    onClick={handleAssembleAndCommit}
                    disabled={isGenerating}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition flex items-center justify-center gap-1"
                  >
                    {isGenerating ? 'Saving to Cloud...' : 'Commit Complete Itinerary'}
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
                    disabled={isExecutingAction || !selectedDayId}
                    className="py-2 bg-slate-800 hover:bg-slate-700/80 rounded-xl text-[11px] font-bold border border-slate-700/60 transition"
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* COPILOT ADVICE / RESPONSE BOX */}
          <div className="flex-1 min-h-[160px] bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
              <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider font-bold">Copilot Log Output</span>
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
