// API POST Request to communicate with local LLM model
export function sendRequest(prompt) {
  const url = 'https://rafal.tail43fbf9.ts.net/api/generate';

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
        if (commandActivator == "start_rover") {
          sendToRobotForward()
        }else if (commandActivator == "stop_rover") {
          sendToRobotBackward()
        }
      }
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
    });
}
