const fs = require('fs');
let content = fs.readFileSync('src/components/trip/TripView.tsx', 'utf-8');

// 1. Add orphaned banner state
const statePos = content.indexOf('  const [editStatusOverride, setEditStatusOverride] = useState(false);');
content = content.slice(0, statePos) + `  const [editStatusOverride, setEditStatusOverride] = useState(false);
  const [showOrphanedBanner, setShowOrphanedBanner] = useState(false);\n` + content.slice(statePos + '  const [editStatusOverride, setEditStatusOverride] = useState(false);'.length);

// 2. Add orphaned logic in handleSaveEdit
const oldSaveLogic = `      // If dates were added or modified, check if we need to initialize day documents
      if (datesAddedOrChanged && editStartDate && editEndDate) {
        const daysRef = collection(db, \`trips/\${trip.id}/days\`);
        const daysSnap = await getDocs(daysRef);
        
        if (daysSnap.empty) {`;

const newSaveLogic = `      // If dates were added or modified, check if we need to initialize day documents
      if (datesAddedOrChanged && editStartDate && editEndDate) {
        const daysRef = collection(db, \`trips/\${trip.id}/days\`);
        const daysSnap = await getDocs(daysRef);
        
        // Check for orphaned events
        const eventsRef = collection(db, \`trips/\${trip.id}/events\`);
        const eventsSnap = await getDocs(eventsRef);
        let hasOrphaned = false;
        
        // Parse dates carefully considering timezones might be tricky, but basic ISO comparison works for days
        const newStartStr = editStartDate + "T00:00:00";
        const newEndStr = editEndDate + "T23:59:59";
        
        eventsSnap.forEach(docSnap => {
          const ev = docSnap.data();
          const evStart = ev.startDateTime;
          if (evStart < newStartStr || evStart > newEndStr) {
             hasOrphaned = true;
          }
        });
        
        if (hasOrphaned) {
          setShowOrphanedBanner(true);
        } else {
          setShowOrphanedBanner(false);
        }

        if (daysSnap.empty) {`;

content = content.replace(oldSaveLogic, newSaveLogic);

// 3. Render the banner below header
const headerEndPos = content.indexOf('</header>');
const bannerUI = `
      {showOrphanedBanner && (
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800 text-xs">
            <ShieldAlert className="h-4 w-4" />
            <span><b>Review needed:</b> You shrunk the trip dates, leaving some existing events outside the new range. They are preserved, but won't show on the timeline.</span>
          </div>
          <button onClick={() => setShowOrphanedBanner(false)} className="text-amber-800 hover:text-amber-900">
            &times;
          </button>
        </div>
      )}`;
content = content.slice(0, headerEndPos + '</header>'.length) + bannerUI + content.slice(headerEndPos + '</header>'.length);

// 4. Move settings gear icon to title
const oldTitleUI = `          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-slate-900 truncate leading-snug">
                {trip.title}
              </h2>
              {trip.petFriendly && (`;

const newTitleUI = `          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-slate-900 truncate leading-snug">
                {trip.title}
              </h2>
              {userRole !== 'viewer' && (
                <button 
                  onClick={() => setIsEditOpen(true)}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition shrink-0"
                  title="Trip Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
              {trip.petFriendly && (`;

content = content.replace(oldTitleUI, newTitleUI);

// Remove the old edit button
const oldEditBtn = `          {/* Edit Trip Settings Button */}
          {userRole !== 'viewer' && (
            <button 
              onClick={() => setIsEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold transition shadow-sm"
              id="edit-trip-btn"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit Trip</span>
            </button>
          )}`;

content = content.replace(oldEditBtn, "");

fs.writeFileSync('src/components/trip/TripView.tsx', content);
console.log("Updated TripView.tsx");
