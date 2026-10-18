// Keep in sync with PASSWORD_RULES in frontend/src/passwordRules.js
const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, message: "Password must be at least 8 characters" },
  { test: (p) => /[A-Z]/.test(p), message: "Password needs one uppercase letter" },
  { test: (p) => /\d/.test(p), message: "Password needs one number" },
  { test: (p) => /[^A-Za-z0-9]/.test(p), message: "Password needs one special character" },
];

// Checks a new password and its confirmation. Returns an error message, or null when it's fine.
const checkNewPassword = (password, confirmPassword) => {
  if (typeof password !== "string" || !password) return "Enter a new password";
  const failedRule = PASSWORD_RULES.find((rule) => !rule.test(password));
  if (failedRule) return failedRule.message;
  if (password !== confirmPassword) return "Passwords do not match";
  return null;
};

// When a password changes. Tokens issued before it are refused by the auth middleware.
const changedNow = () => new Date();

module.exports = { checkNewPassword, changedNow };
