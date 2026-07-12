import React, { useState } from 'react';
import { ArrowRight, Sparkles, MapPin, Calendar, Clock, Plus, Trash2 } from 'lucide-react';
import { ItineraryEvent } from '../../types';

interface AnchorEventData {
  id: string; // temporary id for UI
  title: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  locationName: string;
  address: string;
  notes: string;
  lat?: number;
  lng?: number;
  isBooked: boolean;
  timezone: string;
}

export function AnchorExtractionFlow({ onConfirm, onCancel }: { onConfirm: (events: AnchorEventData[]) => void, onCancel: () => void }) {
  const [anchorText, setAnchorText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [extractedEvents, setExtractedEvents] = useState<AnchorEventData[]>([]);
  const [step, setStep] = useState<'paste' | 'confirm'>('paste');

  const handleExtract = async () => {
    if (!anchorText.trim()) {
      setErrorMsg("Please enter details about your booked or fixed event.");
      return;
    }

    try {
      setErrorMsg('');
      setIsExtracting(true);
      
      const response = await fetch('/api/copilot/extract-anchor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ anchorText })
      });

      if (!response.ok) {
        throw new Error("Failed to extract details from text.");
      }

      const result = await response.json();
      if (result.success && result.data && result.data.anchorEvents) {
        setExtractedEvents(result.data.anchorEvents.map((e: any) => ({
          ...e,
          id: Math.random().toString(36).substr(2, 9),
          isBooked: e.isBooked !== false,
          category: e.category || 'activity',
          startTime: e.startTime || '10:00',
          endTime: e.endTime || '11:00',
          timezone: e.timezone || 'UTC'
        })));
        setStep('confirm');
      } else {
        throw new Error(result.error || "Gemini could not parse your text.");
      }
    } catch (err: any) {
      console.error("Error during extraction:", err);
      setErrorMsg(err.message || "An error occurred while calling the AI. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const updateEvent = (id: string, field: keyof AnchorEventData, value: any) => {
    setExtractedEvents(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const removeEvent = (id: string) => {
    setExtractedEvents(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div className="flex flex-col gap-4">
      {step === 'paste' ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Describe your Booking or Event(s)</label>
            <textarea
              rows={6}
              placeholder={`Paste confirmation emails for flights and hotels, or write something like:\n"Flight lands in Denver at 3pm on Oct 12th. Have a dinner res at 7pm."`}
              value={anchorText}
              onChange={(e) => setAnchorText(e.target.value)}
              className="px-4 py-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none bg-slate-50"
            />
          </div>
          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl font-medium border border-red-100">
              {errorMsg}
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-bold text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExtract}
              disabled={isExtracting || !anchorText.trim()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 transition flex items-center gap-2"
            >
              {isExtracting ? 'Analyzing details...' : 'Analyze with AI'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="text-sm font-bold text-indigo-800">Please confirm extracted events</div>
          {extractedEvents.map((ev, index) => (
            <div key={ev.id} className="bg-indigo-50/30 p-4 border border-indigo-100 rounded-xl flex flex-col gap-3 relative">
              <button type="button" onClick={() => removeEvent(ev.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 col-span-2 pr-6">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Event Title</label>
                  <input type="text" value={ev.title} onChange={e => updateEvent(ev.id, 'title', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Category</label>
                  <select value={ev.category} onChange={e => updateEvent(ev.id, 'category', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs">
                    <option value="activity">Activity / Sightseeing</option>
                    <option value="stay">Stay / Hotel</option>
                    <option value="travel">Travel / Flight / Train</option>
                    <option value="food">Food / Restaurant</option>
                    <option value="logistics">Logistics / Meeting / Wedding</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date</label>
                  <input type="date" value={ev.date} onChange={e => updateEvent(ev.id, 'date', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start Time</label>
                  <input type="time" value={ev.startTime} onChange={e => updateEvent(ev.id, 'startTime', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End Time</label>
                  <input type="time" value={ev.endTime} onChange={e => updateEvent(ev.id, 'endTime', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Location Name</label>
                  <input type="text" value={ev.locationName} onChange={e => updateEvent(ev.id, 'locationName', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Street Address</label>
                  <input type="text" value={ev.address || ''} onChange={e => updateEvent(ev.id, 'address', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs" />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</label>
                  <textarea rows={2} value={ev.notes || ''} onChange={e => updateEvent(ev.id, 'notes', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs resize-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Timezone</label>
                  <select value={ev.timezone} onChange={e => updateEvent(ev.id, 'timezone', e.target.value)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white">
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Chicago">America/Chicago</option>
                    <option value="America/Denver">America/Denver</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                    <option value="Asia/Seoul">Asia/Seoul</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="Australia/Sydney">Australia/Sydney</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5 col-span-2">
                  <input type="checkbox" id={`booked-${ev.id}`} checked={ev.isBooked} onChange={e => updateEvent(ev.id, 'isBooked', e.target.checked)} className="h-3.5 w-3.5" />
                  <label htmlFor={`booked-${ev.id}`} className="text-[11px] font-bold text-indigo-800">Already Booked / Confirmed</label>
                </div>
              </div>
            </div>
          ))}
          {extractedEvents.length === 0 && (
            <div className="text-sm text-slate-500">No events extracted. Please go back and try again.</div>
          )}
          <div className="flex items-center justify-between pt-4 mt-2">
            <button type="button" onClick={() => setStep('paste')} className="px-4 py-2 text-slate-600 text-xs font-bold">Back to Edit Text</button>
            <button type="button" onClick={() => onConfirm(extractedEvents)} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold">Confirm Events</button>
          </div>
        </div>
      )}
    </div>
  );
}
