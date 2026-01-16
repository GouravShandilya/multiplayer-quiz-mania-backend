const mongoose = require('mongoose');
const Question = require('../models/Question');
const dotenv = require('dotenv');
const debug = require('debug')('quiz-mania:script:perf');

dotenv.config();

const runPerfTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/quiz-mania");

        debug("Starting performance test...");

        const start = process.hrtime();

        // Perform 1000 queries
        for (let i = 0; i < 1000; i++) {
            await Question.find({ category: "Science" }).limit(10);
        }

        const end = process.hrtime(start);
        const timeInMs = (end[0] * 1000 + end[1] / 1e6).toFixed(2);

        debug(`Executed 1000 queries in ${timeInMs}ms`);

        process.exit(0);
    } catch (err) {
        debug(err);
        process.exit(1);
    }
};

runPerfTest();
