# How to train the model yourself

Run this python file
```
python3 modelPrep.py
```

if fasttext doesn't work, use fasttext-wheel


### To-do list:
- [X] Poetry env instead of venv
- [ ] Convert the model into TF (lite)
- [ ] Provide text input from webSpeech API to the embeddings in JS
- [ ] Compute similarity of the words and fix the mistakes from input
- [ ] Send the result in JSON?

- [ ] Save finished model to cloud? (for easier download)
- [ ] [Convert notebook into a single python file](https://stackoverflow.com/questions/17077494/how-do-i-convert-a-ipython-notebook-into-a-python-file-via-commandline)