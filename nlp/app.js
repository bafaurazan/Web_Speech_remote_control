// Load Universal Sentence Encoder model
async function loadModel() {
    console.log("Loading Universal Sentence Encoder model...");
    const model = await use.load();
    console.log("Model loaded.");
    return model;
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

async function main() {
    const model = await loadModel();

    // Reference texts (predefined correct embeddings)
    const referenceTexts = [
        "This is a valid input.",
        "Correct example text here.",
        "Another example of valid text.",
        "mkdir"
    ];
    const referenceEmbeddings = await Promise.all(referenceTexts.map(text => model.embed([text])));

    const checkButton = document.getElementById('checkButton');
    const resultElement = document.getElementById('result');
    const similarityList = document.getElementById('similarityList');

    checkButton.addEventListener('click', async () => {
        const inputText = document.getElementById('inputText').value.trim();
        similarityList.innerHTML = ''; // Clear previous results

        if (!inputText) {
            resultElement.textContent = "Please enter some text!";
            return;
        }

        // Split input into individual words
        const words = inputText.split(/\s+/);

        const allResults = [];

        for (const word of words) {
            // Get embedding for the current word
            const wordEmbedding = await model.embed([word]);

            // Calculate cosine similarity for each reference embedding
            const similarities = referenceTexts.map((refText, index) => {
                const similarity = cosineSimilarity(wordEmbedding, referenceEmbeddings[index]);
                return { reference: refText, similarity: similarity };
            });

            // Sort by similarity (highest first)
            similarities.sort((a, b) => b.similarity - a.similarity);

            // Display similarities for the current word
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

            // Save results for display
            allResults.push({ word, similarities });
        }

        resultElement.textContent = `Analysis complete. Results for ${words.length} word(s).`;
    });
}

main();
