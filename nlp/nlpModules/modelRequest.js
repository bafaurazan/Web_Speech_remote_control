// API POST Request to communicate with local LLM model
export function sendRequest(prompt) {
  const url = 'http://localhost:11434/api/generate';

  const selectedVehicle = "rover"

  const data = {
    model: 'wsrc_nlp',
    prompt: prompt,
    stream: false,
  };

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      const commandActivator = data.response + selectedVehicle;

      if (data.response !== "unknown_command") {
        console.log(commandActivator);
      }
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
    });
}
