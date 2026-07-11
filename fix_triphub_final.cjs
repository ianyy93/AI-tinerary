const fs = require('fs');
let content = fs.readFileSync('src/components/hub/TripHub.tsx', 'utf8');

const regex = /\/\/ Anchor-first text extraction handler[\s\S]*?\} catch \(e: any\) \{\n\s*console\.error\("Error creating trip:", e\);\n\s*setErrorMsg\(e\.message \|\| 'Error creating trip'\);\n\s*\}\n\s*\};\n\s*\/\/ Anchor-first text extraction handler\n\s*\}\n\s*try \{\n\s*setErrorMsg\(''\);\n\s*const userIdentifier = user\.email \|\| user\.uid;/g;

content = content.replace(/\/\/ Anchor-first text extraction handler[\s\S]*?\} catch \(e: any\) \{\n\s*console\.error\("Error creating trip:", e\);\n\s*setErrorMsg\(e\.message \|\| 'Error creating trip'\);\n\s*\}\n\s*\};\n\s*\/\/ Anchor-first text extraction handler\n\s*\}\n\s*try \{\n\s*setErrorMsg\(''\);\n\s*const userIdentifier = user\.email \|\| user\.uid;/, 
`  // Brainstorm-first creator handler
  const handleCreateBrainstormTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDestination.trim()) {
      setErrorMsg('Destination is required for brainstorming ideas.');
      return;
    }
    try {
      setErrorMsg('');
      const userIdentifier = user.email || user.uid;`);

fs.writeFileSync('src/components/hub/TripHub.tsx', content);
