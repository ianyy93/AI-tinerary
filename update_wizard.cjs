const fs = require('fs');

const path = 'server.ts';
let content = fs.readFileSync(path, 'utf8');

const oldRegex = /app\.post\('\/api\/copilot\/wizard-step', async \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ success: false, error: error\.message \|\| 'AI Generation Failed' \}\);\n\s*\}\n\}\);/;

const newLogic = `app.post('/api/copilot/wizard-step', async (req, res) => {
  try {
    const { step, destination, tripType, petFriendly, startDate, endDate, previousData, customPrompt, existingEvents } = req.body;
    const ai = getGeminiClient();

    let stepPrompt = '';
    let responseSchema: any = {};

    const durationDays = Math.max(
      1,
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    const contextBlock = \`
TRIP CONTEXT:
- Destination: \${destination}
- Dates: \${startDate} to \${endDate} (\${durationDays} days)
- Trip Type: \${tripType}
- Pet Friendly: \${petFriendly ? 'Yes, must accommodate dogs.' : 'No.'}
- Existing Itinerary Events (Anchors): \${existingEvents && existingEvents.length > 0 ? JSON.stringify(existingEvents) : 'None yet.'}
- Previous Copilot Suggestions: \${previousData ? JSON.stringify(previousData) : 'None yet.'}
\`;

    if (step === 1) {
      // Step 1: Accommodations/Stays
      stepPrompt = \`\${contextBlock}
TASK: Suggest 2 gorgeous hotel, resort, or accommodation options for this trip.
CONSTRAINTS:
1. Provide options with great vibes and visual style (e.g., boutique, luxury, or unique local stays).
2. Do NOT specify check-in or check-out times; leave them untimed or use broad descriptions.
3. If pet-friendly, explicitly mention the pet amenities or nearby dog parks.\`;
      responseSchema = {
        type: Type.ARRAY,
        description: "List of recommended accommodations",
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Name of the stay (e.g. 'Sedona Red Rock Lodge')" },
            locationName: { type: Type.STRING, description: "Name of the hotel or area" },
            address: { type: Type.STRING, description: "Detailed physical address (real or highly realistic)" },
            notes: { type: Type.STRING, description: "Why we chose this, what makes it special, and any pet-friendly amenities if applicable" },
            lat: { type: Type.NUMBER, description: "Latitude coordinate of this location" },
            lng: { type: Type.NUMBER, description: "Longitude coordinate of this location" }
          },
          required: ["title", "locationName", "address", "notes", "lat", "lng"]
        }
      };
    } else if (step === 2) {
      // Step 2: Morning Activities
      stepPrompt = \`\${contextBlock}
TASK: Suggest exactly 1 spectacular morning activity per day.
CONSTRAINTS:
1. Schedule between 09:00 and 12:00.
2. Avoid scheduling conflicts with any existing morning events (anchors) provided in the context.
3. Focus on active exploration, hikes, or iconic historical sights.\`;
      responseSchema = {
        type: Type.ARRAY,
        description: "Morning activities list",
        items: {
          type: Type.OBJECT,
          properties: {
            dayIndex: { type: Type.INTEGER, description: "Zero-based index of the day (0 to " + (durationDays - 1) + ")" },
            title: { type: Type.STRING, description: "Name of the morning activity (e.g., 'Sunrise Hike at Cathedral Rock')" },
            startTime: { type: Type.STRING, description: "Start time in HH:MM format (e.g. '09:00')" },
            endTime: { type: Type.STRING, description: "End time in HH:MM format (e.g. '11:30')" },
            locationName: { type: Type.STRING, description: "Name of the venue or trailhead" },
            address: { type: Type.STRING, description: "Physical address" },
            notes: { type: Type.STRING, description: "Tips, packing advice, or dog-friendly notes if applicable" },
            lat: { type: Type.NUMBER, description: "Latitude coordinate" },
            lng: { type: Type.NUMBER, description: "Longitude coordinate" }
          },
          required: ["dayIndex", "title", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng"]
        }
      };
    } else if (step === 3) {
      // Step 3: Afternoon Activities
      stepPrompt = \`\${contextBlock}
TASK: Suggest exactly 1 incredible afternoon activity or sight per day.
CONSTRAINTS:
1. Schedule between 14:00 and 17:00.
2. Ensure realistic travel times from the morning activities and avoid conflicts with existing afternoon anchor events.
3. Focus on art centers, leisure walks, shopping, or local secrets.\`;
      responseSchema = {
        type: Type.ARRAY,
        description: "Afternoon activities list",
        items: {
          type: Type.OBJECT,
          properties: {
            dayIndex: { type: Type.INTEGER, description: "Zero-based index of the day (0 to " + (durationDays - 1) + ")" },
            title: { type: Type.STRING, description: "Name of afternoon activity (e.g., 'Tlaquepaque Arts & Shopping')" },
            startTime: { type: Type.STRING, description: "Start time in HH:MM format (e.g. '14:00')" },
            endTime: { type: Type.STRING, description: "End time in HH:MM format (e.g. '16:30')" },
            locationName: { type: Type.STRING, description: "Name of the venue" },
            address: { type: Type.STRING, description: "Physical address" },
            notes: { type: Type.STRING, description: "Afternoon details, entry fees, or dog policies" },
            lat: { type: Type.NUMBER, description: "Latitude" },
            lng: { type: Type.NUMBER, description: "Longitude" }
          },
          required: ["dayIndex", "title", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng"]
        }
      };
    } else if (step === 4) {
      // Step 4: Evening Activities
      stepPrompt = \`\${contextBlock}
TASK: Suggest exactly 1 evening wind-down activity, sunset point, or cozy leisure spot per day.
CONSTRAINTS:
1. Schedule between 18:30 and 21:00.
2. Avoid conflicts with existing evening anchor events.
3. Focus on scenic viewpoints, twilight strolls, or relaxing lounges.\`;
      responseSchema = {
        type: Type.ARRAY,
        description: "Evening activities list",
        items: {
          type: Type.OBJECT,
          properties: {
            dayIndex: { type: Type.INTEGER, description: "Zero-based index of the day (0 to " + (durationDays - 1) + ")" },
            title: { type: Type.STRING, description: "Name of evening activity (e.g., 'Sunset Watching at Airport Mesa')" },
            startTime: { type: Type.STRING, description: "Start time in HH:MM format (e.g. '18:30')" },
            endTime: { type: Type.STRING, description: "End time in HH:MM format (e.g. '20:00')" },
            locationName: { type: Type.STRING, description: "Name of venue" },
            address: { type: Type.STRING, description: "Physical address" },
            notes: { type: Type.STRING, description: "Why this sunset/spot is magical" },
            lat: { type: Type.NUMBER, description: "Latitude" },
            lng: { type: Type.NUMBER, description: "Longitude" }
          },
          required: ["dayIndex", "title", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng"]
        }
      };
    } else if (step === 5) {
      // Step 5: Dining & Food
      stepPrompt = \`\${contextBlock}
TASK: Suggest 2 high-quality local dining recommendations (one Lunch around 12:30, one Dinner around 19:30) per day.
CONSTRAINTS:
1. Avoid conflicts with existing dining or event anchors.
2. Recommend specific authentic local spots or highly-rated restaurants.
3. If pet-friendly, ensure they have outdoor dog-friendly patios.\`;
      responseSchema = {
        type: Type.ARRAY,
        description: "Dining recommendations list",
        items: {
          type: Type.OBJECT,
          properties: {
            dayIndex: { type: Type.INTEGER, description: "Zero-based index of the day (0 to " + (durationDays - 1) + ")" },
            title: { type: Type.STRING, description: "Name of restaurant recommendation (e.g., 'Lunch: Wildflower Bread Company')" },
            startTime: { type: Type.STRING, description: "Time in HH:MM format" },
            endTime: { type: Type.STRING, description: "Time in HH:MM format" },
            locationName: { type: Type.STRING, description: "Restaurant Name" },
            address: { type: Type.STRING, description: "Physical address" },
            notes: { type: Type.STRING, description: "Recommended dish, vibe, dog patio info if applicable" },
            lat: { type: Type.NUMBER, description: "Latitude" },
            lng: { type: Type.NUMBER, description: "Longitude" }
          },
          required: ["dayIndex", "title", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng"]
        }
      };
    } else {
      // Step 6: Logistics / Travel / Extras
      stepPrompt = \`\${contextBlock}
TASK: Suggest 1 logistics or travel segment per day (e.g., airport transfer on Day 1, scenic drives on mid-days, return departure logistics on the final day).
CONSTRAINTS:
1. Ensure they make sense with the existing itinerary and anchors.
2. Provide practical advice or travel hacks.
3. Keep times realistic for the route.\`;
      responseSchema = {
        type: Type.ARRAY,
        description: "Logistics and travel items",
        items: {
          type: Type.OBJECT,
          properties: {
            dayIndex: { type: Type.INTEGER, description: "Zero-based index of the day" },
            title: { type: Type.STRING, description: "Logistics event (e.g., 'Airport Transfer to Sedona')" },
            startTime: { type: Type.STRING, description: "Time in HH:MM format" },
            endTime: { type: Type.STRING, description: "Time in HH:MM format" },
            locationName: { type: Type.STRING, description: "Service or route name" },
            address: { type: Type.STRING, description: "Location detail" },
            notes: { type: Type.STRING, description: "Practical advice or dog rules if driving/flying" },
            lat: { type: Type.NUMBER, description: "Latitude" },
            lng: { type: Type.NUMBER, description: "Longitude" }
          },
          required: ["dayIndex", "title", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng"]
        }
      };
    }

    if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim()) {
      stepPrompt += \`\n\nCRITICAL USER CUSTOM PREFERENCES/REQUEST: Please tailor and adjust the generated recommendations to strongly align with and satisfy this specific prompt/request: "\${customPrompt.trim()}"\`;
    }

    let response;
    try {
      response = await generateContentWithRetry(ai, {
        model: 'gemini-3.5-flash',
        contents: stepPrompt,
        config: {
          systemInstruction: "You are an elite, local-expert travel planning assistant. Generate realistic coordinates (latitude and longitude) that are within or very close to the destination city/region so the map is perfectly aligned. Do not hallucinate invalid coordinate numbers. Return standard JSON matching the requested schema exactly.",
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.7,
          tools: [{ googleSearch: {} }]
        },
      });
    } catch (error: any) {
      const errMsg = (error?.message || '').toLowerCase();
      const code = error?.code || error?.status || 0;
      if (errMsg.includes('quota') || errMsg.includes('exhausted') || errMsg.includes('429') || errMsg.includes('grounding') || code === 429) {
        console.warn("Grounding failed due to quota/exhausted. Retrying without tools array.");
        response = await generateContentWithRetry(ai, {
          model: 'gemini-3.5-flash',
          contents: stepPrompt,
          config: {
            systemInstruction: "You are an elite, local-expert travel planning assistant. Generate realistic coordinates (latitude and longitude) that are within or very close to the destination city/region so the map is perfectly aligned. Do not hallucinate invalid coordinate numbers. Return standard JSON matching the requested schema exactly.",
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
            temperature: 0.7,
          },
        });
      } else {
        throw error;
      }
    }

    res.json({ success: true, data: JSON.parse(response.text || '[]') });
  } catch (error: any) {
    console.error('Wizard Step AI Error:', error);
    res.status(500).json({ success: false, error: error.message || 'AI Generation Failed' });
  }
});`;

content = content.replace(oldRegex, newLogic);
fs.writeFileSync(path, content);
