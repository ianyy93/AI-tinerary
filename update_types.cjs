const fs = require('fs');
let content = fs.readFileSync('src/types.ts', 'utf8');
if (!content.includes('ShortlistItem')) {
  content += `
export interface ShortlistItem {
  id: string;
  title: string;
  category: EventCategory;
  locationName: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
  notes?: string;
  addedFrom: 'wizard' | 'copilot' | 'manual';
  createdAt: string;
}
`;
  fs.writeFileSync('src/types.ts', content);
}
