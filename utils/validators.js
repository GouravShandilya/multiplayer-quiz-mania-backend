const Joi = require("joi");

const joinRoomSchema = Joi.object({
  roomCode: Joi.string().length(6).required(),
  playerName: Joi.string().min(3).max(20).required(),
  avatar: Joi.string().optional(),
});

const submitAnswerSchema = Joi.object({
  roomCode: Joi.string().length(6).required(),
  answerIndex: Joi.number().integer().min(0).max(3).required(),
});

const createRoomSchema = Joi.object({
  hostName: Joi.string().min(3).max(20).required(),
  customQuestions: Joi.array()
    .items(
      Joi.object({
        text: Joi.string().required(),
        options: Joi.array().items(Joi.string()).length(4).required(),
        correctOptionIndex: Joi.number().integer().min(0).max(3).required(),
      })
    )
    .optional()
    .allow(null),
});

module.exports = {
  joinRoomSchema,
  submitAnswerSchema,
  createRoomSchema,
};
