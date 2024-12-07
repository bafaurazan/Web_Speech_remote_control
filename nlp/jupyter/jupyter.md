# Web Speech Remote Control - NLP (Jupyter notebook guide)


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


### Useful resources
[How to set up Jupyter Notebook Kernel in poetry environment](https://stackoverflow.com/questions/72434896/jupyter-kernel-doesnt-use-poetry-environment)

- [ ] [Convert jupyter notebook into a single python file](https://stackoverflow.com/questions/17077494/how-do-i-convert-a-ipython-notebook-into-a-python-file-via-commandline)
