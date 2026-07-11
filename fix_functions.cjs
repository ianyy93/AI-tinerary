const fs = require('fs');

const path = 'src/components/hub/TripHub.tsx';
let content = fs.readFileSync(path, 'utf8');

const handleExtractRegex = /const handleExtractAnchor = async \(\) => \{[\s\S]*?\};\n/;
content = content.replace(handleExtractRegex, '');

const handleCreateRegex = /const handleCreateAnchorTrip = async \(e: React\.FormEvent\) => \{[\s\S]*?\};\n/;
content = content.replace(handleCreateRegex, '');

// The AnchorExtractionFlow import somehow got lost because it wasn't replaced properly.
content = content.replace(
  "import { \n  MapPin, \n  Calendar, \n  Users, \n  MoreVertical, \n  Plus, \n  Sparkles, \n  Globe2, \n  ArrowRight,\n  MessageSquare,\n  FileText,\n  Settings,\n  Dog\n} from 'lucide-react';",
  "import { \n  MapPin, \n  Calendar, \n  Users, \n  MoreVertical, \n  Plus, \n  Sparkles, \n  Globe2, \n  ArrowRight,\n  MessageSquare,\n  FileText,\n  Settings,\n  Dog\n} from 'lucide-react';\nimport { AnchorExtractionFlow } from './AnchorExtractionFlow';"
);

fs.writeFileSync(path, content);
