const fs = require('fs');
const path = 'src/components/timeline/ItineraryTimeline.tsx';
let content = fs.readFileSync(path, 'utf8');

// Remove AI Email Parser from modal
const aiParserRegex = /\{\(category === 'stay' \|\| category === 'travel'\) && \(\n\s*<div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex flex-col gap-2">[\s\S]*?<\/div>\n\s*\)\}/;
content = content.replace(aiParserRegex, '');

// Also remove `handleParseEmail` state and function
const parseStateRegex = /const \[emailText, setEmailText\] = useState\(''\);\n\s*const \[isParsingEmail, setIsParsingEmail\] = useState\(false\);/;
content = content.replace(parseStateRegex, '');

const handleParseRegex = /const handleParseEmail = async \(\) => \{[\s\S]*?\};\n/;
content = content.replace(handleParseRegex, '');

fs.writeFileSync(path, content);
