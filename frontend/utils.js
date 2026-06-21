function addMessage(text, sender) {
    const chatBox = document.getElementById("chat-box");

    if (!chatBox) {
        console.error("chat-box not found");
        return null;
    }

    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${sender}`;

    if (sender === "assistant" && typeof marked !== "undefined") {
        msgDiv.innerHTML = marked.parse(text);
    } else {
        msgDiv.innerText = text;
    }

    chatBox.appendChild(msgDiv);

    if (typeof smartScroll === "function") {
        smartScroll(chatBox);
    } else {
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    return msgDiv;
}