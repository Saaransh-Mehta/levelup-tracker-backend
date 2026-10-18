// Local development server. On Vercel, api/index.js serves the same app as a function instead.
const app = require("./app");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5000;

const start = async () => {
  if (process.env.MONGO_URI) {
    try {
      await connectDB();
    } catch (err) {
      console.error(`MongoDB connection error: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.warn("MONGO_URI not set — skipping database connection");
  }
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start();
