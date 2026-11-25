require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const {
  PORT = 5000,
  MONGO_URI,
  JWT_SECRET,
  GROQ_API_KEY,
  GROQ_MODEL = 'llama-3.3-70b-versatile',
  CLIENT_ORIGIN = 'http://localhost:5173',
  SMTP_HOST,
  SMTP_PORT = 587,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM = 'Smart Recipe Planner <noreply@recipeplanner.com>'
} = process.env;

for (const [k, v] of Object.entries({ MONGO_URI, JWT_SECRET, GROQ_API_KEY })) {
  if (!v) { console.error(`Missing ${k} in server/.env`); process.exit(1); }
}

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));

/* ---------- Schemas ---------- */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
}, { timestamps: true });

const recipeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  ingredients: [String],
  steps: [String],
  cookTime: { type: String, default: '' },
  servings: { type: Number, default: 2 },
  calories: { type: Number, default: 0 },
  notes: { type: String, default: '' },
}, { timestamps: true });

// Cache schema for sharing recipes across users with matching inputs
const recipeQueryCacheSchema = new mongoose.Schema({
  queryKey: { type: String, required: true, unique: true, index: true },
  recipes: [{
    title: { type: String, required: true },
    description: { type: String, default: '' },
    ingredients: [String],
    steps: [String],
    cookTime: { type: String, default: '' },
    servings: { type: Number, default: 2 },
    calories: { type: Number, default: 0 }
  }],
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Password reset token Schema (expires automatically after 15 minutes)
const passwordResetTokenSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, expires: 900 }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);
const RecipeQueryCache = mongoose.model('RecipeQueryCache', recipeQueryCacheSchema);
const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

// Email Transporter (uses custom SMTP or Ethereal test mailbox for seamless testing)
let mailTransporter = null;
const getMailTransporter = async () => {
  if (mailTransporter) return mailTransporter;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    return mailTransporter;
  }
  // Fallback: create free automatic test ethereal account so emails always work out of the box
  const testAccount = await nodemailer.createTestAccount();
  mailTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass }
  });
  console.log(`[Email] Using automatic Ethereal test mailer: ${testAccount.user}`);
  return mailTransporter;
};

/* ---------- Helpers ---------- */
const signToken = (user) => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err.response?.data || err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

const auth = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Please log in to continue.' });
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(401).json({ message: 'Account no longer exists.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please log in again.' });
  }
};

/* ---------- Auth routes ---------- */
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required.' });
  if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'That email is already registered.' });
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(password || '', user.password))) {
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
}));

/* ---------- Secure Password Reset via Email Link ---------- */
app.post('/api/auth/forgot-password', wrap(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Please provide your registered email.' });

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return res.status(404).json({ message: 'No account registered with this email.' });

  // Generate a cryptographically secure random reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Store/replace reset token in database
  await PasswordResetToken.deleteMany({ email: email.toLowerCase() });
  await PasswordResetToken.create({ email: email.toLowerCase(), token: resetToken, expiresAt });

  // Direct reset link pointing to the frontend client
  const resetLink = `${CLIENT_ORIGIN}/?resetToken=${resetToken}&email=${encodeURIComponent(user.email)}`;

  const transporter = await getMailTransporter();
  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to: user.email,
    subject: 'Reset Your Password - Smart Recipe Planner',
    text: `Hello ${user.name},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${resetLink}\n\nThis link will expire in 15 minutes.\n\nSmart Recipe Planner Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f766e; margin-top: 0;">Smart Recipe Planner</h2>
        <p style="color: #334155; font-size: 15px;">Hello <strong>${user.name}</strong>,</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.5;">We received a request to reset your password. Click the button below to choose a new password:</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetLink}" style="background-color: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 13px;">Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 12px; color: #0d9488;"><a href="${resetLink}" style="color: #0d9488;">${resetLink}</a></p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">This reset link will expire in 15 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>
    `
  });

  // Always print the exact reset link in the console
  console.log('\n=========================================');
  console.log(`[PASSWORD RESET LINK for ${user.email}]:`);
  console.log(resetLink);
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`[View Sent Email in Browser]: ${previewUrl}`);
  }
  console.log('=========================================\n');

  res.json({
    message: `A password reset link has been sent directly to ${user.email}. Please check your inbox.`
  });
}));

