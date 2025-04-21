console.log("Script loaded successfully!");

const socket = io();

// RSA Key Pair
let rsaKeyPair = null;
let publicKeyPem = null;
let privateKeyPem = null;

socket.on("connect", () => {
    console.log("Connected to server! Socket ID:", socket.id);
    generateRSAKeys();
    console.log("Your Public Key:\n" + publicKeyPem);
});

socket.on("disconnect", () => {
    console.log("Disconnected from server!");
});

// Generate RSA Keys
function generateRSAKeys() {
    rsaKeyPair = forge.pki.rsa.generateKeyPair(1024);
    publicKeyPem = forge.pki.publicKeyToPem(rsaKeyPair.publicKey);
    privateKeyPem = forge.pki.privateKeyToPem(rsaKeyPair.privateKey);
    console.log("RSA Key Pair Generated!");
}

// Function to Sign Data
function signData(data) {
    const md = forge.md.sha256.create();
    md.update(data, "utf8");
    return forge.util.encode64(rsaKeyPair.privateKey.sign(md));
}

// Function to Verify Signature
function verifySignature(data, signature, senderPublicKeyPem) {
    const senderPublicKey = forge.pki.publicKeyFromPem(senderPublicKeyPem);
    const md = forge.md.sha256.create();
    md.update(data, "utf8");
    return senderPublicKey.verify(md.digest().bytes(), forge.util.decode64(signature));
}

