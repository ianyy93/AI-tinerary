const fs = require('fs');

const path = 'src/components/hub/TripHub.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "import { \n  MapPin, \n  Calendar, \n  Users, \n  MoreVertical, \n  Plus, \n  Sparkles, \n  Globe2, \n  ArrowRight,\n  MessageSquare,\n  FileText,\n  Settings\n} from 'lucide-react';",
  "import { \n  MapPin, \n  Calendar, \n  Users, \n  MoreVertical, \n  Plus, \n  Sparkles, \n  Globe2, \n  ArrowRight,\n  MessageSquare,\n  FileText,\n  Settings\n} from 'lucide-react';\nimport { AnchorExtractionFlow } from './AnchorExtractionFlow';"
);

// We need to find the step logic in TripHub.tsx.
const oldSection = /\{isExtracting \? \(\n\s*<>\n\s*<div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" \/>\n\s*Analyzing details...\n\s*<\/>\n\s*\) : \(\n\s*<>\n\s*Analyze with AI\n\s*<ArrowRight className="h-3\.5 w-3\.5" \/>\n\s*<\/>\n\s*\)\}\n\s*<\/button>\n\s*<\/div>\n\s*<\/div>\n\s*\) : \(\n\s*\/\* Step 2: Confirm \/ Edit Extracted details \*\/\n\s*<form onSubmit=\{handleCreateAnchorTrip\}[\s\S]*?<\/form>\n\s*\)\}/;

const newSection = `
<AnchorExtractionFlow
  onConfirm={async (events) => {
    // 1. Calculate trip start and end date from events
    if (events.length === 0) return;
    const sortedDates = events.map(e => new Date(e.date).getTime()).sort((a,b) => a-b);
    const calculatedStart = new Date(sortedDates[0]).toISOString().split('T')[0];
    const calculatedEnd = new Date(sortedDates[sortedDates.length - 1]).toISOString().split('T')[0];

    // Create the trip
    try {
      const tripRef = await addDoc(collection(db, 'trips'), {
        title: events[0].title + ' Trip',
        destination: events[0].locationName || 'Unknown Destination',
        startDate: calculatedStart,
        endDate: calculatedEnd,
        tripType: 'mixed',
        coverColor: 'bg-blue-50 border-blue-100 text-blue-700',
        petFriendly: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        roles: { [user.uid]: 'owner' }
      });

      // Add all events
      for (const ev of events) {
        const startDateTime = \`\${ev.date}T\${ev.startTime}\`;
        const endDateTime = \`\${ev.date}T\${ev.endTime}\`;
        
        await addDoc(collection(db, \`trips/\${tripRef.id}/events\`), {
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
          timezone: ev.timezone || 'UTC',
          coordinates: ev.lat && ev.lng ? { lat: ev.lat, lng: ev.lng } : null
        });
      }

      onSelectTrip(tripRef.id);
      setIsCreateOpen(false);
      setCreationPath(null);
    } catch (err: any) {
      console.error("Error saving trip with anchor events:", err);
      setErrorMsg("Failed to save trip. Please try again.");
    }
  }}
  onCancel={() => setCreationPath(null)}
/>
`;

content = content.replace(oldSection, newSection);
fs.writeFileSync(path, content);
