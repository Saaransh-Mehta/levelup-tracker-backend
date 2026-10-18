require("dotenv").config();
const mongoose = require("mongoose");

const testDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ Connected to MongoDB: ${mongoose.connection.host}`);
    console.log(`   Database: ${mongoose.connection.name}`);

    // Write, read and delete a test document
    const Test = mongoose.model("ConnectionTest", new mongoose.Schema({ message: String }));
    const doc = await Test.create({ message: "connection test" });
    const found = await Test.findById(doc._id);
    console.log(`✅ Write/read OK: "${found.message}"`);
    await Test.deleteOne({ _id: doc._id });
    await mongoose.connection.db.dropCollection("connectiontests");
    console.log("✅ Cleanup OK");
  } catch (err) {
    console.error(`❌ MongoDB test failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

testDB();
