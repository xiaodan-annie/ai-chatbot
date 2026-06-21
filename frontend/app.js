const renderer = new marked.Renderer();

renderer.code = function (code, infostring, escaped) {

    // FIX: normalize input safely
    let rawCode = "";
HTMLOutputElement
    if (typeof code === "string") {
        rawCode = code;
    } else if (code && typeof code.text === "string") {
        rawCode = code.text;
    } else {
        rawCode = String(code || "");
    }

    const safeCode = rawCode
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    return `
        <div class="code-block-wrapper">

            <button class="copy-btn" onclick="copyCode(this)">
                Copy
            </button>

            <pre><code>${safeCode}</code></pre>

        </div>
    `;
};

marked.setOptions({ renderer });


let activeConversationElement = null;
let currentConversationId = null;

// =====================
// Session Setup
// =====================
let sessionId = localStorage.getItem("session_id");

if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("session_id", sessionId);
}

// =====================
// Initialize App
// =====================
window.addEventListener("load", async () => {
    await createNewChat();
    await loadConversations();
});

// =====================
// Create New Chat
// =====================
async function createNewChat() {
    const response = await fetch(
        //`http://127.0.0.1:8000/new-chat?session_id=${sessionId}`,
        `https://ai-chatbot-5srb.onrender.com/new-chat?session_id=${sessionId}`,
        {
            method: "POST"
        }
    );
    const data = await response.json();
    currentConversationId = data.conversation_id;
    document.getElementById("chat-box").innerHTML = "";
    activeConversationElement = null;
    await loadConversations();
    // 🔥 ADD THIS
    await loadMessages(currentConversationId);
}

// =====================
// Load Sidebar Conversations
// =====================
async function loadConversations() {
    const response = await fetch(
        //`http://127.0.0.1:8000/conversations/${sessionId}`
        `https://ai-chatbot-5srb.onrender.com/conversations/${sessionId}`
    );

    const conversations = await response.json();

    const list = document.getElementById("conversation-list");

    list.innerHTML = "";

    conversations.forEach(convo => {
        const div = document.createElement("div");
        div.className = "conversation-item";

        div.innerHTML = `
            <div class="conversation-header">

                <span class="conversation-title">
                    ${convo.title}
                </span>

                <button
                    class="delete-btn"
                    onclick="event.stopPropagation();
                    deleteConversation(${convo.id})"
                >
            🗑
                </button>

            </div>

            <small>${convo.created_at}</small>
        `;

        div.onclick = async () => {

            currentConversationId = convo.id;

            await loadMessages(convo.id);

            // Remove previous highlight
            if (activeConversationElement) {
                activeConversationElement.classList.remove("active");
            }

            // Set new highlight
            div.classList.add("active");

            activeConversationElement = div;
        };


        list.appendChild(div);
    });
}

// =====================
// Send Message (Streaming)
// =====================
async function sendMessage() {
    try {
        const messageInput = document.getElementById("message");
        const chatBox = document.getElementById("chat-box");

        const userMessage = messageInput.value;
        const selectedLanguage = document.getElementById("language-select").value;

        //add some log messages
        console.log("sendMessage called");
        console.log("currentConversationId BEFORE:",
                currentConversationId);
        console.log("User message:", userMessage);

        if (!userMessage.trim()) {
            console.log("Empty message, exiting");
            return;
        }

        //if (!userMessage.trim()) return;
        // end of log messages
        console.log("Passed empty-message check");
        console.log("Adding user bubble");

        console.log("Calling addMessage()");
        addMessage(userMessage, "user");
        console.log("addMessage completed");

        console.log("Building payload");

        // Ensure conversation exists
        if (!currentConversationId) {
            await createNewChat();
        }

        // Add user bubble
        const userDiv = document.createElement("div");
        userDiv.className = "message user";
        userDiv.innerText = userMessage;
        chatBox.appendChild(userDiv);

        messageInput.value = "";

        // Add AI bubble
        const aiDiv = document.createElement("div");
        aiDiv.className = "message assistant";
        aiDiv.innerText = "";
        chatBox.appendChild(aiDiv);

        //chatBox.scrollTop = chatBox.scrollHeight;
        smartScroll(chatBox);

        // Send request
        console.log("Calling URL:",
            "https://ai-chatbot-5srb.onrender.com/chat");
        const response = await fetch(
            //"http://127.0.0.1:8000/chat",
            "https://ai-chatbot-5srb.onrender.com/chat",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: userMessage,
                    language: selectedLanguage,
                    session_id: sessionId,
                    conversation_id: currentConversationId
                })
            }
        );
        console.log("Response received");
        console.log("Status:", response.status);
        /*
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            fullText += chunk;

            aiDiv.innerText = fullText;
            //chatBox.scrollTop = chatBox.scrollHeight;
            smartScroll(chatBox);
        }

        // FINAL markdown render (after streaming ends)
        aiDiv.innerHTML = marked.parse(fullText);
        */
        const text = await response.text();

        console.log("RAW RESPONSE:");
        console.log(text);

        aiDiv.innerText = text;
    } catch (err) {

        console.error(
            "sendMessage FAILED:",
            err
        );

    }
}

// =====================
// Enter Key Support
// =====================
document.getElementById("message").addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

async function loadMessages(conversationId) {

    const chatBox =
        document.getElementById("chat-box");

    chatBox.innerHTML = "";

    const response = await fetch(
        //`http://127.0.0.1:8000/messages/${conversationId}`
        `https://ai-chatbot-5srb.onrender.com/messages/${conversationId}`
    );

    const messages = await response.json();

    messages.forEach(msg => {

        const div = document.createElement("div");

        if (msg.role === "user") {
            div.className = "message user";
        } else {
            div.className = "message assistant";
        }

        div.innerText = msg.content;

        chatBox.appendChild(div);
    });

    //chatBox.scrollTop = chatBox.scrollHeight;
    smartScroll(chatBox);
}

async function deleteConversation(conversationId) {

    const confirmed = confirm(
        "Delete this conversation?"
    );

    if (!confirmed) return;

    await fetch(
        //`http://127.0.0.1:8000/conversation/${conversationId}`,
        `https://ai-chatbot-5srb.onrender.com/conversation/${conversationId}`,
        {
            method: "DELETE"
        }
    );

    // Clear current chat if deleted
    if (currentConversationId === conversationId) {

        document.getElementById(
            "chat-box"
        ).innerHTML = "";

        currentConversationId = null;
    }

    await loadConversations();
}
function showTypingIndicator(chatBox) {

    const typingDiv = document.createElement("div");

    typingDiv.className = "message assistant";
    typingDiv.id = "typing-indicator";

    typingDiv.innerHTML = `
        <span class="dot">.</span>
        <span class="dot">.</span>
        <span class="dot">.</span>
    `;

    chatBox.appendChild(typingDiv);
    //chatBox.scrollTop = chatBox.scrollHeight;
    smartScroll(chatBox);
}
function removeTypingIndicator() {

    const el = document.getElementById("typing-indicator");

    if (el) el.remove();
}

function copyCode(button) {

    const codeBlock =
        button.parentElement.querySelector("code");

    navigator.clipboard.writeText(codeBlock.innerText);

    button.innerText = "Copied!";

    setTimeout(() => {
        button.innerText = "Copy";
    }, 1200);
}

function smartScroll(chatBox) {

    const threshold = 120;

    const distanceFromBottom =
        chatBox.scrollHeight -
        chatBox.scrollTop -
        chatBox.clientHeight;

    const isNearBottom = distanceFromBottom < threshold;

    if (isNearBottom) {
        chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: "smooth"
        });
    }
}