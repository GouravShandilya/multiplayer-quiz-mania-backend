const mongoose = require("mongoose");
const Question = require("../models/Question");
const dotenv = require("dotenv");
const debug = require("debug")("quiz-mania:script:seed");

dotenv.config();

const questions = [
  {
    text: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correctOptionIndex: 2,
    category: "Geography",
  },
  {
    text: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctOptionIndex: 1,
    category: "Science",
  },
  {
    text: "Who wrote 'Romeo and Juliet'?",
    options: [
      "Charles Dickens",
      "William Shakespeare",
      "Mark Twain",
      "Jane Austen",
    ],
    correctOptionIndex: 1,
    category: "Literature",
  },
  {
    text: "What is the largest mammal in the world?",
    options: ["African Elephant", "Blue Whale", "Giraffe", "Hippopotamus"],
    correctOptionIndex: 1,
    category: "Science",
  },
  {
    text: "In which year did World War II end?",
    options: ["1943", "1944", "1945", "1946"],
    correctOptionIndex: 2,
    category: "History",
  },
  // Add more questions here...
];

const seedDB = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/quiz-mania");
    debug("Connected to MongoDB");

    await Question.deleteMany({ createdBy: "system" });
    debug("Cleared existing system questions");

    const questionsToInsert = [];
    // Generate 100 questions
    for (let i = 0; i < 20; i++) {
      questions.forEach((q) => {
        questionsToInsert.push({
          ...q,
          text: `${q.text} (Copy ${i + 1})`, // Just to make them unique for testing
        });
      });
    }

    await Question.insertMany(questionsToInsert);
    debug(`Seeded ${questionsToInsert.length} questions`);

    process.exit(0);
  } catch (err) {
    debug(err);
    process.exit(1);
  }
};

seedDB();
