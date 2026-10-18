const mongoose = require("mongoose");

// One connection per process, shared by every request. On Vercel a warm function reuses it instead
// of opening a new connection on each call; a failed attempt is forgotten so the next request retries.
let connecting = null;

const connectDB = () => {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (!connecting) {
    connecting = mongoose
      .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
      .then((conn) => {
        console.log(`MongoDB connected: ${conn.connection.host}`);
        return conn.connection;
      })
      .catch((err) => {
        connecting = null;
        throw err;
      });
  }
  return connecting;
};

module.exports = connectDB;
