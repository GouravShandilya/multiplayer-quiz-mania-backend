const { Server } = require("socket.io");
const GameService = require("./services/GameService");
const debug = require('debug')('quiz-mania:socket');

let io;

const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // Allow all origins for now, restrict in production
            methods: ["GET", "POST"],
        },
    });

    const gameService = new GameService(io);

    const { RateLimiterMemory } = require("rate-limiter-flexible");
    const { joinRoomSchema, submitAnswerSchema, createRoomSchema } = require("./utils/validators");

    const rateLimiter = new RateLimiterMemory({
        points: 10, // 10 points
        duration: 1, // per second
    });

    const handleEvent = async (socket, data, schema, action) => {
        try {
            await rateLimiter.consume(socket.id);
            if (schema) {
                const { error } = schema.validate(data);
                if (error) {
                    socket.emit("error", { message: error.details[0].message });
                    return;
                }
            }
            await action(socket, data);
        } catch (rejRes) {
            if (rejRes instanceof Error) {
                console.error("Socket error:", rejRes.message);
                // Don't emit internal errors to client always, but for validation/rate limit it's fine
            } else {
                socket.emit("error", { message: "Too many requests" });
            }
        }
    };

    io.on("connection", (socket) => {
        debug("Socket connected: %s", socket.id);

        // Room Verification (check if room exists before joining)
        socket.on("verifyRoom", (roomCode) => handleEvent(socket, roomCode, null, (s, d) => gameService.verifyRoom(s, d)));

        // Host Events
        socket.on("createRoom", (data) => handleEvent(socket, data, createRoomSchema, (s, d) => gameService.createRoom(s, d)));
        socket.on("verifyHost", (data) => handleEvent(socket, data, null, (s, d) => gameService.verifyHost(s, d)));
        socket.on("startGame", (data) => handleEvent(socket, data, null, (s, d) => gameService.startGame(s, d)));
        socket.on("hostAdvance", (data) => handleEvent(socket, data, null, (s, d) => gameService.hostAdvance(s, d)));

        // Player Events
        socket.on("joinRoom", (data) => handleEvent(socket, data, joinRoomSchema, (s, d) => gameService.joinRoom(s, d)));
        socket.on("submitAnswer", (data) => handleEvent(socket, data, submitAnswerSchema, (s, d) => gameService.submitAnswer(s, d)));

        socket.on("disconnect", () => {
            debug("Socket disconnected: %s", socket.id);
            gameService.handleDisconnect(socket);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = { initializeSocket, getIO };