app.post('/api/auth/reset-password', wrap(async (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: 'Email, reset token, and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });
  }

  // Verify Reset Token
  const record = await PasswordResetToken.findOne({ email: email.toLowerCase(), token });
  if (!record || record.expiresAt < new Date()) {
    return res.status(400).json({ message: 'This password reset link is invalid or has expired. Please request a new one.' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(404).json({ message: 'User account not found.' });
  }

  // Update password and revoke the reset token
  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  await PasswordResetToken.deleteMany({ email: email.toLowerCase() });

  res.json({ message: 'Password has been changed successfully! You can now log in.' });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- AI generation (Groq) with Recipe Sharing Cache & Search ---------- */
const normalizeIngredients = (inputStr) => {
  return String(inputStr || '')
    .toLowerCase()
    .split(/[,;\n]+/)
    .map((s) => s.trim().replace(/^and\s+/, ''))
    .filter(Boolean)
    .sort()
    .join('|');
};

// Search saved recipes by dish name across the user's collection or community
app.get('/api/recipes/search', auth, wrap(async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ recipes: [] });

  const regex = new RegExp(query, 'i');

  // Search personal saved recipes first
  const personal = await Recipe.find({
    user: req.user._id,
    $or: [{ title: regex }, { description: regex }, { ingredients: regex }]
  }).sort({ createdAt: -1 });

  // Also search community-cached recipes matching the name
  const communityCaches = await RecipeQueryCache.find({
    'recipes.title': regex
  }).limit(5);

  const communityRecipes = [];
  communityCaches.forEach((c) => {
    c.recipes.forEach((r) => {
      if (regex.test(r.title) && !personal.some((p) => p.title.toLowerCase() === r.title.toLowerCase())) {
        communityRecipes.push({ ...r.toObject(), isCommunity: true });
      }
    });
  });

  res.json({ personal, community: communityRecipes });
}));

app.post('/api/recipes/generate', auth, wrap(async (req, res) => {
  const { ingredients, diet = 'none', servings = 2, refresh = false } = req.body;
  if (!ingredients || !String(ingredients).trim()) return res.status(400).json({ message: 'Enter at least one ingredient.' });

  const normIng = normalizeIngredients(ingredients);
  const normDiet = String(diet).toLowerCase().trim();
  const normServings = Number(servings) || 2;
  const queryKey = `${normIng}::${normDiet}::${normServings}`;

  // If refresh is false, check if matched recipes already exist in the community cache
  if (!refresh) {
    const cached = await RecipeQueryCache.findOne({ queryKey });
    if (cached && cached.recipes && cached.recipes.length > 0) {
      return res.json({ recipes: cached.recipes, shared: true });
    }
  }

  // Generate completely fresh, unique recipes with AI
  const prompt = `You are an innovative master chef.
Using mainly these ingredients: ${String(ingredients).slice(0, 500)}.
Dietary preference: ${diet}. Servings: ${normServings}.
${refresh ? 'Provide brand new, unique, completely different recipe variations from conventional recipes.' : 'Suggest 3 different recipes.'}
Respond with ONLY valid JSON in exactly this shape:
{"recipes":[{"title":"string","description":"one sentence","ingredients":["quantity + item"],"steps":["step"],"cookTime":"e.g. 25 min","servings":2,"calories":450}]}
"calories" is an integer per serving. Do not include any text outside the JSON.`;

  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You output strictly valid JSON and nothing else.' },
        { role: 'user', content: prompt },
      ],
      temperature: refresh ? 0.95 : 0.7, // Higher temperature generates creative fresh dishes
      response_format: { type: 'json_object' },
    },
    { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 30000 }
  );

  let parsed;
  try {
    const raw = data.choices[0].message.content.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(raw);
  } catch {
    return res.status(502).json({ message: 'The AI returned an unreadable answer. Please try again.' });
  }

  const recipes = (parsed.recipes || []).map((r) => ({
    title: String(r.title || 'Untitled recipe'),
    description: String(r.description || ''),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(String) : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
    cookTime: String(r.cookTime || ''),
    servings: Number(r.servings) || normServings || 2,
    calories: Math.round(Number(r.calories)) || 0,
  }));

  if (recipes.length > 0) {
    await RecipeQueryCache.findOneAndUpdate(
      { queryKey },
      { queryKey, recipes, generatedBy: req.user._id },
      { upsert: true, new: true }
    );
  }

  res.json({ recipes, shared: false });
}));

/* ---------- Recipe CRUD (scoped to the logged-in user) ---------- */
app.post('/api/recipes', auth, wrap(async (req, res) => {
  const { title, description, ingredients, steps, cookTime, servings, calories } = req.body;
  if (!title) return res.status(400).json({ message: 'A recipe needs a title.' });
  const recipe = await Recipe.create({ user: req.user._id, title, description, ingredients, steps, cookTime, servings, calories });
  res.status(201).json(recipe);
}));

app.get('/api/recipes', auth, wrap(async (req, res) => {
  res.json(await Recipe.find({ user: req.user._id }).sort({ createdAt: -1 }));
}));

app.put('/api/recipes/:id', auth, wrap(async (req, res) => {
  const recipe = await Recipe.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { notes: String(req.body.notes ?? '').slice(0, 1000) } },
    { new: true }
  );
  if (!recipe) return res.status(404).json({ message: 'Recipe not found.' });
  res.json(recipe);
}));

app.delete('/api/recipes/:id', auth, wrap(async (req, res) => {
  const result = await Recipe.deleteOne({ _id: req.params.id, user: req.user._id });
  if (!result.deletedCount) return res.status(404).json({ message: 'Recipe not found.' });
  res.json({ message: 'Recipe deleted.' });
}));

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));

mongoose.connect(MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`)))
  .catch((err) => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
