const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
    name: String,
    avatar: String,
    score: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    wrongCount: { type: Number, default: 0 },
});

const gameSessionSchema = new mongoose.Schema({
    hostId: {
        type: String,
        required: true,
    },
    roomId: {
        type: String,
        required: true,
    },
    players: [playerSchema],
    questions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Question",
    }],
    status: {
        type: String,
        enum: ["waiting", "active", "completed"],
        default: "waiting",
        index: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400, // Auto-delete after 24 hours
    },
});

// Compound index for host's active sessions
gameSessionSchema.index({ hostId: 1, status: 1 });
gameSessionSchema.index({ roomId: 1 }, { unique: true });

module.exports = mongoose.model("GameSession", gameSessionSchema);
