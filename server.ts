/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper to get GoogleGenAI client (lazy initialization)
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required but missing. Please set it in Settings > Secrets.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * A robust wrapper for calling Gemini API with automatic exponential backoff retry on transient 503/429 errors,
 * and automatic fallback to a secondary model if the primary model is busy or unavailable.
 */
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 3
): Promise<any> {
  let delay = 1000;
  // Fallback chain: Primary -> gemini-flash-latest -> gemini-3.1-flash-lite
  const models = Array.from(new Set([params.model, 'gemini-flash-latest', 'gemini-3.1-flash-lite']));

  for (const model of models) {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        console.log(`Calling Gemini API (model: ${model}, attempt: ${attempt + 1}/${maxRetries})...`);
        const response = await ai.models.generateContent({
          ...params,
          model: model,
        });
        return response;
      } catch (err: any) {
        attempt++;
        const message = err?.message || err?.toString() || '';
        const status = String(err?.status || '').toLowerCase();
        const code = err?.code || 0;
        const errMsgLower = message.toLowerCase();

        console.error(`Gemini API call failed (model: ${model}, attempt: ${attempt}, error: ${message})`);

        // Check if the error indicates the model is overloaded or unavailable (503 / High Demand)
        const isOverloaded = 
          code === 503 || 
          status.includes('unavailable') || 
          errMsgLower.includes('unavailable') || 
          errMsgLower.includes('high demand') || 
          errMsgLower.includes('overloaded');

        if (isOverloaded) {
          console.warn(`Model ${model} is overloaded or unavailable. Falling back immediately to the next model.`);
          break; // Break the retry loop for this model, moving to the next model in the list
        }

        if (attempt < maxRetries) {
          console.log(`Waiting ${delay}ms before next retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
        } else {
          console.warn(`Exhausted all ${maxRetries} attempts for model ${model}.`);
          break;
        }
      }
    }
  }
  throw new Error('All Gemini API models and retry attempts have been exhausted. Please try again in a few moments.');
}

// Endpoint to extract anchor trip details from free-text
app.post('/api/copilot/extract-anchor', async (req, res) => {
  try {
    const { anchorText } = req.body;
    if (!anchorText) {
      return res.status(400).json({ success: false, error: 'Anchor text is required.' });
    }

    const ai = getGeminiClient();
    const today = new Date('2026-07-09'); // Use the current local date provided in system constraints

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "A suggested trip title (e.g. 'Denver Wedding Trip')" },
        destination: { type: Type.STRING, description: "Suggested destination city and state/country" },
        startDate: { type: Type.STRING, description: "Suggested start date of the trip in YYYY-MM-DD format, padded 2-3 days before the anchor event" },
        endDate: { type: Type.STRING, description: "Suggested end date of the trip in YYYY-MM-DD format, padded 2-3 days after the anchor event" },
        anchorEvent: {
          type: Type.OBJECT,
          description: "Details of the fixed/booked anchor event itself",
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
            isBooked: { type: Type.BOOLEAN, description: "True if the text implies this event is actually booked/confirmed (e.g. reservation numbers, 'I booked a hotel', 'got my tickets'). False if it is just a fixed date/event but not explicitly confirmed/booked yet." }
          },
          required: ["title", "category", "date", "startTime", "endTime", "locationName", "address", "notes", "lat", "lng", "isBooked"]
        }
      },
      required: ["title", "destination", "startDate", "endDate", "anchorEvent"]
    };

    const prompt = `You are an expert travel assistant. Analyze the user text below describing a fixed anchor event (like a wedding, concert, reservation) and extract the trip title, destination, suggested padded date range, and the details of the anchor event. 
The current date is July 9, 2026. Use this to resolve relative date descriptions like 'next month', 'third week of September', 'this weekend', etc.
Make sure you pad the overall trip startDate/endDate with 2-3 buffer days around the anchor event date. If the user mentions multiple days or a stay, cover those days and add buffer days.

User Text: "${anchorText}"`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an elite, local-expert travel planning assistant. Generate realistic coordinates (latitude and longitude) that are within or very close to the destination city/region so the map is perfectly aligned. Do not hallucinate invalid coordinate numbers. Return standard JSON matching the requested schema exactly.",
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.2, // Lower temperature for more factual extraction
      },
    });

    res.json({ success: true, data: JSON.parse(response.text || '{}') });
  } catch (error: any) {
    console.error('Extract Anchor AI Error:', error);
    res.status(500).json({ success: false, error: error.message || 'AI Extraction Failed' });
  }
});

// 1. Wizard Step API endpoint
app.post('/api/copilot/wizard-step', async (req, res) => {
  try {
    const { step, destination, tripType, petFriendly, startDate, endDate, previousData } = req.body;
    const ai = getGeminiClient();

    let stepPrompt = '';
    let responseSchema: any = {};

    const durationDays = Math.max(
      1,
      Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    if (step === 1) {
      // Step 1: Accommodations/Stays
      stepPrompt = `Suggest 2 gorgeous hotel, resort, or accommodation options for a ${durationDays}-day trip to ${destination}. The trip type is ${tripType}${petFriendly ? ' and it must be pet-friendly (dog-friendly) with details on why.' : ''}. Give details about the vibe, visual style, and highlight custom reservation notes.`;
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
      stepPrompt = `Suggest exactly 1 spectacular morning activity per day for a ${durationDays}-day trip to ${destination}. The trip type is ${tripType}.${petFriendly ? ' Focus on outdoor or dog-friendly spots and sights.' : ''} Keep the start time around 09:00 and end around 12:00. Previous stays selected: ${JSON.stringify(previousData?.stays || [])}`;
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
      stepPrompt = `Suggest exactly 1 incredible afternoon activity or sight per day for a ${durationDays}-day trip to ${destination}. The trip type is ${tripType}.${petFriendly ? ' Must be dog-friendly.' : ''} Schedule this around 14:00 to 17:00. Integrate with these morning activities: ${JSON.stringify(previousData?.morningActivities || [])}`;
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
      stepPrompt = `Suggest exactly 1 evening wind-down activity, sunset point, or cozy leisure spot per day for a ${durationDays}-day trip to ${destination}. Schedule around 18:30 to 21:00. ${petFriendly ? 'Must be pet friendly.' : ''} Keep in mind these previous choices: ${JSON.stringify(previousData || {})}`;
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
      stepPrompt = `Suggest 2 high-quality local dining recommendations (e.g., one Lunch around 12:30, one Dinner around 19:30) per day for a ${durationDays}-day trip to ${destination}. ${petFriendly ? 'Both dining spots must feature outdoor dog-friendly patios.' : ''} Current plan overview: ${JSON.stringify(previousData || {})}`;
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
      stepPrompt = `Suggest 1 logistics or travel segment per day (e.g., airport transfer on Day 1, scenic drives on mid-days, return departure logistics on the final day) for ${destination}. Trip Type is ${tripType}. Let's slot this in around the existing plan: ${JSON.stringify(previousData || {})}`;
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

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: stepPrompt,
      config: {
        systemInstruction: "You are an elite, local-expert travel planning assistant. Generate realistic coordinates (latitude and longitude) that are within or very close to the destination city/region so the map is perfectly aligned. Do not hallucinate invalid coordinate numbers. Return standard JSON matching the requested schema exactly.",
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
        temperature: 0.7,
      },
    });

    res.json({ success: true, data: JSON.parse(response.text || '[]') });
  } catch (error: any) {
    console.error('Wizard Step AI Error:', error);
    res.status(500).json({ success: false, error: error.message || 'AI Generation Failed' });
  }
});

