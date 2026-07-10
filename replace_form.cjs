const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf-8');

const targetStr = `                  <div className="flex flex-col gap-1">
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
                  </div>`;

const replaceStr = `                  <div className="flex flex-col gap-1">
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
                  </div>`;

if (content.includes(targetStr)) {
  fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content.replace(targetStr, replaceStr));
  console.log('Replaced form fields.');
} else {
  console.log('Target string not found.');
}
