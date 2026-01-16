const mongoose = require('mongoose');
const dotenv = require('dotenv');
const debug = require('debug')('quiz-mania:script:migrate');

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/quiz-mania");
        debug("Connected to MongoDB");

        // Example Migration: Rename a field or update data structure
        // const result = await mongoose.connection.collection('questions').updateMany(
        //   { oldField: { $exists: true } },
        //   { $rename: { "oldField": "newField" } }
        // );

        // debug(`Migration completed. Modified ${result.modifiedCount} documents.`);

        debug("No migration tasks defined.");

        process.exit(0);
    } catch (err) {
        debug("Migration failed: %O", err);
        process.exit(1);
    }
};

migrate();