document.addEventListener("DOMContentLoaded", function () {
    const app = document.querySelector(".app");
    let uname = "";
    let peerPublicKeyPem = ""; // Will store manually entered public key

    let usernameInput = document.getElementById("Username");
    let joinButton = document.getElementById("join_user");
    let messageInput = document.getElementById("message-input");
    let sendButton = document.getElementById("send-message");
    // add 2 lines for image
    let imageInput = document.getElementById("image-input");
    let sendImageButton = document.getElementById("send-image");
    let messagesContainer = document.querySelector(".messages");

    usernameInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            joinButton.click();
        }
    });

    joinButton.addEventListener("click", function () {
        let username = usernameInput.value.trim();
        if (username !== "") {
            uname = username;
            socket.emit("newuser", username);
            document.querySelector(".join-screen").classList.remove("active");
            document.querySelector(".chat-screen").classList.add("active");

            // Show modal to input public key
            document.getElementById("key-modal").style.display = "block";
        }
    });

    // Handle Public Key Submission
    document.getElementById("submit-key").addEventListener("click", function () {
        peerPublicKeyPem = document.getElementById("key-input").value.trim();

        if (!peerPublicKeyPem.includes("-----BEGIN PUBLIC KEY-----")) {
            alert("Invalid Public Key format. Please paste the entire PEM-formatted key.");
            return;
        }

        document.getElementById("key-modal").style.display = "none";
    });

    messageInput.addEventListener("keypress", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            sendButton.click();
        }
    });

    // Send RSA Encrypted Message
    sendButton.addEventListener("click", function () {
        let message = messageInput.value.trim();
        if (message !== "") {
            if (!peerPublicKeyPem) {
                alert("Receiver's public key not set!");
                return;
            }
    
            const receiverPublicKey = forge.pki.publicKeyFromPem(peerPublicKeyPem);
            const encryptedMessage = receiverPublicKey.encrypt(forge.util.encodeUtf8(message), "RSA-OAEP");
            const encryptedMessageBase64 = forge.util.encode64(encryptedMessage);
            const signature = signData(message);
    
            console.log("Original Message:", message);
            console.log("Encrypted Message (Base64):", encryptedMessageBase64);  
    
            socket.emit("chat", {
                username: uname,
                encryptedMessage: encryptedMessageBase64,
                signature: signature, // Include this
                type: "text"
            });
            
    
            renderMessage("my", { username: uname, text: message, type: "text" });
            messageInput.value = "";
        }
    });

    // Image Upload and Send
    sendImageButton.addEventListener("click", function () {
        const file = imageInput.files[0];
        if (!file) {
            alert("Please select an image first!");
            return;
        }
    
        const reader = new FileReader();
        reader.onload = function (event) {
            const arrayBuffer = event.target.result;
            
            // Efficiently convert Uint8Array to binary string
            const uint8Array = new Uint8Array(arrayBuffer);
            let binaryString = "";
            for (let i = 0; i < uint8Array.length; i++) {
                binaryString += String.fromCharCode(uint8Array[i]);
            }
    
            if (!peerPublicKeyPem) {
                alert("Receiver's public key not set!");
                return;
            }
    
            // Generate a random AES key
            const aesKey = forge.random.getBytesSync(16); // 128-bit AES key
    
            // Encrypt image using AES
            const cipher = forge.cipher.createCipher("AES-CBC", aesKey);
            cipher.start({ iv: aesKey }); // Use AES key as IV (for simplicity)
            cipher.update(forge.util.createBuffer(binaryString));
            cipher.finish();
            const encryptedImage = cipher.output.getBytes();
    
            // Encrypt AES key with RSA
            const receiverPublicKey = forge.pki.publicKeyFromPem(peerPublicKeyPem);
            const encryptedAesKey = receiverPublicKey.encrypt(aesKey, "RSA-OAEP");
    
            // Convert to Base64
            const encryptedImageBase64 = forge.util.encode64(encryptedImage);
            const encryptedAesKeyBase64 = forge.util.encode64(encryptedAesKey);
    
            // Send encrypted AES key and image
            socket.emit("chat", {
                username: uname,
                encryptedAesKey: encryptedAesKeyBase64,
                encryptedImage: encryptedImageBase64,
                type: "image"
            });
    
            // Show preview
            renderMessage("my", { 
                username: uname, 
                image: "data:image/jpeg;base64," + forge.util.encode64(binaryString), 
                type: "image" 
            });
    
            imageInput.value = "";
        };
    
        reader.readAsArrayBuffer(file);
    });
    
    


    // Receive RSA Encrypted Message
    socket.on("chat", function (message) {
        if (message.type === "text") {
            console.log("Received Encrypted Message (Base64):", message.encryptedMessage);
    
            const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
            const encryptedMessageDecoded = forge.util.decode64(message.encryptedMessage);
            const decryptedMessage = privateKey.decrypt(encryptedMessageDecoded, "RSA-OAEP");
            const isVerified = verifySignature(decryptedMessage, message.signature, peerPublicKeyPem);
    
            console.log("Decrypted Message:", forge.util.decodeUtf8(decryptedMessage), "| Verified:", isVerified);

renderMessage("other", { 
    username: message.username, 
    text: forge.util.decodeUtf8(decryptedMessage) , 
    type: "text" 
});

        } else if (message.type === "image") {
            // console.log("Received Encrypted AES Key (Base64):", message.encryptedAesKey);
            console.log("Received Encrypted Image (Base64):", message.encryptedImage);
            
            const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    
            // Decrypt AES key using RSA
            const encryptedAesKeyDecoded = forge.util.decode64(message.encryptedAesKey);
            const decryptedAesKey = privateKey.decrypt(encryptedAesKeyDecoded, "RSA-OAEP");
    
            // Decrypt image using AES
            const encryptedImageDecoded = forge.util.decode64(message.encryptedImage);
            const decipher = forge.cipher.createDecipher("AES-CBC", decryptedAesKey);
            decipher.start({ iv: decryptedAesKey });
            decipher.update(forge.util.createBuffer(encryptedImageDecoded));
            decipher.finish();
            const decryptedImage = decipher.output.getBytes();
    
            // Convert to Base64
            const decryptedImageBase64 = forge.util.encode64(decryptedImage);
    
            console.log("Decrypted Image (Base64):", decryptedImageBase64);
    
            // Render received image
            renderMessage("other", { 
                username: message.username, 
                image: "data:image/jpeg;base64," + decryptedImageBase64, 
                type: "image" 
            });
        }
    });

    socket.on("update", function (update) {
        renderMessage("update", update);
    });

    document.getElementById("exit-chat").addEventListener("click", function () {
        socket.emit("exituser", uname);
        window.location.href = window.location.href;
    });

    function renderMessage(type, message) {
        let messageContainer = app.querySelector(".chat-screen .messages");
        let el = document.createElement("div");
    
        if (type === "my") {
            el.setAttribute("class", "message my-message");
        } else if (type === "other") {
            el.setAttribute("class", "message other-message");
        } else if (type === "update") {
            el.setAttribute("class", "update");
            el.innerText = message;
            messageContainer.appendChild(el);
            messageContainer.scrollTop = messageContainer.scrollHeight - messageContainer.clientHeight;
            return;
        }
    
        if (message.type === "text") {
            el.innerHTML = `
                <div>
                    <div class="name">${type === "my" ? "You" : message.username}</div>
                    <div class="text">${message.text}</div>
                </div>
            `;
        } else if (message.type === "image") {
            el.innerHTML = `
                <div>
                    <div class="name">${type === "my" ? "You" : message.username}</div>
                    <div class="text">
                        <img src="${message.image}" alt="Sent Image" style="max-width: 200px; border-radius: 10px;">
                    </div>
                </div>
            `;
        }
    
        messageContainer.appendChild(el);
        messageContainer.scrollTop = messageContainer.scrollHeight - messageContainer.clientHeight;
    }
});    