require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const { PORT = 5000, MONGO_URI, JWT_SECRET, GROQ_API_KEY, GROQ_MODEL = 'llama-3.3-70b-versatile', CLIENT_ORIGIN = 'http://localhost:5173' } = process.env;

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

const User = mongoose.model('User', userSchema);
const Recipe = mongoose.model('Recipe', recipeSchema);

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

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- AI generation (Groq) ---------- */
app.post('/api/recipes/generate', auth, wrap(async (req, res) => {
  const { ingredients, diet = 'none', servings = 2 } = req.body;
  if (!ingredients || !String(ingredients).trim()) return res.status(400).json({ message: 'Enter at least one ingredient.' });

  const prompt = `You are a professional chef and nutritionist.
Using mainly these ingredients: ${String(ingredients).slice(0, 500)}.
Dietary preference: ${diet}. Servings: ${Number(servings) || 2}.
Suggest 3 different recipes. Respond with ONLY valid JSON in exactly this shape:
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
      temperature: 0.7,
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
    servings: Number(r.servings) || Number(servings) || 2,
    calories: Math.round(Number(r.calories)) || 0,
  }));
  res.json({ recipes });
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
