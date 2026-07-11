const fs = require('fs');
let content = fs.readFileSync('src/components/hub/TripHub.tsx', 'utf8');

const regex = /const handleCreateTrip = async[\s\S]*?const handleCreateBrainstormTrip = async/g;
const matches = [...content.matchAll(regex)];
// wait, I don't know if handleCreateBrainstormTrip exists.

