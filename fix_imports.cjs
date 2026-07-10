const fs = require('fs');
let content = fs.readFileSync('src/components/copilot/CopilotPanel.tsx', 'utf-8');
content = content.replace("import { collection, addDoc, getDocs } from 'firebase/firestore';", "import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from 'firebase/firestore';");
fs.writeFileSync('src/components/copilot/CopilotPanel.tsx', content);
