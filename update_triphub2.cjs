const fs = require('fs');
const path = 'src/components/hub/TripHub.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(/const \[confirmedEventCategory, setConfirmedEventCategory\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventTitle, setConfirmedEventTitle\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventDate, setConfirmedEventDate\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventStartTime, setConfirmedEventStartTime\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventEndTime, setConfirmedEventEndTime\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventLocation, setConfirmedEventLocation\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventAddress, setConfirmedEventAddress\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedEventNotes, setConfirmedEventNotes\] = useState.*?;\n/, '');
content = content.replace(/const \[confirmedIsBooked, setConfirmedIsBooked\] = useState.*?;\n/, '');

fs.writeFileSync(path, content);