// 2. Interactive Day-by-Day Copilot Actions endpoint
app.post('/api/copilot/action', async (req, res) => {
  try {
    const { action, currentEvents, tripDetails } = req.body;
    const ai = getGeminiClient();

    let systemInstruction = "You are an elite travel concierge. Suggest realistic, high-value improvements to the user's specific itinerary. Keep your response brief, scannable, and formatted in clear markdown.";
    let prompt = '';

    if (action === 'reorder') {
      prompt = `Review the current list of travel stops for this day: ${JSON.stringify(currentEvents)}. Reorder them so that driving or transit distance is minimized, avoiding zig-zagging back and forth across the area. Highlight the proposed new order with time slots, why this order makes physical sense, and travel tips.`;
    } else if (action === 'connection-check') {
      prompt = `Review this itinerary day: ${JSON.stringify(currentEvents)}. Flag any tight connections (less than 30 mins between activities), unrealistic driving times, overlapping bookings, or missed logistics. Format as a clean safety checklist.`;
    } else if (action === 'dog-friendly') {
      prompt = `Review this day's itinerary: ${JSON.stringify(currentEvents)}. Recommend 2 nearby dog-friendly activities, parks, or café patios near these stops in ${tripDetails?.destination || 'the area'}. Give clear directions and dog policies.`;
    } else {
      // Replan day
      prompt = `Create a completely fresh alternative full-day itinerary for this day in ${tripDetails?.destination || 'the destination'}. Original stops were: ${JSON.stringify(currentEvents)}. Provide 4 new, unique local experiences, dining, or secret viewpoints with proposed times and clear notes.`;
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
});

// Vite middleware configuration for full-stack integration
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI-tinerary full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
