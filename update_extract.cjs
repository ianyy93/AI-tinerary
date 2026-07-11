const fs = require('fs');

const path = 'server.ts';
let content = fs.readFileSync(path, 'utf8');

const oldRegex = /app\.post\('\/api\/copilot\/extract-anchor', async \(req, res\) => \{[\s\S]*?res\.json\(\{ success: true, data: JSON\.parse\(response\.text \|\| '\{\}'\) \}\);\n\s*\} catch \(error: any\) \{\n\s*console\.error\('Anchor Extraction Error:', error\);\n\s*res\.status\(500\)\.json\(\{ success: false, error: error\.message \|\| 'Failed to extract details from text' \}\);\n\s*\}\n\}\);/;

const newLogic = `app.post('/api/copilot/extract-anchor', async (req, res) => {
  try {
    const { anchorText } = req.body;
    if (!anchorText) {
      return res.status(400).json({ success: false, error: 'Anchor text is required.' });
    }

    const ai = getGeminiClient();
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "A suggested trip title (e.g. 'Denver Wedding Trip')" },
        destination: { type: Type.STRING, description: "Suggested destination city and state/country" },
        startDate: { type: Type.STRING, description: "Suggested start date of the trip in YYYY-MM-DD format. If the user specifies explicit travel/booking dates, use those exact dates as-is with no padding/buffer days. Only pad/add buffer days around the anchor event when the anchor is vague and real travel dates aren't specified." },
        endDate: { type: Type.STRING, description: "Suggested end date of the trip in YYYY-MM-DD format. If the user specifies explicit travel/booking dates, use those exact dates as-is with no padding/buffer days. Only pad/add buffer days around the anchor event when the anchor is vague and real travel dates aren't specified." },
        anchorEvents: {
          type: Type.ARRAY,
          description: "Details of the fixed/booked anchor events",
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Title of the anchor event (e.g. 'Sister's Wedding Ceremony')" },
              category: { type: Type.STRING, description: "The category that best fits the event. Must be exactly one of: 'stay', 'travel', 'activity', 'food', 'logistics'" },
              date: { type: Type.STRING, description: "The specific date of this event in YYYY-MM-DD format" },
              startTime: { type: Type.STRING, description: "Start time in HH:MM format (24h), e.g. '17:00'. Use a reasonable guess if not specified." },
              endTime: { type: Type.STRING, description: "End time in HH:MM format (24h), e.g. '21:00'. Use a reasonable guess if not specified." },
              locationName: { type: Type.STRING, description: "Name of the venue/location" },
              address: { type: Type.STRING, description: "Physical address of the venue if known or guessable" },
              notes: { type: Type.STRING, description: "Brief notes about the event" },
              lat: { type: Type.NUMBER, description: "Latitude coordinate of this location" },
              lng: { type: Type.NUMBER, description: "Longitude coordinate of this location" },
              isBooked: { type: Type.BOOLEAN, description: "True if the text implies this event is actually booked/confirmed (e.g. reservation numbers, 'I booked a hotel', 'got my tickets'). False if it is just a fixed date/event but not explicitly confirmed/booked yet." },
              timezone: { type: Type.STRING, description: "The IANA timezone identifier (e.g. 'America/Denver', 'Asia/Tokyo', 'Europe/Paris', 'America/New_York') inferred from the destination or location of the event." }
            },
            required: ["title", "category", "date", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng", "isBooked", "timezone"]
          }
        }
      },
      required: ["title", "destination", "startDate", "endDate", "anchorEvents"]
    };

    const prompt = \`
Today's date is \${todayStr}. You are an elite trip planner.
Analyze the following text/email/confirmation and extract the details.
Return exactly standard JSON matching the requested schema. Generate realistic lat/lng coordinates.
If the text contains multiple bookings (e.g., a flight AND a hotel), extract them as separate events in the anchorEvents array.

Input Text:
"\${anchorText}"
\`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an elite, local-expert travel planning assistant. Return standard JSON matching the schema.",
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.1,
      },
    });

    res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (error: any) {
    console.error('Anchor Extraction Error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to extract details from text' });
  }
});`;

content = content.replace(oldRegex, newLogic);
fs.writeFileSync(path, content);
