const fs = require('fs');
let content = fs.readFileSync('src/components/copilot/CopilotPanel.tsx', 'utf8');

const regex = /await addDoc\(eventsColl, \{\n\s*title: item.title,[\s\S]*?source: 'wizard',\n\s*\}\);/;

const replacement = `if (item.addToShortlist) {
              const shortlistColl = collection(db, \`trips/\${trip.id}/shortlist\`);
              await addDoc(shortlistColl, {
                title: item.title,
                category: category,
                locationName: item.locationName,
                address: item.address,
                notes: item.notes,
                coordinates: { lat: item.lat, lng: item.lng },
                dogFriendly: trip.petFriendly,
                addedFrom: 'wizard',
                createdAt: new Date().toISOString()
              });
            } else {
              await addDoc(eventsColl, {
                title: item.title,
                category: category,
                startDateTime: startLocal.toISO(),
                endDateTime: finalEndLocal.toISO(),
                timezone: itemTz,
                locationName: item.locationName,
                address: item.address,
                notes: item.notes,
                coordinates: { lat: item.lat, lng: item.lng },
                dogFriendly: trip.petFriendly,
                source: 'wizard',
              });
            }`;

content = content.replace(regex, replacement);

fs.writeFileSync('src/components/copilot/CopilotPanel.tsx', content);
