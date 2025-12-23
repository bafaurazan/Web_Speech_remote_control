#!/usr/bin/env python3

import subprocess
import json


# Changing the default

# Load JSON file with command activators
def loadCommands(filePath):
    with open(filePath, "r", encoding="utf-8") as file:
        return json.load(file)


commandsFile = "commands.json"
commands = loadCommands(commandsFile)
commandsText = "\n".join([f'"{key}": "{value}"' for key, value in commands.items()])


# Installing llama3 model using ollama service
subprocess.run(["ollama", "pull", "llama3:8b"], check=True)


# Defining the Modefile content
modelfileContent = f'''
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
"""
'''

# Writing the Modelfile
modelfilePath = "Modelfile"
with open(modelfilePath, "w") as file:
    file.write(modelfileContent)

# Customize llama model with selected parameters
customModelName = "wsrc_nlp"
subprocess.run(
    ["ollama", "create", customModelName, "-f", modelfilePath], check=True
)
