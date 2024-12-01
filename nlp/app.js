// Declare global variables
let model, tokenizer;
const referenceTexts = ["Hello, world!", "Hi there!", "Greetings!"];
let referenceEmbeddings = [];

// Ensure TensorFlow.js uses the CPU backend (optional)
tf.setBackend('cpu').then(() => {
  console.log('Using CPU backend');
});

// Load the model and tokenizer, then compute reference embeddings
async function loadModelAndReferences() {
  console.log("Loading model and tokenizer...");

  // Load pre-trained model and tokenizer using Transformers.js
  tokenizer = await transformers.AutoTokenizer.fromPretrained('Xenova/distilbert-base-uncased');
  model = await transformers.AutoModel.fromPretrained('Xenova/distilbert-base-uncased');

  // Compute embeddings for the reference texts
  for (let text of referenceTexts) {
    const inputs = await tokenizer(text, { returnTensors: 'pt' });
    const outputs = await model(inputs.input_ids);
    const embedding = outputs.last_hidden_state.mean(1).dataSync();
    referenceEmbeddings.push(embedding);
  }

  console.log('Model and reference embeddings loaded successfully!');
}

// Calculate cosine similarity
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Validate the input text
async function validateText() {
  const inputText = document.getElementById("inputText").value;
  if (!inputText) {
    document.getElementById("result").innerText = "Please enter some text.";
    return;
  }

  // Compute embedding for the input text
  const inputs = await tokenizer(inputText, { returnTensors: 'pt' });
  const outputs = await model(inputs.input_ids);
  const inputEmbedding = outputs.last_hidden_state.mean(1).dataSync();

  // Compare input embedding with reference embeddings
  let maxSimilarity = -1;
  let bestMatch = null;
  for (let i = 0; i < referenceEmbeddings.length; i++) {
    const similarity = cosineSimilarity(inputEmbedding, referenceEmbeddings[i]);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      bestMatch = referenceTexts[i];
    }
  }

  // Display results
  const threshold = 0.8; // Adjust as needed
  if (maxSimilarity >= threshold) {
    document.getElementById("result").innerText =
      `Input is correct! Best match: "${bestMatch}" (Similarity: ${maxSimilarity.toFixed(2)})`;
  } else {
    document.getElementById("result").innerText =
      `Input is incorrect. Highest similarity: ${maxSimilarity.toFixed(2)}`;
  }
}

// Load the model and references on page load
loadModelAndReferences();
