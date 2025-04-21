const express = require("express");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static("uploads")); // Serve uploaded images

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: "./uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    }
});

const upload = multer({ storage: storage });

// Handle Socket.io Connections
io.on("connection", function (socket) {
    socket.on("newuser", function (username) {
        socket.broadcast.emit("update", username + " joined the conversation");
    });

    socket.on("exituser", function (username) {
        socket.broadcast.emit("update", username + " left the conversation");
    });

    socket.on("chat", function (message) {
        socket.broadcast.emit("chat", message);
    });

    // Handle Image Upload and Broadcast
    app.post("/upload", upload.single("image"), (req, res) => {
        if (req.file) {
            const imageUrl = `/uploads/${req.file.filename}`;
            io.emit("image", imageUrl); // Send image URL to all clients
            res.json({ imageUrl });
        } else {
            res.status(400).json({ error: "Image upload failed" });
        }
    });
});

// Start Server
server.listen(5000, () => {
    console.log("Server running on port 5000");
});
