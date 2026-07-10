const fs = require('fs');

let copilot = fs.readFileSync('src/components/copilot/CopilotPanel.tsx', 'utf-8');
copilot = copilot.replace(
  "import { \n  Sparkles", 
  "import { \n  Trash2, Sparkles"
);
// wait, the actual text is:
// import { \n  Sparkles, ShieldCheck, Check, RotateCcw, AlertTriangle, HelpCircle, \n  Dog, ChevronRight, Play, Info, CheckCircle2, ThumbsUp, Layers, HelpCircle as HelpIcon \n} from 'lucide-react';
// it is on a single line or wrapped? Let's just do a string replace:
copilot = copilot.replace("Sparkles, ShieldCheck,", "Sparkles, ShieldCheck, Trash2,");
fs.writeFileSync('src/components/copilot/CopilotPanel.tsx', copilot);

let timeline = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf-8');
timeline = timeline.replace("Plus, Edit2, Trash2,", "Plus, Edit2, Trash2, Sparkles,");
fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', timeline);
