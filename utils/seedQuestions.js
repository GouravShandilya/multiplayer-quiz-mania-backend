const Question = require("../models/Question");
const debug = require('debug')('quiz-mania:seed');

const defaultQuestions = [
    {
        text: "What is the capital of France?",
        options: ["Berlin", "Madrid", "Paris", "Rome"],
        correctOptionIndex: 2,
        category: "General",
    },
    {
        text: "Which planet is known as the Red Planet?",
        options: ["Earth", "Mars", "Jupiter", "Venus"],
        correctOptionIndex: 1,
        category: "General",
    },
    {
        text: "Who wrote 'Romeo and Juliet'?",
        options: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"],
        correctOptionIndex: 1,
        category: "General",
    },
    {
        text: "What is the largest ocean on Earth?",
        options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
        correctOptionIndex: 3,
        category: "General",
    },
    {
        text: "What is the chemical symbol for Gold?",
        options: ["Au", "Ag", "Fe", "Pb"],
        correctOptionIndex: 0,
        category: "General",
    },
];

async function seedQuestions() {
    try {
        const count = await Question.countDocuments();
        if (count === 0) {
            await Question.insertMany(defaultQuestions);
            debug("Default questions seeded successfully");
        } else {
            debug("Questions already exist, skipping seed");
        }
    } catch (err) {
        debug("Error seeding questions: %O", err);
    }
}

module.exports = seedQuestions;
