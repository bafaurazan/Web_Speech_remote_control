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