
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Simple env parser
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const [key, val] = line.split('=');
            if (key && val) {
                process.env[key.trim()] = val.trim();
            }
        });
    } catch (e) {
        console.log("Could not read .env.local");
    }
}

loadEnv();

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
    console.error("No API Key found in .env.local");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        console.log("Fetching model list from API...");
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error.message);
            return;
        }

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => console.log(` - ${m.name}`));

            const preferred = data.models.find(m => m.name.includes('gemini'));
            if (preferred) {
                console.log(`\nRecommended Name: '${preferred.name.replace('models/', '')}'`);
            }
        } else {
            console.log("No models returned.");
        }

    } catch (e) {
        console.error(e);
    }
}

listModels();
