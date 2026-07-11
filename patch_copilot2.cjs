const fs = require('fs');
let content = fs.readFileSync('src/components/copilot/CopilotPanel.tsx', 'utf8');

const regex = /for \(const stay of acceptedItems\) \{[\s\S]*?await addDoc\(staysColl, \{[\s\S]*?title: \`Check-out: \$\{stay\.title\}\`,[\s\S]*?source: 'wizard',\n\s*\}\);\n\s*\}/;

const replacement = `for (const stay of acceptedItems) {
          if (stay.addToShortlist) {
            const shortlistColl = collection(db, \`trips/\${trip.id}/shortlist\`);
            await addDoc(shortlistColl, {
              title: stay.title,
              category: 'stay',
              locationName: stay.locationName,
              address: stay.address,
              notes: stay.notes,
              coordinates: { lat: stay.lat, lng: stay.lng },
              dogFriendly: trip.petFriendly,
              addedFrom: 'wizard',
              createdAt: new Date().toISOString()
            });
            continue;
          }

          const stayTz = inferTimezone(stay.locationName || trip.destination);
          
          const reservationNumber = \`RES-\${Math.random().toString(36).substr(2, 6).toUpperCase()}\`;

          const startLocalIn = DateTime.fromFormat(\`\${firstDay.dateStr} 22:00\`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          const endLocalIn = DateTime.fromFormat(\`\${firstDay.dateStr} 22:30\`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          await addDoc(staysColl, {
            title: \`Check-in: \${stay.title}\`,
            category: 'stay',
            startDateTime: startLocalIn.toISO(),
            endDateTime: endLocalIn.toISO(),
            timezone: stayTz,
            locationName: stay.locationName,
            address: stay.address,
            notes: stay.notes,
            coordinates: { lat: stay.lat, lng: stay.lng },
            dogFriendly: trip.petFriendly,
            reservationNumber,
            timeUnknown: true,
            source: 'wizard',
          });

          const startLocalOut = DateTime.fromFormat(\`\${lastDay.dateStr} 08:00\`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          const endLocalOut = DateTime.fromFormat(\`\${lastDay.dateStr} 08:30\`, 'yyyy-MM-dd HH:mm', { zone: stayTz });
          await addDoc(staysColl, {
            title: \`Check-out: \${stay.title}\`,
            category: 'stay',
            startDateTime: startLocalOut.toISO(),
            endDateTime: endLocalOut.toISO(),
            timezone: stayTz,
            locationName: stay.locationName,
            address: stay.address,
            notes: stay.notes,
            coordinates: { lat: stay.lat, lng: stay.lng },
            dogFriendly: trip.petFriendly,
            reservationNumber,
            timeUnknown: true,
            source: 'wizard',
          });
        }`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/copilot/CopilotPanel.tsx', content);
