const fs = require('fs');
let content = fs.readFileSync('src/components/copilot/CopilotPanel.tsx', 'utf-8');

// 1. Add state for proposedChanges
const statePos = content.indexOf('const [actionError, setActionError] = useState(\'\');');
content = content.slice(0, statePos) + `const [actionError, setActionError] = useState('');
  const [proposedChanges, setProposedChanges] = useState<any[]>([]);\n` + content.slice(statePos + 'const [actionError, setActionError] = useState(\'\');'.length);

// 2. Set proposedChanges on response
const resLogic = `      if (res.success) {
        setActionResponse(res.advice);
        incrementAiUsage();
      } else {
        setActionError(res.error || 'Failed to execute Copilot suggestion.');
      }`;

const newResLogic = `      if (res.success) {
        setActionResponse(res.advice);
        setProposedChanges(res.proposedChanges || []);
        incrementAiUsage();
      } else {
        setActionError(res.error || 'Failed to execute Copilot suggestion.');
      }`;

content = content.replace(resLogic, newResLogic);

// 3. Render proposed changes
const renderPos = content.indexOf('{isExecutingAction ? (');
const uiLogic = `
                <div className="flex flex-col gap-1.5">
                  {renderMarkdownText(actionResponse)}
                  {proposedChanges.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <div className="text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider mb-1">Proposed Changes</div>
                      {proposedChanges.map((change, idx) => (
                        <div key={idx} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5 flex flex-col gap-2 relative overflow-hidden group">
                           {change.type === 'delete' && <div className="absolute inset-0 bg-red-950/20 pointer-events-none" />}
                           {change.type === 'add' && <div className="absolute inset-0 bg-emerald-950/20 pointer-events-none" />}
                           {change.type === 'update' && <div className="absolute inset-0 bg-amber-950/20 pointer-events-none" />}
                           <div className="relative flex justify-between items-start">
                             <div className="flex flex-col">
                               <div className="flex items-center gap-1.5">
                                 <span className={\`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm \${change.type === 'add' ? 'bg-emerald-900 text-emerald-300' : change.type === 'delete' ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300'}\`}>
                                   {change.type}
                                 </span>
                                 <span className="text-xs font-bold text-white">{change.event?.title || 'Event'}</span>
                               </div>
                               {change.type !== 'delete' && (
                                 <span className="text-[10px] text-slate-400 mt-1">{change.event?.startTime} - {change.event?.endTime}</span>
                               )}
                             </div>
                             <div className="flex items-center gap-1">
                               <button 
                                 onClick={() => handleAcceptChange(change, idx)}
                                 className="p-1 rounded bg-slate-800 hover:bg-emerald-900 text-slate-400 hover:text-emerald-400 transition"
                                 title="Accept"
                               >
                                 <Check className="h-3 w-3" />
                               </button>
                               <button 
                                 onClick={() => handleRejectChange(idx)}
                                 className="p-1 rounded bg-slate-800 hover:bg-red-900 text-slate-400 hover:text-red-400 transition"
                                 title="Reject"
                               >
                                 <Trash2 className="h-3 w-3" />
                               </button>
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
`;

content = content.replace(`                <div className="flex flex-col gap-1.5">
                  {renderMarkdownText(actionResponse)}
                </div>`, uiLogic);

// 4. Add handleAcceptChange and handleRejectChange methods
const handlersStr = `  // Day-to-Day Handlers
  const handleAcceptChange = async (change: any, index: number) => {
    if (userRole === 'viewer') return;
    try {
      const currentDay = days.find(d => d.id === selectedDayId);
      if (!currentDay) return;
      const eventsColl = collection(db, \`trips/\${trip.id}/events\`);
      
      let startDateTime = '', endDateTime = '';
      if (change.event && change.event.startTime && change.event.endTime) {
        const startLocal = DateTime.fromFormat(\`\${currentDay.dateStr} \${change.event.startTime}\`, 'yyyy-MM-dd HH:mm', { zone: 'America/New_York' });
        const endLocal = DateTime.fromFormat(\`\${currentDay.dateStr} \${change.event.endTime}\`, 'yyyy-MM-dd HH:mm', { zone: 'America/New_York' });
        let finalEndLocal = endLocal;
        if (endLocal < startLocal) finalEndLocal = endLocal.plus({ days: 1 });
        startDateTime = startLocal.toISO();
        endDateTime = finalEndLocal.toISO();
      }

      if (change.type === 'add') {
        await addDoc(eventsColl, {
          title: change.event.title,
          category: change.event.category || 'activity',
          startDateTime,
          endDateTime,
          timezone: 'America/New_York',
          locationName: change.event.locationName || change.event.title,
          notes: change.event.notes || '',
          dogFriendly: trip.petFriendly,
          source: 'ai-suggested'
        });
      } else if (change.type === 'update' && change.eventId) {
        const docRef = doc(db, \`trips/\${trip.id}/events\`, change.eventId);
        await updateDoc(docRef, {
          title: change.event.title,
          startDateTime,
          endDateTime,
          source: 'ai-suggested'
        });
      } else if (change.type === 'delete' && change.eventId) {
        const docRef = doc(db, \`trips/\${trip.id}/events\`, change.eventId);
        await deleteDoc(docRef);
      }
      
      setProposedChanges(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      console.error(e);
      alert("Failed to apply change");
    }
  };

  const handleRejectChange = (index: number) => {
    setProposedChanges(prev => prev.filter((_, i) => i !== index));
  };
`;

const handlerPos = content.indexOf('  // 4. Interactive Day-by-Day Copilot Actions');
content = content.slice(0, handlerPos) + handlersStr + content.slice(handlerPos);

// Make sure to import updateDoc and deleteDoc in CopilotPanel!
if (!content.includes('updateDoc') && content.includes('import { doc, getDocs, addDoc, collection }')) {
  content = content.replace('import { doc, getDocs, addDoc, collection }', 'import { doc, getDocs, addDoc, collection, updateDoc, deleteDoc }');
}

fs.writeFileSync('src/components/copilot/CopilotPanel.tsx', content);
console.log("Updated CopilotPanel successfully.");
