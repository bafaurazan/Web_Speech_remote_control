# Web_Speech_Remote_Control - NLP

The machine learning aspect of the project, which focuses on simplifying the activation of speech recognition functions by utilizing the Universal Sentence Encoder (USE), a pre-trained model for text embedding.
The script is calculating cosine similarity between embeddings from the words provided by speech recognition (WebSpeechAPI) and the reference embeddings from the dataset. Then it displays the top 5 most similar words.


## Dataset download

Update poetry
```bash
poetry update
```

Requires [Kaggle API](https://www.kaggle.com/docs/api#authentication) token in one of these directories:
```
~/.kaggle/kaggle.json

~/.config/kaggle/kaggle.json
```

Run the data preparation file
```bash
poetry run python dataPrepFull.py
```

Used datasets:
- [Main OSes terminal commands](https://www.kaggle.com/datasets/vaibhavdlights/linuxcmdmacos-commands)
- [Wikipedia sentences](https://www.kaggle.com/datasets/mikeortman/wikipedia-sentences)
- [Wikipedia plaintext 2023](https://www.kaggle.com/datasets/jjinho/wikipedia-20230701)

## Testing method
How to test the pre-trained model by itself

Run python server
```bash
poetry run python -m http.server
```

Then go to http://localhost:8000/

### Useful resources
[How to set up Jupyter Notebook Kernel in poetry environment](https://stackoverflow.com/questions/72434896/jupyter-kernel-doesnt-use-poetry-environment)

### To-do list:
- [X] Poetry env instead of venv
- [X] Convert the model into TF
- [ ] Convert the model into TF lite
- [ ] Provide text input from webSpeech API to the embeddings in JS
- [X] Compute similarity between user input and reference embeddings
- [X] Fix the mistakes from input (Replace with the most similar words)
- [ ] ~~Send the result in JSON?~~

- [ ] Save finished model to cloud? (for easier download)
- [ ] [Convert notebook into a single python file](https://stackoverflow.com/questions/17077494/how-do-i-convert-a-ipython-notebook-into-a-python-file-via-commandline)
