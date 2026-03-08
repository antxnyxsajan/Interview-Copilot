import fs from 'fs';
import pdf from 'pdf-parse';
import { cohere } from './ai-engine.js';

export const resumeKnowledgeBase = [];

export async function parseAndStoreResume(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);

    // Simple chunking strategy for the hackathon
    const chunks = data.text.split('\n\n').filter(c => c.trim().length > 30);

    // Create vector embeddings using Cohere
    const response = await cohere.embed({
        texts: chunks,
        model: 'embed-english-v3.0',
        inputType: 'search_document'
    });

    response.embeddings.forEach((emb, i) => {
        resumeKnowledgeBase.push({
            text: chunks[i],
            vector: emb
        });
    });

    console.log(`Stored ${chunks.length} vectorized chunks from resume.`);
}