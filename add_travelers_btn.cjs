const fs = require('fs');
let content = fs.readFileSync('src/components/trip/TripView.tsx', 'utf-8');

const targetUI = `                  <div className="flex flex-col gap-1.5 pt-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Theme Color</label>`;

const newUI = `                  <div className="flex flex-col gap-1.5 pt-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Travelers</label>
                    <button
                      type="button"
                      onClick={() => { setIsEditOpen(false); setIsTravelerOpen(true); }}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition text-left flex justify-between items-center"
                    >
                      <span>Manage Travelers ({(trip.travelers || []).length})</span>
                      <Smile className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Theme Color</label>`;

content = content.replace(targetUI, newUI);

fs.writeFileSync('src/components/trip/TripView.tsx', content);
