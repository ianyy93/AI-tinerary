const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf-8');

const oldEffect = `  // Sync / listen to events for the selected day from the flat collection
  useEffect(() => {
    if (!trip.id || !selectedDayId || !days.length) return;

    const currentDay = days.find(d => d.id === selectedDayId);
    if (!currentDay) return;

    const eventsRef = collection(db, \`trips/\${trip.id}/events\`);

    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const items: ItineraryEvent[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const startLocal = DateTime.fromISO(data.startDateTime).setZone(data.timezone || 'America/New_York');
        if (startLocal.toFormat('yyyy-MM-dd') === currentDay.dateStr) {
          items.push({ id: doc.id, ...data } as ItineraryEvent);
        }
      });
      // Sort chronologically by startDateTime
      items.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      setEvents(items);
    }, (err) => {
      console.error("Error listening to events:", err);
    });

    return () => unsubscribe();
  }, [trip.id, selectedDayId, days]);`;

const newEffect = `  // Sync / listen to events (either for selected day, or all if no dates)
  useEffect(() => {
    if (!trip.id) return;

    let currentDay: Day | undefined;
    if (days.length > 0 && selectedDayId) {
       currentDay = days.find(d => d.id === selectedDayId);
    }

    const eventsRef = collection(db, \`trips/\${trip.id}/events\`);

    const unsubscribe = onSnapshot(eventsRef, (snapshot) => {
      const items: ItineraryEvent[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (currentDay) {
          const startLocal = DateTime.fromISO(data.startDateTime).setZone(data.timezone || 'America/New_York');
          if (startLocal.toFormat('yyyy-MM-dd') === currentDay.dateStr) {
            items.push({ id: doc.id, ...data } as ItineraryEvent);
          }
        } else {
          // If no days configured on trip, show all events
          items.push({ id: doc.id, ...data } as ItineraryEvent);
        }
      });
      // Sort chronologically by startDateTime
      items.sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      setEvents(items);
    }, (err) => {
      console.error("Error listening to events:", err);
    });

    return () => unsubscribe();
  }, [trip.id, selectedDayId, days]);`;

content = content.replace(oldEffect, newEffect);

// Enable Add Stop button
const oldButton = `        {userRole !== 'viewer' && (
          <button
            onClick={openAddModal}
            disabled={days.length === 0}
            className={\`flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition \${
              days.length === 0 
                ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-100 text-indigo-700'
            }\`}
            title={days.length === 0 ? "Set a trip date range to plan stops" : "Add Stop"}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        )}`;

const newButton = `        {userRole !== 'viewer' && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition bg-indigo-50 hover:bg-indigo-100 border-indigo-100 text-indigo-700"
            title="Add Stop"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        )}`;

content = content.replace(oldButton, newButton);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
