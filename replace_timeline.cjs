const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf-8');

// 1. replace state
content = content.replace(
  "  const [startTime, setStartTime] = useState('09:00');\n  const [endTime, setEndTime] = useState('10:00');",
  "  const [startDateTimeLocal, setStartDateTimeLocal] = useState('');\n  const [endDateTimeLocal, setEndDateTimeLocal] = useState('');"
);

// 2. replace openAddModal
content = content.replace(
  "    setStartTime('09:00');\n    setEndTime('10:00');",
  "    const currentDay = days.find(d => d.id === selectedDayId);\n    const dateStr = currentDay ? currentDay.dateStr : new Date().toISOString().split('T')[0];\n    setStartDateTimeLocal(`${dateStr}T09:00`);\n    setEndDateTimeLocal(`${dateStr}T10:00`);"
);

// 3. replace openEditModal
content = content.replace(
  /    const startLocal = DateTime\.fromISO\(event\.startDateTime\)\.setZone\(event\.timezone \|\| 'America\/New_York'\);\n    const endLocal = DateTime\.fromISO\(event\.endDateTime\)\.setZone\(event\.timezone \|\| 'America\/New_York'\);\n    setStartTime\(startLocal\.isValid \? startLocal\.toFormat\('HH:mm'\) : '09:00'\);\n    setEndTime\(endLocal\.isValid \? endLocal\.toFormat\('HH:mm'\) : '10:00'\);/,
  "    const startLocal = DateTime.fromISO(event.startDateTime).setZone(event.timezone || 'America/New_York');\n    const endLocal = DateTime.fromISO(event.endDateTime).setZone(event.timezone || 'America/New_York');\n    setStartDateTimeLocal(startLocal.isValid ? startLocal.toFormat(\"yyyy-MM-dd'T'HH:mm\") : '');\n    setEndDateTimeLocal(endLocal.isValid ? endLocal.toFormat(\"yyyy-MM-dd'T'HH:mm\") : '');"
);

// 4. replace handleSaveEvent
content = content.replace(
  /    if \(!title\.trim\(\) \|\| !locationName\.trim\(\) \|\| !startTime \|\| !endTime\) \{/,
  "    if (!title.trim() || !locationName.trim() || !startDateTimeLocal || !endDateTimeLocal) {"
);

content = content.replace(
  /    const currentDay = days\.find\(d => d\.id === selectedDayId\);\n    const dateStr = currentDay \? currentDay\.dateStr : '';\n    if \(!dateStr\) \{\n      setErrorMsg\('No active day selected\.'\);\n      return;\n    \}\n\n    try \{\n      const parsedLat = parseFloat\(lat\);\n      const parsedLng = parseFloat\(lng\);\n\n      const startLocal = DateTime\.fromFormat\(`\$\{dateStr\} \$\{startTime\}`\, 'yyyy-MM-dd HH:mm', \{ zone: timezone \}\);\n      const endLocal = DateTime\.fromFormat\(`\$\{dateStr\} \$\{endTime\}`\, 'yyyy-MM-dd HH:mm', \{ zone: timezone \}\);\n\n      let finalEndLocal = endLocal;\n      if \(endLocal < startLocal\) \{\n        finalEndLocal = endLocal\.plus\(\{ days: 1 \}\);\n      \}/,
  `    try {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      const startLocal = DateTime.fromFormat(startDateTimeLocal, "yyyy-MM-dd'T'HH:mm", { zone: timezone });
      const endLocal = DateTime.fromFormat(endDateTimeLocal, "yyyy-MM-dd'T'HH:mm", { zone: timezone });

      let finalEndLocal = endLocal;
      if (endLocal < startLocal) {
        finalEndLocal = endLocal.plus({ days: 1 });
      }`
);

// 5. add source: 'manual' on save
content = content.replace(
  /        reservationNumber: reservationNumber \|\| '',\n        dogFriendly,\n        fileUrl,\n        fileName,\n        travelerIds: eventTravelerIds,\n      \};/,
  "        reservationNumber: reservationNumber || '',\n        dogFriendly,\n        fileUrl,\n        fileName,\n        travelerIds: eventTravelerIds,\n        source: 'manual',\n      };"
);

// 6. fix form fields
content = content.replace(
  /                  <div className="flex flex-col gap-1">\n                    <label className="text-\[10px\] font-bold text-slate-500 uppercase tracking-wider">Start Time<\/label>\n                    <input \n                      type="time" \n                      required\n                      value=\{startTime\}\n                      onChange=\{\(e\) => setStartTime\(e\.target\.value\)\}\n                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition"\n                    \/>\n                  <\/div>\n                  <div className="flex flex-col gap-1">\n                    <label className="text-\[10px\] font-bold text-slate-500 uppercase tracking-wider">End Time<\/label>\n                    <input \n                      type="time" \n                      required\n                      value=\{endTime\}\n                      onChange=\{\(e\) => setEndTime\(e\.target\.value\)\}\n                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition"\n                    \/>\n                  <\/div>/,
  `                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={startDateTimeLocal}
                      onChange={(e) => setStartDateTimeLocal(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">End</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={endDateTimeLocal}
                      onChange={(e) => setEndDateTimeLocal(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 bg-white transition"
                    />
                  </div>`
);

// 7. add source badge
content = content.replace(
  /                            <span className=\{`text-\[10px\] font-mono font-bold px-2 py-0\.5 rounded-md \$\{cat\.colorClass\}`\}>\n                              \{cat\.label\}\n                            <\/span>/,
  `                            <span className={\`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md \${cat.colorClass}\`}>
                              {cat.label}
                            </span>
                            {event.source && event.source !== 'manual' && (
                              <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-100 flex items-center gap-1" title="Unverified Generated Entry">
                                <Sparkles className="h-2.5 w-2.5" />
                                {event.source === 'wizard' ? 'Wizard' : event.source === 'ai-suggested' ? 'AI Suggestion' : 'Anchor'}
                              </span>
                            )}`
);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
