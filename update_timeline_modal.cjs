const fs = require('fs');
const path = 'src/components/timeline/ItineraryTimeline.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add import for AnchorExtractionFlow
content = content.replace(
  "import { \n  MapPin, \n  Clock, \n  Info, \n  ExternalLink, \n  Users, \n  Plus, \n  Trash2, \n  Map as MapIcon, \n  Globe, \n  Calendar, \n  Coffee, \n  Moon, \n  Plane, \n  Camera,\n  Briefcase,\n  X,\n  Compass,\n  Image as ImageIcon,\n  Sparkles\n} from 'lucide-react';",
  "import { \n  MapPin, \n  Clock, \n  Info, \n  ExternalLink, \n  Users, \n  Plus, \n  Trash2, \n  Map as MapIcon, \n  Globe, \n  Calendar, \n  Coffee, \n  Moon, \n  Plane, \n  Camera,\n  Briefcase,\n  X,\n  Compass,\n  Image as ImageIcon,\n  Sparkles\n} from 'lucide-react';\nimport { AnchorExtractionFlow } from '../hub/AnchorExtractionFlow';"
);

// Add state for isBookingModalOpen
content = content.replace(
  "const [isModalOpen, setIsModalOpen] = useState(false);",
  "const [isModalOpen, setIsModalOpen] = useState(false);\n  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);"
);

// Add the button to header
const headerRegex = /<button\n\s*onClick=\{openAddModal\}\n\s*className="flex items-center gap-1 px-3 py-1\.5 border rounded-lg text-xs font-bold transition bg-indigo-50 hover:bg-indigo-100 border-indigo-100 text-indigo-700"\n\s*title="Add Stop"\n\s*>\n\s*<Plus className="h-3\.5 w-3\.5" \/>\n\s*Add Stop\n\s*<\/button>/;

const newHeader = `<div className="flex items-center gap-2">
          <button
            onClick={() => setIsBookingModalOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-emerald-700"
            title="Add Booking (AI)"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Add Booking
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-bold transition bg-indigo-50 hover:bg-indigo-100 border-indigo-100 text-indigo-700"
            title="Add Stop"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        </div>`;

content = content.replace(headerRegex, newHeader);

// Add the Booking Modal
const modalJSX = `
      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-emerald-600" />
                <h3 className="font-display font-bold text-slate-800 text-base">Add a Booking with AI</h3>
              </div>
              <button onClick={() => setIsBookingModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <AnchorExtractionFlow
                onConfirm={async (events) => {
                  try {
                    for (const ev of events) {
                      const startDateTime = \`\${ev.date}T\${ev.startTime}\`;
                      const endDateTime = \`\${ev.date}T\${ev.endTime}\`;
                      await addDoc(collection(db, \`trips/\${trip.id}/events\`), {
                        category: ev.category,
                        title: ev.title,
                        startDateTime,
                        endDateTime,
                        locationName: ev.locationName,
                        address: ev.address || '',
                        notes: ev.notes || '',
                        isAnchor: true,
                        source: 'anchor',
                        reservationNumber: ev.isBooked ? 'Confirmed' : '',
                        timezone: ev.timezone || inferTimezone(trip.destination),
                        coordinates: ev.lat && ev.lng ? { lat: ev.lat, lng: ev.lng } : null
                      });
                    }
                    setIsBookingModalOpen(false);
                  } catch (e) {
                    console.error("Failed to add booking events:", e);
                  }
                }}
                onCancel={() => setIsBookingModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
`;

// Insert the booking modal right before the existing Add Stop modal
const addStopModalRegex = /\{isModalOpen && \(\n\s*<div className="fixed inset-0 bg-slate-900\/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">/;
content = content.replace(addStopModalRegex, modalJSX + "\n      {isModalOpen && (\n        <div className=\"fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4\">");

fs.writeFileSync(path, content);
