import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config();

export function setupAudioStream(onTranscript) {
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&keepalive=true&endpointing=1000';
    const sttWs = new WebSocket(deepgramUrl, {
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` }
    });

    sttWs.on('error', (error) => console.error('⚠️ Deepgram Error:', error.message));
    sttWs.on('open', () => console.log('✅ Connected to Deepgram STT'));

    // 1. Set up our buffer AND a timer variable
    let currentSentence = "";
    let flushTimeout = null;

    // 2. Helper function to send the completed sentence to the frontend
    const flushBuffer = () => {
        const finalSentence = currentSentence.trim();
        if (finalSentence.length > 0) {
            console.log(`📝 Full Sentence Sent: "${finalSentence}"`);
            onTranscript(finalSentence);
            currentSentence = ""; // Reset the buffer for the next sentence
        }
    };

    sttWs.on('message', (data) => {
        try {
            const response = JSON.parse(data);

            if (response.type === 'Metadata' || response.type === 'Warning' || response.type === 'Error') return;

            const transcript = response?.channel?.alternatives[0]?.transcript;

            if (transcript && transcript.trim().length > 0) {
                // Add new words to the buffer
                currentSentence += transcript + " ";
                console.log(`[Buffering...] ${transcript}`);

                // Clear the failsafe timer every time a new word is spoken
                if (flushTimeout) clearTimeout(flushTimeout);

                // If Deepgram detects a clean pause, flush immediately
                if (response.speech_final) {
                    flushBuffer();
                } else {
                    // FAILSAFE: If no new words are spoken for 1.5 seconds, forcefully flush the buffer
                    flushTimeout = setTimeout(flushBuffer, 1500);
                }
            }
        } catch (err) {
            console.error("Error parsing STT message", err);
        }
    });

    return sttWs;
}