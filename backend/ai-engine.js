import { CohereClient } from 'cohere-ai';
import dotenv from 'dotenv';
import { resumeKnowledgeBase } from './resume-parser.js';

dotenv.config();

export const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

// Basic Cosine Similarity to compare embeddings without needing a heavy DB
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function processTranscript(transcript) {
    console.log(`🔍 Starting AI Verification...`);

    if (resumeKnowledgeBase.length === 0) {
        console.log(`⚠️ ABORT: Knowledge base is empty! (Did you forget to upload the resume?)`);
        return null;
    }
    
    if (transcript.trim().length < 20) {
        console.log(`⚠️ ABORT: Transcript too short to analyze.`);
        return null;
    }

    try {
        // 1. Embed the live spoken text
        console.log(`🧮 Generating vector embeddings for the transcript...`);
        const queryEmb = await cohere.embed({
            texts: [transcript],
            model: 'embed-english-v3.0',
            inputType: 'search_query'
        });

        // 2. Find the most relevant resume claim
        let bestMatch = null;
        let highestScore = -1;
        
        resumeKnowledgeBase.forEach(item => {
            const score = cosineSimilarity(queryEmb.embeddings[0], item.vector);
            if (score > highestScore) {
                highestScore = score;
                bestMatch = item.text;
            }
        });

        console.log(`🎯 Best Resume Match Score: ${highestScore.toFixed(2)}`);

        // Ignore if the spoken text isn't relevant to any resume data
        if (highestScore < 0.3) {
            console.log(`🤷 ABORT: No relevant resume claim found (Score < 0.3). Transcript is likely off-topic.`);
            return null;
        }

        console.log(`📄 Matched Resume Claim: "${bestMatch.substring(0, 100)}..."`);

        // 3. Ask Command R to verify
        const prompt = `
        You are an expert technical recruiter AI. 
        Resume Claim: "${bestMatch}"
        Candidate's Spoken Answer: "${transcript}"
        
        Analyze if the spoken answer contradicts, exaggerates, or misrepresents the resume claim.
        Respond ONLY with a valid JSON object:
        {
          "flag": (boolean) true if contradiction/exaggeration, false otherwise,
          "reason": (string) 1-sentence explanation,
          "follow_up": (string) suggested follow-up question to dig deeper
        }
        `;

        console.log(`🤖 Asking Cohere Command R to evaluate the contradiction...`);
        const response = await cohere.chat({
            model: "command-a-03-2025",
            message: prompt,
            temperature: 0.1, 
        });

        console.log(`📩 Raw Cohere Response:`, response.text);

        // Parse the JSON
        const parsedData = JSON.parse(response.text.replace(/```json|```/g, '').trim());
        return parsedData;

    } catch (error) {
        console.error(`❌ AI Engine Error:`, error);
        return null;
    }
}