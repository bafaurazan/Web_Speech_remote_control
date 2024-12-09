# Web_Speech_Remote_Control - NLP
The machine learning component of the project focuses on simplifying the activation of speech recognition functions by utilizing the Llama 3 model, running locally through the Ollama server.
The script `modelPrep.py` is responsible for creating a model file for Llama 3 and fine-tuning its parameters to develop a customized model. Thanks to Ollama's API, words recognized through the Web Speech API are mapped to the correct function activators. Users are not required to say the exact activator names, as this LLM model understands the context of the provided words.


## Prerequisites
Install [ollama](https://ollama.com/download) to run LLMs locally.

If you are running Linux (any distro), you can install it using terminal using this command:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Update poetry
```bash
poetry update
```


## Creating the custom model
Start ollama server (preferably in other terminal window)
```bash
ollama serve
```

This script handles model download and customization.
```bash
cd nlpModules
poetry run python modelPrep.py
```


## Testing method
How to test the pre-trained model by itself on sample webpage console.

Make sure you have started ollama server
```bash
ollama serve
```

Run python server
```bash
poetry run python -m http.server
```

Then go to http://localhost:8000/

Or run node.js http server
```bash
http-server
```

Then go to http://localhost:8080/


### Development details
Current list with command activators is stored in `nlpModules/commands.json` file.
Variable for handling selection between commands for rover and drone is `selectedVehicle` located in `modelRequest.js` file.


### To-do list:
- [X] Poetry env instead of venv
- [X] Convert the model into TF
- [ ] Convert the model into TF lite
- [X] Provide text input from webSpeech API to the embeddings in JS
- [X] Compute similarity between user input and reference embeddings
- [X] Fix the mistakes from input (Replace with the most similar words)
- [ ] ~~Send the result in JSON?~~
- [X] `console.log` the command and specified user activator

- [ ] ~~Save finished model to cloud? (for easier download)~~
