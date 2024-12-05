import { AutoTokenizer, AutoModel } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.0.0';
import * as tf from 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js';

let tokenizer, model;
let commands = [];
let referenceEmbeddings = [];

// Load the BERT model and tokenizer
async function loadModel() {
    try {
        console.log("Loading BERT model...");
        tokenizer = await AutoTokenizer.from_pretrained('bert-base-uncased');
        model = await AutoModel.from_pretrained('bert-base-uncased');
        console.log("BERT model loaded.");
    } catch (error) {
        console.error("Error loading model or tokenizer:", error);
        throw error;
    }
}

// Load commands from commands.json
async function loadCommands(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`Failed to load commands from ${filePath}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.commands;
}

// Compute embeddings for text
async function getEmbedding(tokenizer, model, text) {
    const inputs = await tokenizer(text, { return_tensors: 'pt' });
    console.log("Inputs for model:", inputs);

    // Pass both input_ids and attention_mask to the model
    const outputs = await model({
        input_ids: inputs.input_ids,
        attention_mask: inputs.attention_mask,
    });

    console.log("Model outputs:", outputs);

    // Check for last_hidden_state or fallback to logits
    const embeddingSource = outputs.last_hidden_state || outputs.logits;

    if (!embeddingSource) {
        throw new Error("Neither last_hidden_state nor logits are defined in model outputs.");
    }

    // Compute the embedding using TensorFlow.js
    const embedding = tf.mean(embeddingSource, [1]); // Average pooling over sequence dimension
    return embedding.dataSync(); // Convert to array for further use
}

// Compute cosine similarity
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

// Initialize model and command embeddings
async function initialize() {
    const loadingStatus = document.getElementById('loadingStatus');
    try {
        await loadModel(); // Load the tokenizer and model

        commands = await loadCommands('./commands.json');
        console.log("Loaded commands:", commands);

        // Precompute embeddings for commands
        referenceEmbeddings = await Promise.all(
            commands.map((command) => getEmbedding(tokenizer, model, command))
        );
        console.log("Command embeddings computed.");

        document.getElementById('inputText').disabled = false;
        document.getElementById('checkButton').disabled = false;
        document.getElementById('speechButton').disabled = false;

        loadingStatus.textContent = "Model and embeddings loaded. You can now input text.";
    } catch (error) {
        console.error("Error during initialization:", error);
        loadingStatus.textContent = "Failed to load model or commands. Please try again.";
    }
}

// Analyze input text and correct commands
async function analyzeText(inputText) {
    const similarityList = document.getElementById('similarityList');
    const outputTextBox = document.getElementById('outputText');
    similarityList.innerHTML = ''; // Clear previous results

    if (!inputText) {
        document.getElementById('result').textContent = "Please enter some text!";
        return;
    }

    const words = inputText.split(/\s+/);
    const correctedWords = [];

    for (const word of words) {
        const wordEmbedding = await getEmbedding(tokenizer, model, word);

        let similarities = commands.map((command, index) => {
            const similarity = cosineSimilarity(wordEmbedding, referenceEmbeddings[index]);
            return { command, similarity };
        });

        // Sort by similarity (highest first)
        similarities = similarities.sort((a, b) => b.similarity - a.similarity);

        // Get the top match if similarity is >= 0.6
        const bestMatch = similarities[0];
        if (bestMatch.similarity >= 0.6) {
            correctedWords.push(bestMatch.command);
        } else {
            correctedWords.push(word); // Keep original word if no match
        }

        // Display top 5 similarities
        const wordResult = document.createElement('li');
        wordResult.textContent = `Word "${word}":`;
        similarityList.appendChild(wordResult);

        const wordList = document.createElement('ul');
        similarities.slice(0, 5).forEach(({ command, similarity }) => {
            const percentage = (similarity * 100).toFixed(2);
            const listItem = document.createElement('li');
            listItem.textContent = `Similarity to "${command}": ${percentage}%`;
            wordList.appendChild(listItem);
        });

        wordResult.appendChild(wordList);
    }

    // Display corrected text
    outputTextBox.value = correctedWords.join(' ');

    document.getElementById('result').textContent = `Analysis complete. Results for ${words.length} word(s).`;
}

// Attach event handlers
function setupEventHandlers() {
    const checkButton = document.getElementById('checkButton');
    checkButton.addEventListener('click', () => {
        const inputText = document.getElementById('inputText').value.trim();
        analyzeText(inputText);
    });

    const speechButton = document.getElementById('speechButton');
    speechButton.addEventListener('click', () => {
        recognition.start();
    });
}

// Main function to initialize and set up everything
async function main() {
    await initialize();
    setupEventHandlers();
}

main();
