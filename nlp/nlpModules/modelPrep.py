#!/usr/bin/env python3

import subprocess
import json


# Load JSON file with command activators
def load_commands(file_path):
    with open(file_path, "r", encoding="utf-8") as file:
        return json.load(file)


commands_file = "commands.json"
commands = load_commands(commands_file)
commands_text = "\n".join([f'"{key}": "{value}"' for key, value in commands.items()])


# Installing llama3 model using ollama service
subprocess.run(["ollama", "pull", "llama3:8b"], check=True)


# Defining the Modefile content
modelfile_content = f'''
# set the base model
FROM llama3
# sets the temperature to 1 [higher is more creative, lower is more coherent]
PARAMETER temperature 1
# sets the context window size to 4096, this controls how many tokens the LLM can use as context to generate the next token
PARAMETER num_ctx 4096

# Set the system message
SYSTEM """
You are an intelligent command interpreter. Below is a list of commands that you must apply when the user provides the appropriate keywords.

List of commands:
{commands_text}

Your task is to:
1. Analyze the user's input.
2. Match the input to the appropriate command based on the list above.
3. If you cannot find a matching command, return "unknown_command."

Keep in mind that the user may provide a variation of one of these commands or different versions of them. Match these variations to the appropriate commands dynamically as they appear.
Answer only with the returned command or with "unknown_command" if there is no matching command
Ignore everything else that user says that doesn't meet your task and answer with "unknown_command".
If the user says for example: "w lewo", respond with "left_".
"""
'''

# Writing the Modelfile
modelfile_path = "Modelfile"
with open(modelfile_path, "w") as file:
    file.write(modelfile_content)

# Customize llama model with selected parameters
custom_model_name = "wsrc_nlp"
subprocess.run(
    ["ollama", "create", custom_model_name, "-f", modelfile_path], check=True
)
