const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

const emptyShortlistUI = `<h4 className="font-display font-bold text-sm text-slate-800">Shortlist is Empty</h4>`;
content = content.replace(emptyShortlistUI, emptyShortlistUI + `\n              {userRole !== 'viewer' && (
                <button 
                  onClick={() => setIsShortlistModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  Add Idea Manually
                </button>
              )}`);

const populatedShortlistUI = `{shortlistItems.map(item => (`;
content = content.replace(populatedShortlistUI, `
            <div className="flex justify-end mb-2">
              {userRole !== 'viewer' && (
                <button 
                  onClick={() => setIsShortlistModalOpen(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition shadow-sm"
                >
                  + Add Idea
                </button>
              )}
            </div>
            ` + populatedShortlistUI);

// Need to define isShortlistModalOpen and the modal UI
content = content.replace(
  "const [shortlistSourceId, setShortlistSourceId] = useState<string | null>(null);",
  "const [shortlistSourceId, setShortlistSourceId] = useState<string | null>(null);\n  const [isShortlistModalOpen, setIsShortlistModalOpen] = useState(false);"
);

// We need a basic form for adding to the shortlist. Or we can reuse the current modal but bypass the date/time requirements.
// A simple custom modal for shortlist might be cleaner since dates aren't needed.

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
