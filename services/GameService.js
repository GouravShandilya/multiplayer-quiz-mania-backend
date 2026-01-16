/**
 * GameService - Core game logic for Quiz Mania
 *
 * This service manages all real-time game operations including:
 * - Room creation and management
 * - Player joining and authentication
 * - Game state machine (waiting → active → reviewing → completed)
 * - Question delivery and timer management
 * - Answer tracking and scoring
 * - Leaderboard generation
 *
 * @class GameService
 * @requires socket.io - For real-time bidirectional communication
 * @requires mongoose - For database operations
 * @requires crypto - For secure token generation
 *
 * @example
 * const gameService = new GameService(io);
 * socket.on("createRoom", (data) => gameService.createRoom(socket, data));
 */

const GameSession = require("../models/GameSession");
const Question = require("../models/Question");
const crypto = require("crypto");
const debug = require("debug")("quiz-mania:game");

/**
 * @typedef {Object} Player
 * @property {string} id - Socket ID
 * @property {string} name - Player display name
 * @property {string} avatar - Avatar seed for dicebear
 * @property {number} score - Current score
 * @property {number} correctCount - Number of correct answers
 * @property {number} wrongCount - Number of wrong answers
 */

/**
 * @typedef {Object} Room
 * @property {string} roomId - 6-digit room code
 * @property {string} hostId - Socket ID of the host
 * @property {string} hostToken - Secure UUID for host authentication
 * @property {string} hostName - Display name of the host
 * @property {Player[]} players - Array of players in the room
 * @property {Object[]} questions - Array of question objects
 * @property {number} currentQuestionIndex - Current question index (-1 = not started)
 * @property {NodeJS.Timer|null} timer - Timer interval reference
 * @property {number} timeLeft - Seconds remaining for current question
 * @property {string} status - Game status: waiting|active|reviewing|completed
 * @property {Object} answers - Nested object of answers by question and player
 * @property {Object} playerAnswerHistory - Answer history for each player
 * @property {Object} answerStats - Answer distribution per question
 */

/**
 * Service to manage game logic, room state, and player interactions.
 */
