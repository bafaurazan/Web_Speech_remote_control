// API POST Request to communicate with local LLM model
export function sendRequest(prompt) {
  const url = 'https://rafal.tail43fbf9.ts.net/api/query';
  const selectedVehicle = "rover";

  const data = {
    model: 'wsrc_nlp',
    prompt: '', // Placeholder, updated dynamically
    stream: false,
  };

  // Helper function to extract duration and split prompt
  function parsePrompt(prompt) {
    const timePattern = /\b(\d+)\s*(sekund|sekundy|sekunda|minut|minuty|minuta)\b/;
    const match = prompt.match(timePattern);

    if (match) {
      // Determine time in seconds
      const duration = parseInt(match[1], 10) *
        (match[2].includes('minut') || match[2].includes('minuty') || match[2].includes('minuta') ? 60 : 1);
      const splitIndex = prompt.indexOf(match[0]) + match[0].length;
      const firstPart = prompt.substring(0, splitIndex).trim();
      const secondPart = prompt.substring(splitIndex).trim();
      return { firstPart, secondPart, duration };
    }
    return { firstPart: prompt, secondPart: null, duration: 0 };
  }

  // Helper function to send data to the LLM
function sendToLLM(inputPrompt) {
  data.prompt = inputPrompt;

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
      let commandActivator; // Deklaracja zmiennej przed blokami warunków

      if (data.response != "timeout 7s ros2 run rover_control test_node") {
        commandActivator = data.response + selectedVehicle;
      } else {
        // Don't add vehicle suffix when running tests
        commandActivator = data.response;
      }

      if (data.response !== "unknown_command") {
        console.log(commandActivator);
        if (["forward_rover", "backward_rover", "left_rover", "right_rover", "stop_rover"].includes(commandActivator)) {
          sendToRobot(commandActivator);
        }
      }
    })
    .catch((error) => {
      console.error(`Error: ${error.message}`);
    });
}


  // Main time parser function logic
  const { firstPart, secondPart, duration } = parsePrompt(prompt);

  if (firstPart) {
    sendToLLM(firstPart);
    if (duration > 0 && secondPart) {
      setTimeout(() => {
        sendToLLM(secondPart);
      }, duration * 1000);
    }
  }
}
