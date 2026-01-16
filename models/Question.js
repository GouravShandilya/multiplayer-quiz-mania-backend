const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
    },
    options: {
        type: [String],
        required: true,
        validate: [arrayLimit, "{PATH} must have exactly 4 options"],
    },
    correctOptionIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 3,
    },
    category: {
        type: String,
        default: "General",
        index: true,
    },
    createdBy: {
        type: String, // 'system' or hostId
        default: "system",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

function arrayLimit(val) {
    return val.length === 4;
}

module.exports = mongoose.model("Question", questionSchema);
