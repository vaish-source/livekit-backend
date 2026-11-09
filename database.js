const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb://root:secret@127.0.0.1:27017/novu-db?authSource=admin"
    );

    console.log("✅ MongoDB Connected");
    console.log("MongoDB Host:", mongoose.connection.host);
    console.log("MongoDB Database:", mongoose.connection.name);
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    
  }
};

module.exports = connectDB;