class GameService {
  /**
   * Creates a new GameService instance
   * @param {import("socket.io").Server} io - Socket.io server instance
   */
  constructor(io) {
    this.io = io;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  // Generate a random 6-digit room code
  generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate a secure host token
  generateHostToken() {
    return crypto.randomUUID();
  }

  // Validate host token for a room
  validateHostToken(roomCode, token) {
    const room = this.rooms.get(roomCode);
    if (!room) return false;
    return room.hostToken === token;
  }

  // Check if room exists
  roomExists(roomCode) {
    return this.rooms.has(roomCode);
  }

  // Verify room exists (socket event)
  verifyRoom(socket, roomCode) {
    const exists = this.roomExists(roomCode);
    socket.emit("roomVerified", { exists, roomCode });
  }

  async createRoom(socket, { hostName, customQuestions }) {
    try {
      if (!hostName) {
        socket.emit("error", { message: "Host name is required" });
        return;
      }

      const roomCode = this.generateRoomCode();
      const hostId = socket.id;
      const hostToken = this.generateHostToken();

      // Fetch questions (Default or Custom)
      let questions = [];
      if (customQuestions && customQuestions.length > 0) {
        questions = customQuestions;
      } else {
        questions = await Question.find({ category: "General" }).limit(10);
      }

      if (questions.length === 0) {
        socket.emit("error", { message: "No questions available" });
        return;
      }

      this.rooms.set(roomCode, {
        roomId: roomCode,
        hostId: hostId,
        hostToken: hostToken, // Secure token for host verification
        hostName: hostName,
        players: [],
        questions: questions,
        currentQuestionIndex: -1,
        timer: null,
        timeLeft: 10,
        status: "waiting", // waiting, active, reviewing, completed
        answers: {}, // { questionIndex: { playerId: answerIndex } }
        playerAnswerHistory: {}, // { playerId: [{ questionIndex, answer, correct, points }] }
        answerStats: {}, // { questionIndex: { 0: count, 1: count, ... } }
      });

      socket.join(roomCode);
      socket.emit("roomCreated", {
        roomCode,
        hostToken, // Send token to host for future verification
        questionsCount: questions.length,
      });
      debug(`Room created: ${roomCode} by ${hostName}`);
    } catch (error) {
      debug("Error creating room: %O", error);
      socket.emit("error", { message: "Failed to create room" });
    }
  }

  joinRoom(socket, { roomCode, playerName, avatar }) {
    try {
      if (!roomCode || !playerName) {
        socket.emit("joinError", {
          message: "Room code and player name are required",
        });
        return;
      }

      const room = this.rooms.get(roomCode);

      if (!room) {
        socket.emit("joinError", {
          message: "Room not found. Please check the code and try again.",
        });
        return;
      }

      if (room.status !== "waiting") {
        socket.emit("joinError", {
          message: "Game already started. Cannot join now.",
        });
        return;
      }

      // Check if name is taken
      if (room.players.some((p) => p.name === playerName)) {
        socket.emit("joinError", {
          message: "Name already taken in this room",
        });
        return;
      }

      const player = {
        id: socket.id,
        name: playerName,
        avatar: avatar || "default",
        score: 0,
        correctCount: 0,
        wrongCount: 0,
      };

      room.players.push(player);
      room.playerAnswerHistory[socket.id] = []; // Initialize answer history
      socket.join(roomCode);

      // Notify everyone in the room
      this.io.to(roomCode).emit("playerJoined", { players: room.players });
      debug(`${playerName} joined room ${roomCode}`);
    } catch (error) {
      debug("Error joining room: %O", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  }

  // Verify host token before allowing host actions
  verifyHost(socket, { roomCode, hostToken }) {
    const isValid = this.validateHostToken(roomCode, hostToken);
    socket.emit("hostVerified", { isValid, roomCode });
    return isValid;
  }

  startGame(socket, { roomCode, hostToken }) {
    try {
      const room = this.rooms.get(roomCode);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      // Verify host token instead of just socket ID
      if (!this.validateHostToken(roomCode, hostToken)) {
        socket.emit("error", {
          message: "Unauthorized. Invalid host credentials.",
        });
        return;
      }

      if (room.players.length === 0) {
        socket.emit("error", { message: "Waiting for players to join" });
        return;
      }

      room.status = "active";
      this.io.to(roomCode).emit("gameStarted");

      // Add a small delay to allow clients (especially host) to navigate and setup listeners
      setTimeout(() => {
        this.nextQuestion(roomCode);
      }, 1500);
    } catch (error) {
      debug("Error starting game: %O", error);
      socket.emit("error", { message: "Failed to start game" });
    }
  }

  nextQuestion(roomCode) {
    try {
      const room = this.rooms.get(roomCode);
      if (!room) return;

      room.currentQuestionIndex++;
      room.timeLeft = 10;
      room.answers[room.currentQuestionIndex] = {};
      room.answerStats[room.currentQuestionIndex] = { 0: 0, 1: 0, 2: 0, 3: 0 };

      if (room.currentQuestionIndex >= room.questions.length) {
        this.endGame(roomCode);
        return;
      }

      const question = room.questions[room.currentQuestionIndex];

      // Send question to players (hide correct answer)
      this.io.to(roomCode).emit("newQuestion", {
        question: {
          text: question.text,
          options: question.options,
          current: room.currentQuestionIndex + 1,
          total: room.questions.length,
        },
        timeLeft: room.timeLeft,
      });

      // Start Timer
      this.startTimer(roomCode);
    } catch (error) {
      debug("Error in nextQuestion: %O", error);
    }
  }

  startTimer(roomCode) {
    const room = this.rooms.get(roomCode);
    if (room.timer) clearInterval(room.timer);

    room.timer = setInterval(() => {
      room.timeLeft--;
      this.io.to(roomCode).emit("timerUpdate", { timeLeft: room.timeLeft });

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        this.revealAnswer(roomCode);
      }
    }, 1000);
  }

  submitAnswer(socket, { roomCode, answerIndex }) {
    try {
      const room = this.rooms.get(roomCode);
      if (!room || room.status !== "active") return;

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      // Prevent multiple answers
      if (room.answers[room.currentQuestionIndex]?.[player.id] !== undefined)
        return;

      if (!room.answers[room.currentQuestionIndex]) {
        room.answers[room.currentQuestionIndex] = {};
      }
      room.answers[room.currentQuestionIndex][player.id] = answerIndex;

      // Update answer stats
      if (room.answerStats[room.currentQuestionIndex]) {
        room.answerStats[room.currentQuestionIndex][answerIndex] =
          (room.answerStats[room.currentQuestionIndex][answerIndex] || 0) + 1;
      }

      socket.emit("answerReceived");

      // Notify host that a player answered
      const hostSocket = this.io.sockets.sockets.get(room.hostId);
      if (hostSocket) {
        const answeredCount = Object.keys(
          room.answers[room.currentQuestionIndex]
        ).length;
        hostSocket.emit("playerAnswered", {
          playerId: player.id,
          playerName: player.name,
          answeredCount,
          totalPlayers: room.players.length,
        });
      }
    } catch (error) {
      debug("Error submitting answer: %O", error);
    }
  }

  revealAnswer(roomCode) {
    try {
      const room = this.rooms.get(roomCode);
      if (!room) return;

      const currentQ = room.questions[room.currentQuestionIndex];
      const correctIndex = currentQ.correctOptionIndex;

      // Update Scores and track answer history
      room.players.forEach((player) => {
        const playerAnswer =
          room.answers[room.currentQuestionIndex]?.[player.id];
        const isCorrect = playerAnswer === correctIndex;
        const pointsEarned = isCorrect ? 10 : 0;

        if (isCorrect) {
          player.score += 10;
          player.correctCount++;
        } else {
          player.wrongCount++;
        }

        // Track answer history for this player
        if (!room.playerAnswerHistory[player.id]) {
          room.playerAnswerHistory[player.id] = [];
        }
        room.playerAnswerHistory[player.id].push({
          questionIndex: room.currentQuestionIndex,
          questionText: currentQ.text,
          options: currentQ.options,
          playerAnswer: playerAnswer !== undefined ? playerAnswer : null,
          correctAnswer: correctIndex,
          isCorrect: isCorrect,
          pointsEarned: pointsEarned,
        });
      });

      // Set status to reviewing so host can review before next question
      room.status = "reviewing";

      // Send correct answer, stats, and updated scores
      this.io.to(roomCode).emit("questionResult", {
        correctOptionIndex: correctIndex,
        answerStats: room.answerStats[room.currentQuestionIndex],
        leaderboard: [...room.players].sort((a, b) => b.score - a.score),
      });

      // Send detailed review data to host
      const hostSocket = this.io.sockets.sockets.get(room.hostId);
      if (hostSocket) {
        const playerAnswers = room.players.map((player) => ({
          id: player.id,
          name: player.name,
          answer: room.answers[room.currentQuestionIndex]?.[player.id],
          isCorrect:
            room.answers[room.currentQuestionIndex]?.[player.id] ===
            correctIndex,
        }));

        hostSocket.emit("hostAnswerReview", {
          questionIndex: room.currentQuestionIndex,
          questionText: currentQ.text,
          options: currentQ.options,
          correctOptionIndex: correctIndex,
          answerStats: room.answerStats[room.currentQuestionIndex],
          playerAnswers: playerAnswers,
          isLastQuestion:
            room.currentQuestionIndex >= room.questions.length - 1,
        });
      }
    } catch (error) {
      debug("Error revealing answer: %O", error);
    }
  }

  // Host advances to next question or leaderboard
  hostAdvance(socket, { roomCode, hostToken }) {
    try {
      const room = this.rooms.get(roomCode);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      if (!this.validateHostToken(roomCode, hostToken)) {
        socket.emit("error", {
          message: "Unauthorized. Invalid host credentials.",
        });
        return;
      }

      if (room.status !== "reviewing") {
        socket.emit("error", { message: "Cannot advance at this time" });
        return;
      }

      // Check if this was the last question
      if (room.currentQuestionIndex >= room.questions.length - 1) {
        this.endGame(roomCode);
      } else {
        room.status = "active";
        this.nextQuestion(roomCode);
      }
    } catch (error) {
      debug("Error in hostAdvance: %O", error);
      socket.emit("error", { message: "Failed to advance game" });
    }
  }

  async endGame(roomCode) {
    try {
      const room = this.rooms.get(roomCode);
      if (!room) return;

      room.status = "completed";

      // Prepare player-specific data with their answer history
      const leaderboard = [...room.players].sort((a, b) => b.score - a.score);

      // Send to each player their personalized game over data
      room.players.forEach((player) => {
        const playerSocket = this.io.sockets.sockets.get(player.id);
        if (playerSocket) {
          playerSocket.emit("gameOver", {
            leaderboard: leaderboard,
            myAnswerHistory: room.playerAnswerHistory[player.id] || [],
            myStats: {
              score: player.score,
              correctCount: player.correctCount,
              wrongCount: player.wrongCount,
              rank: leaderboard.findIndex((p) => p.id === player.id) + 1,
            },
          });
        }
      });

      // Send to host
      const hostSocket = this.io.sockets.sockets.get(room.hostId);
      if (hostSocket) {
        hostSocket.emit("gameOver", {
          leaderboard: leaderboard,
          allPlayerAnswers: room.playerAnswerHistory,
          isHost: true,
        });
      }

      // Save to DB
      try {
        const session = new GameSession({
          hostId: room.hostId,
          roomId: room.roomId,
          players: room.players,
          questions: room.questions
            .map((q) => q._id || null)
            .filter((id) => id),
          status: "completed",
        });
        await session.save();
      } catch (err) {
        debug("Error saving game session: %O", err);
      }

      // Cleanup after a delay to allow clients to receive data
      setTimeout(() => {
        this.rooms.delete(roomCode);
        debug(`Room ${roomCode} cleaned up`);
      }, 60000); // Keep room data for 1 minute after game ends
    } catch (error) {
      debug("Error ending game: %O", error);
    }
  }

  // Handle disconnection
  handleDisconnect(socket) {
    // Find room where this socket is a player or host
    for (const [roomCode, room] of this.rooms.entries()) {
      if (room.hostId === socket.id && room.status === "waiting") {
        // Host disconnected while waiting, close the room
        this.io
          .to(roomCode)
          .emit("roomClosed", { message: "Host disconnected. Room closed." });
        this.rooms.delete(roomCode);
        debug(`Room ${roomCode} closed due to host disconnect`);
        return;
      }

      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        if (room.status === "waiting") {
          // Remove player if game hasn't started
          room.players.splice(playerIndex, 1);
          this.io.to(roomCode).emit("playerLeft", {
            players: room.players,
            playerName: player.name,
          });
          debug(`${player.name} left room ${roomCode}`);
        }
        // If game is active, keep player in list but mark as disconnected (optional enhancement)
        return;
      }
    }
  }
}

module.exports = GameService;
