let model;
let referenceTexts = [];
let referenceEmbeddings = [];

// Load Universal Sentence Encoder model
async function loadModel() {
    console.log("Loading Universal Sentence Encoder model...");
    const loadedModel = await use.load();
    console.log("Model loaded.");
    return loadedModel;
}

// Load reference texts from a .txt file
async function loadReferenceTexts(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Could not fetch ${filePath}: ${response.statusText}`);
        }
        const text = await response.text();
        return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    } catch (error) {
        console.error("Error loading reference texts:", error);
        return [];
    }
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

        // Enable input and button after loading
        document.getElementById('inputText').disabled = false;
        document.getElementById('checkButton').disabled = false;
        loadingStatus.textContent = "Model and embeddings loaded. You can now input text.";
    } catch (error) {
        console.error("Error during initialization:", error);
        loadingStatus.textContent = "Failed to load model or embeddings. Please try again.";
    }
}

// Analyze input text
async function analyzeText(inputText) {
    const similarityList = document.getElementById('similarityList');
    similarityList.innerHTML = ''; // Clear previous results

    if (!inputText) {
        document.getElementById('result').textContent = "Please enter some text!";
        return;
    }

    const words = inputText.split(/\s+/);

    for (const word of words) {
        const wordEmbedding = await model.embed([word]);

        let similarities = referenceTexts.map((refText, index) => {
            const similarity = cosineSimilarity(wordEmbedding, referenceEmbeddings[index]);
            return { reference: refText, similarity: similarity };
        });

        // Sort by similarity (highest first) and select the top 5
        similarities = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, 5);

        const wordResult = document.createElement('li');
        wordResult.textContent = `Word "${word}":`;
        similarityList.appendChild(wordResult);

        const wordList = document.createElement('ul');
        similarities.forEach(({ reference, similarity }) => {
            const percentage = (similarity * 100).toFixed(2);
            const listItem = document.createElement('li');
            listItem.textContent = `Similarity to "${reference}": ${percentage}%`;
            wordList.appendChild(listItem);
        });

        wordResult.appendChild(wordList);
    }

    document.getElementById('result').textContent = `Analysis complete. Results for ${words.length} word(s).`;
}

// Attach the click event handler
function setupEventHandlers() {
    const checkButton = document.getElementById('checkButton');
    checkButton.addEventListener('click', () => {
        const inputText = document.getElementById('inputText').value.trim();
        analyzeText(inputText);
    });
}

// Main function to initialize and set up everything
async function main() {
    await initialize(); // Pre-load model and reference embeddings
    setupEventHandlers();
}

main();
