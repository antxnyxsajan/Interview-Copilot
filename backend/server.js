import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import dotenv from 'dotenv';
import { parseAndStoreResume } from './resume-parser.js';
import { setupAudioStream } from './audio-stream.js';
import { processTranscript } from './ai-engine.js';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('AI Interview Copilot Backend is running! 🚀'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));
app.use(express.json());

// Endpoint to upload and parse the PDF resume
app.post('/upload-resume', upload.single('resume'), async (req, res) => {
    try {
        await parseAndStoreResume(req.file.path);
        res.json({ success: true, message: 'Resume processed and embedded for RAG.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// NEW Endpoint: Handle manually pasted transcript text
app.post('/analyze-text', async (req, res) => {
    try {
        const { text } = req.body;
        console.log(`\n--- 📝 MANUAL TEXT ANALYSIS TRIGGERED ---`);
        console.log(`🗣️ Input Text: "${text}"`);

        if (!text) return res.status(400).json({ error: "Text is required" });

        // Pass text to Cohere RAG directly
        const aiResult = await processTranscript(text);
        
        console.log(`🧠 Final Output Sent to Frontend:`, aiResult);
        
        // Return the flag data, or an empty object if no contradiction found
        res.json(aiResult || {}); 
    } catch (error) {
        console.error(`❌ Error in /analyze-text:`, error);
        res.status(500).json({ error: error.message });
    }
});
// WebSocket for real-time audio & AI flags
wss.on('connection', (ws) => {
    console.log('Frontend dashboard connected.');

    let isDeepgramReady = false;
    let audioBuffer = []; // Our waiting room for the crucial header chunks!

    // Initialize Speech-to-Text stream
    const sttStream = setupAudioStream((transcript) => {
        console.log(`🗣️ LIVE TRANSCRIPT: "${transcript}"`);
        ws.send(JSON.stringify({ type: 'transcript', text: transcript }));

        processTranscript(transcript).then(aiResult => {
            if (aiResult && aiResult.flag) {
                ws.send(JSON.stringify({ type: 'ai-flag', data: aiResult }));
            }
        });
    });

    // Listen for when Deepgram is actually ready
    sttStream.on('open', () => {
        isDeepgramReady = true;
        console.log(`✅ Deepgram is ready! Flushing ${audioBuffer.length} saved chunks.`);

        // Send all the saved chunks (including the header!)
        while (audioBuffer.length > 0) {
            sttStream.send(audioBuffer.shift());
        }
    });

    // Forward microphone audio from frontend to STT API
    ws.on('message', (message) => {
        console.log(`🎤 Received audio chunk from frontend: ${message.length} bytes`);

        if (isDeepgramReady) {
            sttStream.send(message); // Send immediately if ready
        } else {
            audioBuffer.push(message); // Save it if Deepgram is still connecting
        }
    });

    ws.on('close', () => {
        console.log('Dashboard disconnected.');
        if (sttStream.readyState === 1) sttStream.close();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));