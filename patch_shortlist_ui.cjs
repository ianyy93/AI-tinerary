const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

const targetStr = `      {(() => {
        const filteredEvents = events.filter((event) => {`;

const replacementStr = `      {selectedDayId === 'shortlist' ? (
        <div className="flex-1 overflow-y-auto mt-4 pr-1 relative flex flex-col gap-3">
          {shortlistItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Sparkles className="h-10 w-10 text-slate-300 mb-3" />
              <h4 className="font-display font-bold text-sm text-slate-800">Shortlist is Empty</h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1.5">
                Great ideas without a specific day will show up here. Use the Copilot or Add to Shortlist directly!
              </p>
            </div>
          ) : (
            shortlistItems.map(item => (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-display font-bold text-sm text-slate-900">{item.title}</h4>
                    <p className="text-[11px] text-slate-500 font-medium">{item.locationName}</p>
                    {item.notes && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.notes}</p>}
                  </div>
                  {userRole !== 'viewer' && (
                    <button 
                      onClick={() => {
                        // TODO: trigger scheduling
                      }}
                      className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-lg transition"
                    >
                      Schedule
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (() => {
        const filteredEvents = events.filter((event) => {`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
