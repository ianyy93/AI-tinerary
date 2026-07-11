const fs = require('fs');
const path = 'src/components/timeline/ItineraryTimeline.tsx';
let content = fs.readFileSync(path, 'utf8');

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

const addStopModalRegex = /\{\/\* EVENT ADD\/EDIT MODAL \*\/\}/;
content = content.replace(addStopModalRegex, modalJSX + "\n      {/* EVENT ADD/EDIT MODAL */}");

fs.writeFileSync(path, content);
