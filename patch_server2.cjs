const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

content = content.replace(/lng: \{ type: Type.NUMBER, description: "Longitude" \}/g, 'lng: { type: Type.NUMBER, description: "Longitude" }, addToShortlist: { type: Type.BOOLEAN, description: "Set to true if this is a great idea but you do not have a strong basis for placing it on a specific day or time, or if the user implies just brainstorming. If true, it will be routed to the Shortlist instead of the timeline. Leave startTime and endTime empty if this is true." }');

fs.writeFileSync('server.ts', content);
