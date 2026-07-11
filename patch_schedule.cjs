const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

// Add shortlistSourceId state
content = content.replace(
  "const [editingEvent, setEditingEvent] = useState<ItineraryEvent | null>(null);",
  "const [editingEvent, setEditingEvent] = useState<ItineraryEvent | null>(null);\n  const [shortlistSourceId, setShortlistSourceId] = useState<string | null>(null);"
);

// Modify openAddModal to reset shortlistSourceId
content = content.replace(
  "setEditingEvent(null);",
  "setEditingEvent(null);\n    setShortlistSourceId(null);"
);

// Add openScheduleModal
const openEditModalRegex = /  \/\/ Open modal for edit/;
content = content.replace(openEditModalRegex, `  const openScheduleModal = (item: any) => {
    if (userRole === 'viewer') return;
    setEditingEvent(null);
    setShortlistSourceId(item.id);
    setTitle(item.title || '');
    setCategory(item.category || 'activity');
    const currentDay = days.length > 0 ? days[0] : null;
    const dateStr = currentDay ? currentDay.dateStr : new Date().toISOString().split('T')[0];
    setStartDateTimeLocal(\`\${dateStr}T09:00\`);
    setEndDateTimeLocal(\`\${dateStr}T10:00\`);
    setLocationName(item.locationName || '');
    setAddress(item.address || '');
    setLat(item.coordinates?.lat?.toString() || '');
    setLng(item.coordinates?.lng?.toString() || '');
    setNotes(item.notes || '');
    setReservationNumber('');
    setDogFriendly(item.dogFriendly || false);
    setFileUrl('');
    setFileName('');
    setEventTravelerIds([]);
    setErrorMsg('');
    setIsModalOpen(true);
  };

  // Open modal for edit`);

// In openEditModal, reset shortlistSourceId
content = content.replace(
  "setEditingEvent(event);",
  "setEditingEvent(event);\n    setShortlistSourceId(null);"
);

// Modify handleSaveEvent to delete from shortlist if shortlistSourceId is set
const handleSaveEventRegex = /const handleSaveEvent = async \(e: React.FormEvent\) => \{[\s\S]*?if \(editingEvent\) \{[\s\S]*?await updateDoc\(docRef, eventData\);\n\s*\} else \{\n\s*await addDoc\(eventsCollRef, eventData\);\n\s*\}/;

const replacementSave = `const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDateTimeLocal || !endDateTimeLocal) {
      setErrorMsg('Start and End times are required');
      return;
    }
    const startObj = DateTime.fromISO(startDateTimeLocal);
    const endObj = DateTime.fromISO(endDateTimeLocal);
    if (!startObj.isValid || !endObj.isValid) {
      setErrorMsg('Invalid date/time format');
      return;
    }
    if (endObj <= startObj) {
      setErrorMsg('End time must be after start time');
      return;
    }

    try {
      const eventData: any = {
        title,
        category,
        startDateTime: startObj.setZone(timezone, { keepLocalTime: true }).toISO(),
        endDateTime: endObj.setZone(timezone, { keepLocalTime: true }).toISO(),
        timezone,
        locationName,
        address,
        notes,
        reservationNumber,
        dogFriendly,
        fileUrl,
        fileName,
        travelerIds: eventTravelerIds,
      };

      if (lat && lng) {
        eventData.coordinates = { lat: parseFloat(lat), lng: parseFloat(lng) };
      }

      const eventsCollRef = collection(db, \`trips/\${trip.id}/events\`);
      if (editingEvent) {
        const docRef = doc(db, \`trips/\${trip.id}/events\`, editingEvent.id);
        await updateDoc(docRef, eventData);
      } else {
        await addDoc(eventsCollRef, eventData);
        if (shortlistSourceId) {
          const shortlistDocRef = doc(db, \`trips/\${trip.id}/shortlist\`, shortlistSourceId);
          await deleteDoc(shortlistDocRef);
        }
      }`;

content = content.replace(/const handleSaveEvent = async \(e: React\.FormEvent\) => \{[\s\S]*?if \(editingEvent\) \{[\s\S]*?await updateDoc\(docRef, eventData\);\n\s*\} else \{\n\s*await addDoc\(eventsCollRef, eventData\);\n\s*\}/, replacementSave);

// And update the TODO trigger in the shortlist UI
content = content.replace(
  "// TODO: trigger scheduling",
  "openScheduleModal(item);"
);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
