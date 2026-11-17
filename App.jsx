import { useEffect, useState } from 'react';
import api, { errorText } from './api.js';
import RecipeCard from './RecipeCard.jsx';
import SavedRecipes from './SavedRecipes.jsx';

const input = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600';
const primaryBtn = 'rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50';

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/auth/${mode}`, form);
      localStorage.setItem('token', data.token);
      onAuth(data.user);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-stone-200 bg-white p-6">
      <h1 className="text-xl font-semibold text-stone-900">Smart Recipe Planner</h1>
      <p className="mt-1 text-sm text-stone-600">{mode === 'login' ? 'Log in to see your saved recipes.' : 'Create an account to start cooking with AI.'}</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        {mode === 'register' && <input className={input} placeholder="Name" value={form.name} onChange={set('name')} required />}
        <input className={input} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input className={input} type="password" placeholder="Password (6+ characters)" value={form.password} onChange={set('password')} required minLength={6} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className={`${primaryBtn} w-full`} disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="mt-4 text-sm text-teal-800 hover:underline">
        {mode === 'login' ? 'New here? Create an account' : 'Already registered? Log in'}
      </button>
    </div>
  );
}

function Generator() {
  const [ingredients, setIngredients] = useState('');
  const [diet, setDiet] = useState('none');
  const [servings, setServings] = useState(2);
  const [recipes, setRecipes] = useState([]);
  const [saved, setSaved] = useState({}); // index -> true
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setRecipes([]); setSaved({});
    try {
      const { data } = await api.post('/recipes/generate', { ingredients, diet, servings });
      setRecipes(data.recipes);
    } catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  };

  const save = async (recipe, index) => {
    try {
      await api.post('/recipes', recipe);
      setSaved((s) => ({ ...s, [index]: true }));
    } catch (err) { setError(errorText(err)); }
  };

  return (
    <section>
      <form onSubmit={generate} className="rounded-xl border border-stone-200 bg-white p-5">
        <label className="text-sm font-medium text-stone-800" htmlFor="ing">What do you have in the kitchen?</label>
        <textarea id="ing" rows={3} className={`${input} mt-1`} placeholder="e.g. paneer, spinach, tomatoes, rice, garlic" value={ingredients} onChange={(e) => setIngredients(e.target.value)} required />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-sm text-stone-700" htmlFor="diet">Diet</label>
            <select id="diet" className={input} value={diet} onChange={(e) => setDiet(e.target.value)}>
              {['none', 'vegetarian', 'vegan', 'high-protein', 'low-carb', 'gluten-free'].map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-stone-700" htmlFor="srv">Servings</label>
            <input id="srv" type="number" min={1} max={12} className={input} value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button className={`${primaryBtn} w-full`} disabled={loading}>{loading ? 'Cooking up ideas…' : 'Generate recipes'}</button>
          </div>
        </div>
      </form>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {recipes.map((r, i) => (
          <RecipeCard key={i} recipe={r}>
            <button onClick={() => save(r, i)} disabled={saved[i]} className={primaryBtn}>{saved[i] ? 'Saved' : 'Save recipe'}</button>
          </RecipeCard>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!localStorage.getItem('token'));
  const [tab, setTab] = useState('generate');

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api.get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setChecking(false));
  }, []);

  const logout = () => { localStorage.removeItem('token'); setUser(null); setTab('generate'); };

  if (checking) return <p className="p-8 text-stone-500">Loading…</p>;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {!user ? <AuthForm onAuth={setUser} /> : (
        <>
          <header className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="font-semibold">Smart Recipe Planner</span>
              <nav className="flex gap-1">
                {[['generate', 'AI Generator'], ['saved', 'Saved Recipes']].map(([id, label]) => (
                  <button key={id} onClick={() => setTab(id)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${tab === id ? 'bg-teal-700 text-white' : 'text-stone-700 hover:bg-stone-100'}`}>
                    {label}
                  </button>
                ))}
              </nav>
              <div className="flex items-center gap-3 text-sm text-stone-600">
                <span>{user.name}</span>
                <button onClick={logout} className="text-teal-800 hover:underline">Log out</button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-6">
            {tab === 'generate' ? <Generator /> : <SavedRecipes />}
          </main>
        </>
      )}
    </div>
  );
}
