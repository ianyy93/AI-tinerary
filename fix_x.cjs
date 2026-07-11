const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

content = content.replace(
  "Compass,\\n  Image as ImageIcon,\\n  Sparkles\\n} from 'lucide-react';",
  "Compass,\\n  Image as ImageIcon,\\n  Sparkles,\\n  X\\n} from 'lucide-react';"
);
// I used literal regex replacement earlier which might have failed, so let me do a global replace for X
content = content.replace("Compass,", "Compass, X,");

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
