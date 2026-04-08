import "dotenv/config";
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Ephemeral token endpoint — API key never leaves the server
app.post("/api/session", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is not set in your .env file.",
    });
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "alloy",
          instructions: `You are an expert emotional analyst and psycholinguist. Your role is to listen carefully to everything the user says and analyze both the semantic content and vocal delivery.

After the user finishes speaking (or pauses for 2+ seconds), respond ONLY with a valid JSON object — no preamble, no explanation, no markdown. The JSON must EXACTLY match this schema:

{
  "valence": <float from -1.0 (very negative) to 1.0 (very positive)>,
  "arousal": <float from 0.0 (completely calm) to 1.0 (extremely activated)>,
  "intensity": <float from 0.0 (flat/muted) to 1.0 (overwhelming)>,
  "dominant_emotion": "<single precise emotion word>",
  "secondary_emotions": ["<emotion>", "<emotion>"],
  "vocal_features": {
    "pace": "<slow|measured|moderate|hurried|rapid|pressured>",
    "hesitation": "<none|minimal|occasional|frequent|excessive>",
    "pitch_variation": "<monotone|narrow|moderate|expressive|erratic>",
    "tension": "<relaxed|mild|moderate|taut|strained>"
  },
  "visual_keywords": ["<word>", "<word>", "<word>"]
}

Be precise and nuanced. Do not use generic emotions — use specific ones like: wistfulness, dread, elation, ambivalence, numbness, longing, relief, unease, fervor, desolation, tenderness, agitation, awe.

For visual_keywords, think in terms of textures, movements, and forms: e.g., "fracture", "bloom", "descent", "turbulence", "crystalline", "dissolve", "pulse", "anchor", "spiral", "melt".

Never say anything other than the JSON object. If the user has not spoken yet or said nothing meaningful, return neutral values:
{"valence":0,"arousal":0.1,"intensity":0.1,"dominant_emotion":"neutral","secondary_emotions":[],"vocal_features":{"pace":"moderate","hesitation":"none","pitch_variation":"narrow","tension":"relaxed"},"visual_keywords":["stillness","void","waiting"]}`,
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 1500,
          },
          modalities: ["text", "audio"],
          input_audio_transcription: {
            model: "whisper-1",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("OpenAI API error:", response.status, errorBody);
      return res.status(response.status).json({
        error: `OpenAI API returned ${response.status}`,
        detail: errorBody,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Session creation failed:", err);
    res.status(500).json({ error: "Failed to create session", detail: err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║   Emotional Translator — Running     ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
