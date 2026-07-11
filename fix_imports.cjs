const fs = require('fs');

const path1 = 'src/components/hub/TripHub.tsx';
let content1 = fs.readFileSync(path1, 'utf8');
content1 = content1.replace(
  "import { inferTimezone } from '../../utils/timezone';",
  "import { inferTimezone } from '../../utils/timezone';\nimport { AnchorExtractionFlow } from './AnchorExtractionFlow';"
);
fs.writeFileSync(path1, content1);

const path2 = 'src/components/timeline/ItineraryTimeline.tsx';
let content2 = fs.readFileSync(path2, 'utf8');
content2 = content2.replace(
  "import { inferTimezone } from '../../utils/timezone';",
  "import { inferTimezone } from '../../utils/timezone';\nimport { AnchorExtractionFlow } from '../hub/AnchorExtractionFlow';"
);
fs.writeFileSync(path2, content2);
