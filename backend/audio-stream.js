import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();

export function setupAudioStream(onTranscript) {
    // We removed the strict encoding params and added model=nova-2 for better accuracy
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&keepalive=true';
    const sttWs = new WebSocket(deepgramUrl, {
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` }
    });

    // 1. THIS PREVENTS THE SERVER FROM CRASHING
    sttWs.on('error', (error) => {
        console.error('⚠️ Deepgram Connection Error. Check your API Key!', error.message);
    });

    sttWs.on('open', () => {
        console.log('✅ Connected to Deepgram STT');
    });

    // 2. DEBUG: Tells us exactly why Deepgram might disconnect
    sttWs.on('close', (code, reason) => {
        console.log(`❌ Deepgram connection closed. Code: ${code}, Reason: ${reason}`);
    });

    sttWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);

            // Hide the flood of normal metadata messages from Deepgram
            if (response.type === 'Metadata') {
                return;
            }

            // 🛑 DEBUG: Log warnings or errors sent by Deepgram
            if (response.type === 'Warning' || response.type === 'Error') {
                console.log('⚠️ Deepgram Alert:', response);
            }

            // Drill down into Deepgram's JSON structure
            const transcript = response?.channel?.alternatives[0]?.transcript;

            // Only trigger if there are actual words (ignore empty strings from silence)
            if (transcript && transcript.trim().length > 0) {
                // 🛑 DEBUG: See the actual words Deepgram decoded
                console.log(`📝 Transcript parsed: "${transcript}"`);
                onTranscript(transcript);
            }
        } catch (err) {
            console.error("Error parsing STT message", err);
        }
    });

    return sttWs;
}