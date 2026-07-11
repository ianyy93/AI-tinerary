const fs = require('fs');
const path = 'src/components/timeline/ItineraryTimeline.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldRegex = /<button\n\s*onClick=\{openAddModal\}\n\s*className="mt-4 px-3 py-1\.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-\[11px\] rounded-lg border border-slate-200 transition"\n\s*>\n\s*\{selectedDayId === 'stays-flights' \? 'Add Stay \/ Flight' : 'Add Custom Stop'\}\n\s*<\/button>/;

const newJSX = `<div className="mt-4 flex gap-2 justify-center">
                    <button
                      onClick={() => {
                        if (selectedDayId === 'stays-flights') {
                          setIsBookingModalOpen(true);
                        } else {
                          openAddModal();
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg border border-slate-200 transition"
                    >
                      {selectedDayId === 'stays-flights' ? 'Add Booking (AI)' : 'Add Custom Stop'}
                    </button>
                    {selectedDayId === 'stays-flights' && (
                      <button
                        onClick={openAddModal}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-500 font-bold text-[11px] rounded-lg border border-slate-200 transition"
                      >
                        Add Manual Stop
                      </button>
                    )}
                  </div>`;

content = content.replace(oldRegex, newJSX);
fs.writeFileSync(path, content);
