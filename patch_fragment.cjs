const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

const regex = /\{days\.length > 0 && \(\n\s*<button\n\s*onClick=\{\(\) => onSelectDay\('shortlist'\)\}/;
content = content.replace(regex, "{days.length > 0 && (\n          <>\n          <button\n            onClick={() => onSelectDay('shortlist')}");

const staysTabRegex = /All bookings\n\s*<\/div>\n\s*<\/button>\n\s*\)\}/;
content = content.replace(staysTabRegex, "All bookings\n            </div>\n          </button>\n          </>\n        )}");

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
