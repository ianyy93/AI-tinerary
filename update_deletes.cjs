const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf-8');

// Add useRef import if missing
if (!content.includes("useRef")) {
  content = content.replace("useState, useEffect", "useState, useEffect, useRef");
}

// Add state and refs for pending deletes
const stateHookPos = content.indexOf('const [isModalOpen, setIsModalOpen] = useState(false);');
content = content.slice(0, stateHookPos) + `  // Pending deletes
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);
  const deleteTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});

` + content.slice(stateHookPos);

// Replace handleDeleteEvent
const deleteMethodStr = `  const handleDeleteEvent = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (userRole === 'viewer') return;
    if (!window.confirm("Are you sure you want to delete this event?")) return;

    try {
      const eventDocRef = doc(db, \`trips/\${trip.id}/events\`, eventId);
      await deleteDoc(eventDocRef);
    } catch (e: any) {
      console.error("Error deleting event:", e);
      handleFirestoreError(e, OperationType.DELETE, \`trips/\${trip.id}/events/\${eventId}\`);
    }
  };`;

const newDeleteMethodStr = `  const handleDeleteEvent = (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (userRole === 'viewer') return;
    
    // Optimistically hide
    setPendingDeletes(prev => [...prev, eventId]);

    // Schedule actual delete
    deleteTimeouts.current[eventId] = setTimeout(async () => {
      try {
        const eventDocRef = doc(db, \`trips/\${trip.id}/events\`, eventId);
        await deleteDoc(eventDocRef);
      } catch (err: any) {
        console.error("Error deleting event:", err);
      }
      setPendingDeletes(prev => prev.filter(id => id !== eventId));
    }, 5000);
  };

  const handleUndoDelete = (eventId: string) => {
    if (deleteTimeouts.current[eventId]) {
      clearTimeout(deleteTimeouts.current[eventId]);
      delete deleteTimeouts.current[eventId];
    }
    setPendingDeletes(prev => prev.filter(id => id !== eventId));
  };`;

if (content.includes(deleteMethodStr)) {
  content = content.replace(deleteMethodStr, newDeleteMethodStr);
} else {
  console.log("Could not find handleDeleteEvent to replace.");
}

// Update filteredEvents logic
const filterLogic = `        const filteredEvents = events.filter((event) => {
          if (filterTravelerId === 'everyone') {
            return true;
          }
          return !event.travelerIds || event.travelerIds.length === 0 || event.travelerIds.includes(filterTravelerId);
        });`;

const newFilterLogic = `        const filteredEvents = events.filter((event) => {
          if (pendingDeletes.includes(event.id)) return false;
          if (filterTravelerId === 'everyone') {
            return true;
          }
          return !event.travelerIds || event.travelerIds.length === 0 || event.travelerIds.includes(filterTravelerId);
        });`;

if (content.includes(filterLogic)) {
  content = content.replace(filterLogic, newFilterLogic);
} else {
  console.log("Could not find filteredEvents logic to replace.");
}

// Add Toast UI
const modalEnd = "      {/* Create/Edit Modal */}";
const toastUI = `      {/* Undo Delete Toasts */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
        {pendingDeletes.map(eventId => {
          const evt = events.find(e => e.id === eventId);
          if (!evt) return null;
          return (
            <div key={eventId} className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2 min-w-[250px]">
              <span className="text-sm font-medium truncate">Deleted "{evt.title}"</span>
              <button 
                onClick={() => handleUndoDelete(eventId)}
                className="text-indigo-400 font-bold text-sm hover:text-indigo-300 transition shrink-0"
              >
                Undo
              </button>
            </div>
          );
        })}
      </div>

`;

content = content.replace(modalEnd, toastUI + modalEnd);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
console.log("Update applied.");
