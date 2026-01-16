const express = require("express");
const router = express.Router();

router.post("/register", (req, res) => {
  res.send("User registered");
});

router.post("/host", (req, res) => {
  res.send("Game hosted");
});

module.exports = router;
