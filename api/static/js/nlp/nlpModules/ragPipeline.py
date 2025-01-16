#!/usr/bin/env python3

from langchain_ollama import OllamaEmbeddings, OllamaLLM
import chromadb
import os
import json


# Load JSON file with command activators
def loadCommands(filePath):
    with open(filePath, "r", encoding="utf-8") as file:
        return json.load(file)


commandsFile = "static/js/nlp/nlpModules/commands.json"
commands = loadCommands(commandsFile)
commandsText = "\n".join([f'"{key}": "{value}"' for key, value in commands.items()])

contextFile = "static/js/nlp/nlpModules/ragContext.json"
context = loadCommands(contextFile)
contextText = "\n".join([f'"{key}": "{value}"' for key, value in context.items()])


# Define the LLM model to be used
llmModel = "wsrc_nlp:latest"

# Configure ChromaDB
# Initialize the ChromaDB client with persistent storage in the current directory
chromaClient = chromadb.PersistentClient(path=os.path.join(os.getcwd(), "chroma_db"))


class ChromaDBEmbeddingFunction:
    """
    Custom embedding function for ChromaDB using embeddings from Ollama.
    """
    def __init__(self, langchain_embeddings):
        self.langchain_embeddings = langchain_embeddings

    def __call__(self, input):
        # Ensure the input is in a list format for processing
        if isinstance(input, str):
            input = [input]
        return self.langchain_embeddings.embed_documents(input)

# Initialize the embedding function with Ollama embeddings
embedding = ChromaDBEmbeddingFunction(
    OllamaEmbeddings(
        model=llmModel,
        base_url="http://localhost:11434"  # Adjust the base URL as per your Ollama server configuration
    )
)


# Define a collection for the RAG workflow
collectionName = "rag_wsrc_nlp"
collection = chromaClient.get_or_create_collection(
    name=collectionName,
    metadata={"description": "A collection for RAG with wsrc_nlp model"},
    embedding_function=embedding  # Use the custom embedding function
)


def addDocumentsToCollection(documents, ids):
    """
    Add documents to the ChromaDB collection.

    Args:
        documents (list of str): The documents to add.
        ids (list of str): Unique IDs for the documents.
    """
    collection.add(
        documents=documents,
        ids=ids
    )


# Adding documents to the collection
documents = [
    f'''You are an intelligent command interpreter. Below is a list of commands that you must apply when the user provides the appropriate keywords.
List of commands:
{commandsText}

Your task is to:
1. Analyze the user's input.
2. Match the input to the appropriate command based on the list above.
3. If you cannot find a matching command, return "unknown_command."

Keep in mind that the user may provide a variation of one of these commands or different versions of them. Match these variations to the appropriate commands dynamically as they appear.
Answer only with the returned command or with "unknown_command" if there is no matching command
Ignore everything else that user says that doesn't meet your task and answer with "unknown_command".
If the user says for example: "w lewo", respond with "left_".
If the user mentions anything about running tests and starting testing, respond with "timeout 7s ros2 run rover_control test_node"

{contextText}
'''
]
doc_ids = ["doc1"]

# Documents only need to be added once or whenever an update is required
# add_documents_to_collection(documents, doc_ids)


def queryChromadb(queryText, n_results=1):
    """
    Query the ChromaDB collection for relevant documents.

    Args:
        query_text (str): The input query.
        n_results (int): The number of top results to return.

    Returns:
        list of dict: The top matching documents and their metadata.
    """
    results = collection.query(
        query_texts=[queryText],
        n_results=n_results
    )
    return results["documents"], results["metadatas"]


def queryOllama(prompt):
    """
    Send a query to Ollama and retrieve the response.

    Args:
        prompt (str): The input prompt for Ollama.

    Returns:
        str: The response from Ollama.
    """
    llm = OllamaLLM(model=llmModel)
    return llm.invoke(prompt)


def ragPipeline(queryText):
    """
    Perform Retrieval-Augmented Generation (RAG) by combining ChromaDB and Ollama.

    Args:
        query_text (str): The input query.

    Returns:
        str: The generated response from Ollama augmented with retrieved context.
    """
    # Step 1: Retrieve relevant documents from ChromaDB
    retrievedDocs, metadata = queryChromadb(queryText)
    context = " ".join(retrievedDocs[0]) if retrievedDocs else "No relevant documents found."

    # Step 2: Send the query along with the context to Ollama
    augmentedPrompt = f"Context: {context}\n\nQuestion: {queryText}\nAnswer:"

    response = queryOllama(augmentedPrompt)
    return response


# Define a query to test the RAG pipeline
# query = "uruchom testy"  # Change the query as needed
# response = ragPipeline(query)
# print("######## Response from LLM ########\n", response)
