const mongoose = require("mongoose");

const bannedParticipantSchema = new mongoose.Schema(
  {
    roomName: {
      type: String,
      required: true,
      index: true,
    },
    identity: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      default: "No reason provided",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

bannedParticipantSchema.index(
  { roomName: 1, identity: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "BannedParticipant",
  bannedParticipantSchema
);
