/**
 * Game Routes - REST API endpoints for game-related operations
 * These complement the real-time Socket.io events
 */

const express = require("express");
const router = express.Router();
const Question = require("../models/Question");
const GameSession = require("../models/GameSession");
const { AppError } = require("../middleware/errorHandler");

/**
 * @route   GET /api/game/questions
 * @desc    Get list of available default questions
 * @access  Public
 */
router.get("/questions", async (req, res) => {
    const { category = "General", limit = 10 } = req.query;

    const questions = await Question.find({ category })
        .select('text options category')  // Don't expose correct answer
        .limit(parseInt(limit));

    res.status(200).json({
        status: 'success',
        results: questions.length,
        data: { questions }
    });
});

/**
 * @route   GET /api/game/categories
 * @desc    Get list of available question categories
 * @access  Public
 */
router.get("/categories", async (req, res) => {
    const categories = await Question.distinct('category');

    res.status(200).json({
        status: 'success',
        data: { categories }
    });
});

/**
 * @route   GET /api/game/sessions
 * @desc    Get recent completed game sessions
 * @access  Public
 */
router.get("/sessions", async (req, res) => {
    const { limit = 10 } = req.query;

    const sessions = await GameSession.find({ status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('roomId players createdAt');

    res.status(200).json({
        status: 'success',
        results: sessions.length,
        data: { sessions }
    });
});

/**
 * @route   GET /api/game/sessions/:id
 * @desc    Get details of a specific game session
 * @access  Public
 */
router.get("/sessions/:id", async (req, res) => {
    const session = await GameSession.findById(req.params.id)
        .populate('questions', 'text options category');

    if (!session) {
        throw new AppError('Game session not found', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { session }
    });
});

/**
 * @route   GET /api/game/stats
 * @desc    Get overall game statistics
 * @access  Public
 */
router.get("/stats", async (req, res) => {
    const totalGames = await GameSession.countDocuments({ status: 'completed' });
    const totalQuestions = await Question.countDocuments();

    // Calculate total players across all games
    const playerStats = await GameSession.aggregate([
        { $match: { status: 'completed' } },
        { $unwind: '$players' },
        {
            $group: {
                _id: null,
                totalPlayers: { $sum: 1 },
                avgScore: { $avg: '$players.score' },
                highestScore: { $max: '$players.score' }
            }
        }
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            totalGames,
            totalQuestions,
            totalPlayers: playerStats[0]?.totalPlayers || 0,
            averageScore: Math.round(playerStats[0]?.avgScore || 0),
            highestScore: playerStats[0]?.highestScore || 0
        }
    });
});

/**
 * @route   POST /api/game/questions
 * @desc    Add new questions to the database
 * @access  Admin (TODO: Add authentication)
 */
router.post("/questions", async (req, res) => {
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
        throw new AppError('Please provide an array of questions', 400);
    }

    // Validate each question
    for (const q of questions) {
        if (!q.text || !q.options || q.options.length !== 4 || q.correctOptionIndex === undefined) {
            throw new AppError('Each question must have text, 4 options, and correctOptionIndex', 400);
        }
    }

    const savedQuestions = await Question.insertMany(questions);

    res.status(201).json({
        status: 'success',
        results: savedQuestions.length,
        data: { questions: savedQuestions }
    });
});

module.exports = router;
