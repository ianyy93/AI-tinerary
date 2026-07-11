const fs = require('fs');
const path = 'src/components/hub/TripHub.tsx';
let content = fs.readFileSync(path, 'utf8');

const regex = /\{\/\* PATH 2: ANCHOR-FIRST FLOW \*\/\}\n\s*\{creationPath === 'anchor' && \(\n\s*<div className="flex flex-col gap-4 overflow-hidden">[\s\S]*?<\/div>\n\s*\)\}/;

const newPath2 = `{/* PATH 2: ANCHOR-FIRST FLOW */}
              {creationPath === 'anchor' && (
                <div className="flex flex-col gap-4 overflow-hidden">
                  <AnchorExtractionFlow
                    onConfirm={async (events) => {
                      if (events.length === 0) return;
                      const sortedDates = events.map(e => new Date(e.date).getTime()).sort((a,b) => a-b);
                      const calculatedStart = new Date(sortedDates[0]).toISOString().split('T')[0];
                      const calculatedEnd = new Date(sortedDates[sortedDates.length - 1]).toISOString().split('T')[0];

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
                    onCancel={() => setCreationPath('fork')}
                  />
                </div>
              )}`;

content = content.replace(regex, newPath2);
fs.writeFileSync(path, content);
