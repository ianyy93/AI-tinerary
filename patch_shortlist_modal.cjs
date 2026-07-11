const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

const modalUI = `
      {/* Shortlist Modal */}
      <AnimatePresence>
        {isShortlistModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShortlistModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h3 className="font-display font-bold text-lg text-slate-900">Add to Shortlist</h3>
                <button 
                  onClick={() => setIsShortlistModalOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form 
                className="p-5 overflow-y-auto flex-1 flex flex-col gap-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const shortlistCollRef = collection(db, \`trips/\${trip.id}/shortlist\`);
                    const itemData = {
                      title,
                      category,
                      locationName,
                      notes,
                      addedFrom: 'manual',
                      createdAt: new Date().toISOString()
                    };
                    await addDoc(shortlistCollRef, itemData);
                    setIsShortlistModalOpen(false);
                    setTitle('');
                    setLocationName('');
                    setNotes('');
                  } catch (error) {
                    console.error("Error adding to shortlist", error);
                  }
                }}
              >
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Idea Title *</label>
                  <input 
                    required
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Visit the Colosseum"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:bg-white outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Category *</label>
                  <select 
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:bg-white outline-none transition"
                  >
                    <option value="activity">Activity</option>
                    <option value="food">Food & Dining</option>
                    <option value="stay">Stay</option>
                    <option value="travel">Travel</option>
                    <option value="logistics">Logistics</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Location Name</label>
                  <input 
                    type="text"
                    value={locationName}
                    onChange={e => setLocationName(e.target.value)}
                    placeholder="e.g. Rome, Italy"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:bg-white outline-none transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
                  <textarea 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Any ideas or tips..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:bg-white outline-none transition resize-none"
                  />
                </div>
                
                <div className="pt-4 mt-2 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsShortlistModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl text-slate-600 font-bold hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-100 transition"
                  >
                    Save Idea
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
`;

content = content.replace(
  "{/* Booking File Import Modal */}",
  modalUI + "\n      {/* Booking File Import Modal */}"
);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
