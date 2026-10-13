require('dotenv').config();

// Refuse to start in production with a missing/guessable signing key: anyone who knew it could mint admin tokens.
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32 || /change-this/i.test(secret)) {
    console.error('JWT_SECRET must be a random string of at least 32 characters in production.');
    process.exit(1);
  }
  if (!process.env.CORS_ORIGIN) {
    console.error('CORS_ORIGIN must be set in production (the web app URL, e.g. https://your-app.onrender.com).');
    process.exit(1);
  }
}

const app = require('./app');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`LabSync Pro backend running on http://localhost:${PORT}`);
});
