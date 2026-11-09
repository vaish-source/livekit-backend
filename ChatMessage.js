const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    roomName: {
      type: String,
      required: true,
      trim: true,
    },

    senderIdentity: {
      type: String,
      required: true,
      trim: true,
    },

    senderName: {
      type: String,
      default: "",
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ChatMessage", chatMessageSchema);