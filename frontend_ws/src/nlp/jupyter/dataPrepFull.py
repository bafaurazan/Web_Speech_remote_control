import kagglehub

import subprocess
import gc

import pandas as pd
import dask.dataframe as dd



# Data storage
subprocess.run(["mkdir", "data"])

# CLI commands dataset
pathCommands = kagglehub.dataset_download("vaibhavdlights/linuxcmdmacos-commands")
subprocess.run(["mv", pathCommands, "./data/commands/"])

# Wikipedia sentences dataset
pathWiki = kagglehub.dataset_download("mikeortman/wikipedia-sentences")
subprocess.run(["mv", pathWiki, "./data/wikiSen/"])

# Wikipedia plaintext 2023 dataset
pathWikiPlain = kagglehub.dataset_download("jjinho/wikipedia-20230701")
subprocess.run(["mv", pathWikiPlain, "./data/wikiPlain/"])




# Joining data frames

subprocess.run(["mkdir", "data/clean"])

# Commands dataset
linuxCommandsDf = pd.read_csv('data/commands/linux_commands.csv')
cmdCommandsDf = pd.read_csv('data/commands/cmd_commands.csv')
macOsCommandsDf = pd.read_csv('data/commands/macos_commands.csv')
vbscriptCommandsDf = pd.read_csv('data/commands/vbscript_commands.csv')


commandsDf = pd.concat([linuxCommandsDf, cmdCommandsDf, macOsCommandsDf, vbscriptCommandsDf], ignore_index = True)
del linuxCommandsDf
del cmdCommandsDf
del macOsCommandsDf
del vbscriptCommandsDf
gc.collect()


# Removing duplicate columns (indexes)
commandsDf = commandsDf.drop(columns=['Unnamed: 0'])
commandsDf = commandsDf.drop(columns=['description'])

# Removing unwanted parts of strings
# commandsDf['description'] = commandsDf['description'].str.replace(' •', '')
# commandsDf['description'] = commandsDf['description'].str.replace('•', '')

# Saving the data frame to a plain text file
commandsDf.to_csv('data/clean/commandsDf.txt', sep='\t', index=False, header=False)

del commandsDf
gc.collect()


# wikiPlain dataset
wikiPlainDf = dd.read_parquet('data/wikiPlain/*.parquet')

# Processing the wikiPlain dataset in chunks
for chunk in wikiPlainDf.to_delayed():
    chunk_df = chunk.compute()

    chunk_df = chunk_df.drop(columns=['id', 'categories'])

    chunk_df.to_csv('data/clean/wikiPlain.txt', sep='\t', index=False, header=False, mode='a')

    del chunk_df
    gc.collect()

del wikiPlainDf
gc.collect()


# Joining all the text files
data = data2 = ""

with open('data/clean/commandsDf.txt') as fileWrite:
    data = fileWrite.read()

with open('data/wikiSen/wikisent2.txt') as fileWrite:
    data2 = fileWrite.read()

data += data2

with open('data/clean/wikiPlain.txt', 'r') as wikiPlainFile, open('data/clean/dataFull.txt', 'w') as dataFullFile:
    # Writing the previous txt files to the full dataset text file
    dataFullFile.write(data)

    for line in wikiPlainFile:
        dataFullFile.write(line)
