const fs = require('fs');
let content = fs.readFileSync('src/components/trip/TripView.tsx', 'utf-8');

const statePos = content.indexOf('  const [editPetFriendly, setEditPetFriendly] = useState(false);');
content = content.slice(0, statePos) + `  const [editTripType, setEditTripType] = useState<TripType>('mixed');\n` + content.slice(statePos);

const effectPos = content.indexOf('      setEditPetFriendly(trip.petFriendly || false);');
content = content.slice(0, effectPos) + `      setEditTripType(trip.tripType || 'mixed');\n` + content.slice(effectPos);

const savePos = content.indexOf('        petFriendly: editPetFriendly,');
content = content.slice(0, savePos) + `        tripType: editTripType,\n` + content.slice(savePos);

const uiPos = content.indexOf('                <div className="flex flex-col gap-1.5 pt-2">');
const newUI = `                <div className="flex flex-col gap-1.5 pt-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Trip Type</label>
                  <select 
                    value={editTripType}
                    onChange={(e) => setEditTripType(e.target.value as TripType)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 transition"
                  >
                    <option value="mixed">Mixed Transit</option>
                    <option value="road-trip">Road Trip</option>
                    <option value="flights">Flights & Hotels</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 pt-2">`;
content = content.replace('                <div className="flex flex-col gap-1.5 pt-2">', newUI);

fs.writeFileSync('src/components/trip/TripView.tsx', content);
