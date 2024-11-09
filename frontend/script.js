document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault(); 
    
    const password = document.getElementById('password').value;

    if (password === 'admin') {
        document.getElementById('login').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
    } else {
        alert('Invalid password!');
    }
});

// Chatbox functionality
const sendButton = document.getElementById('sendButton');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');

sendButton.addEventListener('click', sendMessage);

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        // Create a new message element with the logged-in username
        const userMessage = document.createElement('p');
        userMessage.classList.add('user-message');
        userMessage.textContent = `${document.getElementById('username').value}: ${message}`; // Use the stored username
        chatMessages.appendChild(userMessage);

        // Clear the input field
        chatInput.value = '';

        // Scroll to the bottom of the chat
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// Send message on Enter key press
chatInput.addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});