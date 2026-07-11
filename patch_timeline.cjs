const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

// Add shortlistItems state
content = content.replace(
  "const [events, setEvents] = useState<ItineraryEvent[]>([]);",
  "const [events, setEvents] = useState<ItineraryEvent[]>([]);\n  const [shortlistItems, setShortlistItems] = useState<any[]>([]);"
);

// Add useEffect for shortlist collection
const useEffectRegex = /  useEffect\(\(\) => \{\n    if \(\!trip\.id \|\| \!selectedDayId \|\| \!days\.length\) return;/;
content = content.replace(useEffectRegex, `  useEffect(() => {
    if (!trip.id) return;
    const shortlistRef = collection(db, \`trips/\${trip.id}/shortlist\`);
    const unsub = onSnapshot(shortlistRef, (snap) => {
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setShortlistItems(items);
    });
    return () => unsub();
  }, [trip.id]);\n\n  useEffect(() => {
    if (!trip.id || (!selectedDayId && selectedDayId !== 'shortlist') || (!days.length && selectedDayId !== 'shortlist')) return;`);

// Find the tabs area and add Shortlist tab
const staysTabRegex = /<button\n\s*onClick=\{\(\) => onSelectDay\('stays-flights'\)\}/;
content = content.replace(staysTabRegex, `<button
            onClick={() => onSelectDay('shortlist')}
            className={\`px-4 py-2 rounded-xl text-xs font-semibold shrink-0 border transition flex flex-col items-center justify-center \${
              selectedDayId === 'shortlist'
                ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-100'
                : 'bg-purple-50 border-purple-100 text-purple-800 hover:bg-purple-100'
            }\`}
          >
            <div className="font-bold">📝 Shortlist {shortlistItems.length > 0 && \`(\${shortlistItems.length})\`}</div>
            <div className={\`text-[9px] \${selectedDayId === 'shortlist' ? 'text-purple-100' : 'text-purple-600'} mt-0.5\`}>
              Unscheduled ideas
            </div>
          </button>
          <button
            onClick={() => onSelectDay('stays-flights')}`);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
