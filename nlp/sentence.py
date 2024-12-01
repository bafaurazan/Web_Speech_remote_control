#!/usr/bin/env python3

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# Load pre-trained embedding model
model = SentenceTransformer('all-MiniLM-L6-v2')

# Reference texts and precomputed embeddings
reference_texts = ["Hello, world!", "Hi there!", "Greetings!"]
reference_embeddings = model.encode(reference_texts)

# Function to validate text
def validate_text(input_text, threshold=0.8):
    input_embedding = model.encode(input_text)
    similarities = cosine_similarity([input_embedding], reference_embeddings)
    max_similarity = np.max(similarities)
    best_match_index = np.argmax(similarities)

    if max_similarity >= threshold:
        return True, reference_texts[best_match_index], max_similarity
    else:
        return False, None, max_similarity

# Test with input
input_text = "Helo, world!"
is_correct, best_match, similarity = validate_text(input_text)

if is_correct:
    print(f"Input is correct! Best match: '{best_match}' (similarity: {similarity:.2f})")
else:
    print(f"Input is not correct. Highest similarity: {similarity:.2f}")
