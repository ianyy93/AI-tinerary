const fs = require('fs');
let content = fs.readFileSync('src/components/hub/TripHub.tsx', 'utf8');

const targetStr = `  // Anchor-first text extraction handler
    }
    try {
      setErrorMsg('');`;

const replacementStr = `  const handleCreateBrainstormTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDestination.trim()) {
      setErrorMsg('Destination is required for brainstorming ideas.');
      return;
    }
    try {
      setErrorMsg('');`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync('src/components/hub/TripHub.tsx', content);
