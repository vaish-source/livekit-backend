const mongoose = require("mongoose");

const artistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      required: true,
    },
  },
  {
    _id: false,
  }
);

const streamSchema = new mongoose.Schema(
  {
    roomName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    subtitle: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    bannerUrl: {
      type: String,
      default: "",
    },

    artists: {
      type: [artistSchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["scheduled", "live", "ended"],
      default: "scheduled",
    },

    startTime: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Stream", streamSchema);
