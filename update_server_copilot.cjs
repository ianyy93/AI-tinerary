const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf-8');

const oldRoute = `app.post('/api/copilot/action', async (req, res) => {
  try {
    const { action, currentEvents, tripDetails } = req.body;
    const ai = getGeminiClient();

    let systemInstruction = "You are an elite travel concierge. Suggest realistic, high-value improvements to the user's specific itinerary. Keep your response brief, scannable, and formatted in clear markdown.";
    let prompt = '';

    if (action === 'reorder') {
      prompt = \`Review the current list of travel stops for this day: \${JSON.stringify(currentEvents)}. Reorder them so that driving or transit distance is minimized, avoiding zig-zagging back and forth across the area. Highlight the proposed new order with time slots, why this order makes physical sense, and travel tips.\`;
    } else if (action === 'connection-check') {
      prompt = \`Review this itinerary day: \${JSON.stringify(currentEvents)}. Flag any tight connections (less than 30 mins between activities), unrealistic driving times, overlapping bookings, or missed logistics. Format as a clean safety checklist.\`;
    } else if (action === 'dog-friendly') {
      prompt = \`Review this day's itinerary: \${JSON.stringify(currentEvents)}. Recommend 2 nearby dog-friendly activities, parks, or café patios near these stops in \${tripDetails?.destination || 'the area'}. Give clear directions and dog policies.\`;
    } else {
      // Replan day
      prompt = \`Create a completely fresh alternative full-day itinerary for this day in \${tripDetails?.destination || 'the destination'}. Original stops were: \${JSON.stringify(currentEvents)}. Provide 4 new, unique local experiences, dining, or secret viewpoints with proposed times and clear notes.\`;
    }

    // Since this is a conversational assistant action, we select the correct tier:
    // "a Flash-Lite–class model handles lightweight, frequent asks (tagging, short rewrites, single-stop suggestions); a Flash-class model is reserved for less frequent, more complex asks (full-day replans)."
    // Let's use gemini-3.5-flash for replans and gemini-3.5-flash (or we can use it for all, since it is exceptionally fast and free).
    const modelToUse = 'gemini-3.5-flash';

    const response = await generateContentWithRetry(ai, {
      model: modelToUse,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    res.json({ success: true, advice: response.text || 'No advice generated.' });
  } catch (error: any) {
    console.error('Copilot Action AI Error:', error);
    res.status(500).json({ success: false, error: error.message || 'AI Copilot Action Failed' });
  }
});`;

const newRoute = `app.post('/api/copilot/action', async (req, res) => {
  try {
    const { action, currentEvents, tripDetails } = req.body;
    const ai = getGeminiClient();

    let systemInstruction = "You are an elite travel concierge. Output your response EXACTLY as a JSON object matching this schema:\\n\\n{ \\"advice\\": \\"Markdown text describing your rationale/response.\\", \\"proposedChanges\\": [ { \\"type\\": \\"update\\" | \\"add\\" | \\"delete\\", \\"eventId\\": \\"optional id of the existing event to modify/delete\\", \\"event\\": { \\"title\\": \\"...\\", \\"category\\": \\"activity|food|stay|travel|logistics\\", \\"startTime\\": \\"HH:mm\\", \\"endTime\\": \\"HH:mm\\", \\"locationName\\": \\"...\\", \\"notes\\": \\"...\\" } } ] }\\n\\nOnly include 'proposedChanges' if your action naturally results in altering the itinerary (like replanning, reordering, or adding dog-friendly spots). For pure advice (like connection-checks), leave proposedChanges empty.";
    let prompt = '';

    if (action === 'reorder') {
      prompt = \`Review the current list of travel stops for this day: \${JSON.stringify(currentEvents)}. Reorder them so that driving or transit distance is minimized, avoiding zig-zagging back and forth across the area. Return 'update' changes with the new start/end times and order.\`;
    } else if (action === 'connection-check') {
      prompt = \`Review this itinerary day: \${JSON.stringify(currentEvents)}. Flag any tight connections (less than 30 mins between activities), unrealistic driving times, overlapping bookings, or missed logistics. Return purely 'advice' as a checklist.\`;
    } else if (action === 'dog-friendly') {
      prompt = \`Review this day's itinerary: \${JSON.stringify(currentEvents)}. Recommend 2 nearby dog-friendly activities, parks, or café patios near these stops in \${tripDetails?.destination || 'the area'}. Give clear directions and dog policies. Add these as 'add' changes.\`;
    } else {
      // Replan day
      prompt = \`Create a completely fresh alternative full-day itinerary for this day in \${tripDetails?.destination || 'the destination'}. Original stops were: \${JSON.stringify(currentEvents)}. Return 'delete' changes for existing items you want to remove, and 'add' changes for the 4 new unique local experiences, dining, or secret viewpoints with proposed times.\`;
    }

    const modelToUse = 'gemini-3.5-flash';

    const response = await generateContentWithRetry(ai, {
      model: modelToUse,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json",
      }
    });

    try {
      const parsed = JSON.parse(response.text || '{}');
      res.json({ success: true, advice: parsed.advice || 'No advice generated.', proposedChanges: parsed.proposedChanges || [] });
    } catch (e) {
      res.json({ success: true, advice: response.text || 'No advice generated.', proposedChanges: [] });
    }
  } catch (error: any) {
    console.error('Copilot Action AI Error:', error);
    res.status(500).json({ success: false, error: error.message || 'AI Copilot Action Failed' });
  }
});`;

if (content.includes(oldRoute.slice(0, 100))) { // Just check first 100 chars to be safe from slight formatting variations
  // Let's do a substring replace
  const startIndex = content.indexOf("app.post('/api/copilot/action', async (req, res) => {");
  const endIndex = content.indexOf("});", startIndex + 100) + 3;
  // wait, the old block ends with \n});
  // a safer way is to replace the whole block by finding the string.
  
  // Actually, I'll use a regex
  const regex = /app\.post\('\/api\/copilot\/action', async \(req, res\) => \{[\s\S]*?\n\}\);/;
  if (regex.test(content)) {
    fs.writeFileSync('server.ts', content.replace(regex, newRoute));
    console.log("Updated server.ts successfully");
  } else {
    console.log("Regex didn't match");
  }
} else {
  console.log("Could not find the block");
}
