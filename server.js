
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./services/config/database");
const startScheduler = require("./services/scheduler");
const novu = require("./services/novu");

const Stream = require("./models/Stream");
const ChatMessage = require("./models/ChatMessage");
const BannedParticipant = require("./models/BannedParticipant");

const {
  AccessToken,
  IngressInput,
  TrackSource,
  DataPacket_Kind,
} = require("livekit-server-sdk");
const { roomService, ingressClient } = require("./services/livekit");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Health Check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "LiveKit Backend Running Successfully",
  });
});

// Generate Token Ã¢â‚¬â€ reject currently banned participants
app.post("/generate-token", async (req, res) => {
  try {
    const { roomName, participantName } = req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({
        success: false,
        message: "roomName and participantName are required",
      });
    }

    const banned = await BannedParticipant.findOne({
      roomName,
      identity: participantName,
    });

    if (banned) {
      if (!banned.expiresAt || banned.expiresAt > new Date()) {
        return res.status(403).json({
          success: false,
          message: "You are banned from this room.",
          reason: banned.reason,
          expiresAt: banned.expiresAt,
        });
      }

      await BannedParticipant.deleteOne({ _id: banned._id });
    }

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: participantName }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    return res.json({
      success: true,
      url: process.env.LIVEKIT_URL,
      token: jwt,
    });
  } catch (err) {
    console.error("GENERATE TOKEN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// Generate Viewer Token
app.post("/generate-viewer-token", async (req, res) => {
  try {
    const { roomName, participantName } = req.body;

    if (!roomName || !participantName) {
      return res.status(400).json({
        success: false,
        message: "roomName and participantName are required",
      });
    }

    const banned = await BannedParticipant.findOne({
      roomName,
      identity: participantName,
    });

    if (banned) {
      if (!banned.expiresAt || banned.expiresAt > new Date()) {
        return res.status(403).json({
          success: false,
          message: "You are banned from this room.",
          reason: banned.reason,
          expiresAt: banned.expiresAt,
        });
      }

      await BannedParticipant.deleteOne({ _id: banned._id });
    }

    const token = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { identity: participantName }
    );

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: false,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    return res.json({
      success: true,
      url: process.env.LIVEKIT_URL,
      token: jwt,
    });
  } catch (err) {
    console.error("GENERATE VIEWER TOKEN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Create LiveKit Room
app.post("/create-room", async (req, res) => {
  try {
    const { roomName } = req.body;

    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "roomName is required",
      });
    }

    const room = await roomService.createRoom({
      name: roomName,
      emptyTimeout: 600,
      maxParticipants: 100,
    });

    return res.status(201).json({ success: true, room });
  } catch (err) {
    console.error("CREATE ROOM ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Create Stream
app.post("/streams", async (req, res) => {
  try {
    const {
      roomName,
      title,
      subtitle,
      description,
      bannerUrl,
      artists,
      startTime,
    } = req.body;

    if (!roomName || !title) {
      return res.status(400).json({
        success: false,
        message: "roomName and title are required",
      });
    }

    const existingStream = await Stream.findOne({ roomName });

    if (existingStream) {
      return res.status(409).json({
        success: false,
        message: "Stream already exists for this room",
      });
    }

    const stream = await Stream.create({
      roomName,
      title,
      subtitle: subtitle || "",
      description: description || "",
      bannerUrl: bannerUrl || "",
      artists: artists || [],
      startTime: startTime ? new Date(startTime) : null,
      status: startTime ? "scheduled" : "live",
    });

    return res.status(201).json({ success: true, stream });
  } catch (err) {
    console.error("CREATE STREAM ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Get Stream Details
app.get("/streams/:roomName", async (req, res) => {
  try {
    const stream = await Stream.findOne({
      roomName: req.params.roomName,
    });

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    return res.json({ success: true, stream });
  } catch (err) {
    console.error("GET STREAM ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Update Stream Status and notify n8n when stream becomes live
app.patch("/streams/:roomName/status", async (req, res) => {
  try {
    const { roomName } = req.params;
    const { status } = req.body;

    if (!["scheduled", "live", "ended"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use scheduled, live or ended.",
      });
    }

    const stream = await Stream.findOne({ roomName });

    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    const previousStatus = stream.status;
    stream.status = status;
    await stream.save();

    if (status === "live" && previousStatus !== "live") {
      try {
        const response = await fetch(
          "http://localhost:5678/webhook/livekit-event",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "live_started",
              roomName: stream.roomName,
              title: stream.title,
            }),
          }
        );

        if (!response.ok) {
          console.error("n8n webhook returned HTTP", response.status);
        }

        console.log("n8n Response:", await response.text());
      } catch (n8nError) {
        console.error("N8N NOTIFICATION ERROR:", n8nError.message);
      }

      try {
        const novuResponse = await novu.trigger("live-session-started", {
          to: { subscriberId: "test-user-1" },
          payload: {
            roomName: stream.roomName,
            title: stream.title,
          },
        });
        console.log("Novu notification triggered:", novuResponse);
      } catch (novuError) {
        console.error("NOVU NOTIFICATION ERROR:", novuError.message);
      }
    }

    return res.json({ success: true, stream });
  } catch (err) {
    console.error("UPDATE STREAM STATUS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// List LiveKit Rooms
app.get("/rooms", async (req, res) => {
  try {
    const rooms = await roomService.listRooms();
    return res.json({ success: true, rooms });
  } catch (err) {
    console.error("LIST ROOMS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// List Participants and Viewer Count
app.get("/participants/:roomName", async (req, res) => {
  try {
    const participants = await roomService.listParticipants(
      req.params.roomName
    );

    return res.json({
      success: true,
      participants,
      viewerCount: participants.length,
    });
  } catch (err) {
    console.error("LIST PARTICIPANTS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


 // Mute Participant
app.post("/mute-participant", async (req, res) => {
  try {
    const { roomName, identity, trackSid } = req.body;

    if (!roomName || !identity || !trackSid) {
      return res.status(400).json({
        success: false,
        message: "roomName, identity and trackSid are required",
      });
    }

    await roomService.mutePublishedTrack(
      roomName,
      identity,
      trackSid,
      true
    );

    return res.json({
      success: true,
      message: `${identity} muted successfully.`,
    });
  } catch (err) {
    console.error("MUTE PARTICIPANT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


// Remove Participant (kick)
app.delete("/participant", async (req, res) => {
  try {
    const { roomName, identity } = req.body;

    if (!roomName || !identity) {
      return res.status(400).json({
        success: false,
        message: "roomName and identity are required",
      });
    }

    await roomService.removeParticipant(roomName, identity);

    return res.json({
      success: true,
      message: `${identity} removed successfully.`,
    });
  } catch (err) {
    console.error("REMOVE PARTICIPANT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});



// Ban Participant Ã¢â‚¬â€ omit durationMinutes for permanent ban
app.post("/ban-participant", async (req, res) => {
  try {
    const { roomName, identity, reason, durationMinutes } = req.body;

    if (!roomName || !identity) {
      return res.status(400).json({
        success: false,
        message: "roomName and identity are required",
      });
    }

    if (
      durationMinutes !== undefined &&
      (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "durationMinutes must be a positive number",
      });
    }

    const expiresAt =
      durationMinutes === undefined
        ? null
        : new Date(Date.now() + durationMinutes * 60 * 1000);

    await BannedParticipant.findOneAndUpdate(
      { roomName, identity },
      {
        $set: {
          reason: reason || "No reason provided",
          expiresAt,
        },
        $setOnInsert: { roomName, identity },
      },
      { upsert: true, new: true, runValidators: true }
    );

    try {
      await roomService.removeParticipant(roomName, identity);
    } catch (removeError) {
      // Ban record is saved even if participant is not currently in the room.
      console.log("Participant was not in the room or could not be removed.");
    }

    return res.json({
      success: true,
      message: `${identity} banned successfully.`,
      expiresAt,
    });
  } catch (err) {
    console.error("BAN PARTICIPANT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Delete Room
app.delete("/room/:roomName", async (req, res) => {
  try {
    const { roomName } = req.params;
    await roomService.deleteRoom(roomName);

    return res.json({
      success: true,
      message: `Room '${roomName}' deleted successfully.`,
    });
  } catch (err) {
    console.error("DELETE ROOM ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Create RTMP Ingress
app.post("/create-ingress", async (req, res) => {
  try {
    const { roomName } = req.body;

    if (!roomName) {
      return res.status(400).json({
        success: false,
        message: "roomName is required",
      });
    }

    const ingress = await ingressClient.createIngress(
      IngressInput.RTMP_INPUT,
      {
        name: "OBS Stream",
        roomName,
        participantIdentity: "obs-host",
        participantName: "OBS Broadcaster",
        audio: { source: TrackSource.MICROPHONE },
        video: { source: TrackSource.CAMERA },
      }
    );

    return res.status(201).json({ success: true, ingress });
  } catch (err) {
    console.error("CREATE INGRESS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Save Chat Message
app.post("/chat/messages", async (req, res) => {
  try {
    const { roomName, senderIdentity, senderName, message } = req.body;

    if (!roomName || !senderIdentity || !message) {
      return res.status(400).json({
        success: false,
        message: "roomName, senderIdentity and message are required",
      });
    }

    // Prevent banned users from sending messages through this API.
    const banned = await BannedParticipant.findOne({
      roomName,
      identity: senderIdentity,
    });

    if (banned && (!banned.expiresAt || banned.expiresAt > new Date())) {
      return res.status(403).json({
        success: false,
        message: "You are banned from this room.",
      });
    }

    if (banned && banned.expiresAt && banned.expiresAt <= new Date()) {
      await BannedParticipant.deleteOne({ _id: banned._id });
    }

    const chatMessage = await ChatMessage.create({
      roomName,
      senderIdentity,
      senderName: senderName || "",
      message,
    });


    let realtimePublished = false;

try {
  const realtimeMessage = {
    type: "chat",
    roomName,
    senderIdentity,
    senderName: senderName || "",
    message,
    createdAt: chatMessage.createdAt,
  };

  await roomService.sendData(
    roomName,
    Buffer.from(JSON.stringify(realtimeMessage)),
    DataPacket_Kind.RELIABLE,
    { topic: "chat" }
  );

  realtimePublished = true;
  console.log("REAL-TIME CHAT MESSAGE PUBLISHED");
} catch (publishError) {
  console.error("REAL-TIME CHAT ERROR:", publishError.message);
}

    return res.status(201).json({
      success: true,
      message: "Chat message saved successfully",
      data: chatMessage,
    });
  } catch (err) {
    console.error("CHAT MESSAGE ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to save chat message",
      error: err.message,
    });
  }
});

// Get Chat Message History
app.get("/chat/messages/:roomName", async (req, res) => {
  try {
    const messages = await ChatMessage.find({
      roomName: req.params.roomName,
    })
      .sort({ createdAt: 1 })
      .limit(100);

    return res.json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (err) {
    console.error("CHAT HISTORY ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch chat messages",
      error: err.message,
    });
  }
});

// Connect MongoDB, Start Scheduler and Server
connectDB().then(() => {
  startScheduler();
  app.listen(PORT, () => {
  console.log("=======================================");
  console.log("LiveKit Backend Running Successfully");
  console.log(`Server: http://localhost:${PORT}`);
  console.log("=======================================");
  console.log("Available APIs:");
  console.log("GET      /");
  console.log("POST     /generate-token");
  console.log("POST     /create-room");
  console.log("POST     /streams");
  console.log("GET      /streams/:roomName");
  console.log("PATCH    /streams/:roomName/status");
  console.log("GET      /rooms");
  console.log("GET      /participants/:roomName");
  console.log("DELETE   /participant");
  console.log("POST     /ban-participant");
  console.log("DELETE   /room/:roomName");
  console.log("POST     /create-ingress");
  console.log("POST     /chat/messages");
  console.log("GET      /chat/messages/:roomName");
  console.log("=======================================");
  });
}).catch((err) => {
  console.error("Failed to start backend:", err.message);
  process.exit(1);
});



