const crypto = require("crypto");

const ADJECTIVES = [
  "Calm", "Loving", "Brave", "Swift", "Bold", "Bright", "Clever", "Fierce", "Gentle", "Happy",
  "Lucky", "Mighty", "Noble", "Quiet", "Rising", "Steady", "Sunny", "Wise", "Zen", "Focused",
  "Wild", "Cosmic", "Golden", "Silent", "Daring",
];

const NOUNS = [
  "Panda", "Tiger", "Falcon", "Wolf", "Phoenix", "Lion", "Eagle", "Owl", "Fox", "Bear",
  "Dolphin", "Hawk", "Koala", "Otter", "Raven", "Lynx", "Comet", "Orbit", "Spark", "Storm",
  "River", "Summit", "Ember", "Nova", "Face",
];

const pick = (list) => list[crypto.randomInt(list.length)];

// e.g. "CalmPanda42"
const generateUsername = () => `${pick(ADJECTIVES)}${pick(NOUNS)}${crypto.randomInt(1, 1000)}`;

// Keeps generating until it finds a username no one has taken
const generateUniqueUsername = async (User) => {
  for (let i = 0; i < 20; i++) {
    const username = generateUsername();
    if (!(await User.exists({ username }))) return username;
  }
  throw new Error("Could not generate a unique username");
};

// Platform user id, e.g. "LVL-8F3K2QX9"
const generateUserId = () => `LVL-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

module.exports = { generateUniqueUsername, generateUserId };
