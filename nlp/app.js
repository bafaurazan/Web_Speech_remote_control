let model;
let referenceTexts = [];
let referenceEmbeddings = [];
let recognition;

// Load Universal Sentence Encoder model
async function loadModel() {
    console.log("Loading Universal Sentence Encoder model...");
    const loadedModel = await use.load();
    console.log("Model loaded.");
    return loadedModel;
}

// Load reference texts from a .txt file
async function loadReferenceTexts(filePath) {
    const response = await fetch(filePath);
    const text = await response.text();
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
}

// Compute cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    const flatVecA = vecA.arraySync()[0];
    const flatVecB = vecB.arraySync()[0];
    const tensorA = tf.tensor(flatVecA);
    const tensorB = tf.tensor(flatVecB);
    const dotProduct = tf.dot(tensorA, tensorB).dataSync()[0];
    const normA = tf.norm(tensorA).dataSync()[0];
    const normB = tf.norm(tensorB).dataSync()[0];
    return dotProduct / (normA * normB);
}

// Initialize the model and reference embeddings
async function initialize() {
    const loadingStatus = document.getElementById('loadingStatus');
    try {
        model = await loadModel();
        referenceTexts = await loadReferenceTexts('./data/clean/commandsDf.txt');
        console.log("Loaded reference texts:", referenceTexts);

        // Pre-compute reference embeddings
        referenceEmbeddings = await Promise.all(referenceTexts.map(text => model.embed([text])));
        console.log("Reference embeddings computed.");

        // Enable input, buttons, and speech recognition after loading
        document.getElementById('inputText').disabled = false;
        document.getElementById('checkButton').disabled = false;
        document.getElementById('speechButton').disabled = false;

        initializeSpeechRecognition();

        loadingStatus.textContent = "Model and embeddings loaded. You can now input text.";
    } catch (error) {
        console.error("Error during initialization:", error);
        loadingStatus.textContent = "Failed to load model or embeddings. Please try again.";
    }
}

// Initialize Web Speech API
function initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Your browser does not support the Web Speech API.");
        return;
    }

    recognition = new webkitSpeechRecognition();
    recognition.lang = 'en-US'; // Set the language
    recognition.continuous = false; // Stop after one phrase
    recognition.interimResults = false; // Only final results

    recognition.onresult = function (event) {
        const speechResult = event.results[0][0].transcript;
        console.log("Recognized speech:", speechResult);
        document.getElementById('inputText').value = speechResult; // Set the recognized text
    };

    recognition.onerror = function (event) {
        console.error("Speech recognition error:", event.error);
    };
}

// Analyze input text and display results
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
        const wordEmbedding = await model.embed([word]);

        let similarities = referenceTexts.map((refText, index) => {
            const similarity = cosineSimilarity(wordEmbedding, referenceEmbeddings[index]);
            return { reference: refText, similarity: similarity };
        });

        // Sort by similarity (highest first)
        similarities = similarities.sort((a, b) => b.similarity - a.similarity);

        // Get the top match
        const bestMatch = similarities[0];
        if (bestMatch.similarity >= 0.6) {
            correctedWords.push(bestMatch.reference); // Replace with the best match
        } else {
            correctedWords.push(word); // Keep the original word
        }

        // Display top 5 similarities
        const wordResult = document.createElement('li');
        wordResult.textContent = `Word "${word}":`;
        similarityList.appendChild(wordResult);

        const wordList = document.createElement('ul');
        similarities.slice(0, 5).forEach(({ reference, similarity }) => {
            const percentage = (similarity * 100).toFixed(2);
            const listItem = document.createElement('li');
            listItem.textContent = `Similarity to "${reference}": ${percentage}%`;
            wordList.appendChild(listItem);
        });

        wordResult.appendChild(wordList);
    }

    // Display corrected text
    outputTextBox.value = correctedWords.join(' ');

    document.getElementById('result').textContent = `Analysis complete. Results for ${words.length} word(s).`;
}

// Attach the click event handler
function setupEventHandlers() {
    const checkButton = document.getElementById('checkButton');
    checkButton.addEventListener('click', () => {
        const inputText = document.getElementById('inputText').value.trim();
        analyzeText(inputText);
    });

    const speechButton = document.getElementById('speechButton');
    speechButton.addEventListener('click', () => {
        recognition.start(); // Start speech recognition
    });
}

// Main function to initialize and set up everything
async function main() {
    await initialize(); // Pre-load model and reference embeddings
    setupEventHandlers();
}

main();
