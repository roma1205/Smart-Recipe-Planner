import { useEffect, useState } from 'react';
import api, { errorText } from './api.js';
import RecipeCard from './RecipeCard.jsx';
import SavedRecipes from './SavedRecipes.jsx';

const input = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600';
const primaryBtn = 'rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50';

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'forgot' | 'reset-link'
  const [form, setForm] = useState({ name: '', email: '', password: '', newPassword: '' });
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Check if the user arrived via an email reset link: ?resetToken=...&email=...
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('resetToken');
    const emailParam = params.get('email');
    if (tokenParam && emailParam) {
      setResetToken(tokenParam);
      setForm((prev) => ({ ...prev, email: emailParam }));
      setMode('reset-link');
    }
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const sendResetEmail = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/auth/forgot-password', { email: form.email });
      setSuccess(data.message);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordResetFromLink = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await api.post('/auth/reset-password', {
        email: form.email,
        token: resetToken,
        newPassword: form.newPassword
      });
      setSuccess(data.message);
      // Clean query parameters from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
        setMode('login');
        setSuccess('');
        setResetToken('');
      }, 2500);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/auth/${mode}`, form);
      localStorage.setItem('token', data.token);
      onAuth(data.user);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setSuccess('');
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-stone-900">Smart Recipe Planner</h1>
      <p className="mt-1 text-sm text-stone-600">
        {mode === 'login' && 'Log in to see your saved recipes.'}
        {mode === 'register' && 'Create an account to start cooking with AI.'}
        {mode === 'forgot' && 'Enter your email to receive a password reset link.'}
        {mode === 'reset-link' && 'Choose a new password for your account.'}
      </p>

      {mode === 'forgot' && (
        <form onSubmit={sendResetEmail} className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">Your Registered Email:</label>
            <input className={input} type="email" placeholder="name@example.com" value={form.email} onChange={set('email')} required />
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}
          {success && <p className="text-sm text-teal-800 bg-teal-50 p-2.5 rounded-lg border border-teal-200">{success}</p>}
          <button className={`${primaryBtn} w-full`} disabled={busy}>
            {busy ? 'Sending Link…' : 'Send Password Reset Link'}
          </button>
        </form>
      )}

      {mode === 'reset-link' && (
        <form onSubmit={handlePasswordResetFromLink} className="mt-5 space-y-3">
          <div>
            <span className="text-xs text-stone-600">Resetting password for: <strong className="text-stone-800">{form.email}</strong></span>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">New Password:</label>
            <input
              className={input}
              type="password"
              placeholder="New Password (6+ chars)"
              value={form.newPassword}
              onChange={set('newPassword')}
              minLength={6}
              required
            />
          </div>
          {error && <p className="text-sm text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}
          {success && <p className="text-sm text-teal-800 bg-teal-50 p-2.5 rounded-lg border border-teal-200">{success}</p>}
          <button className={`${primaryBtn} w-full`} disabled={busy}>
            {busy ? 'Updating Password…' : 'Update Password & Log in'}
          </button>
        </form>
      )}

      {(mode === 'login' || mode === 'register') && (
        <form onSubmit={submitAuth} className="mt-5 space-y-3">
          {mode === 'register' && (
            <input className={input} placeholder="Name" value={form.name} onChange={set('name')} required />
          )}
          <input className={input} type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
          <input className={input} type="password" placeholder="Password (6+ characters)" value={form.password} onChange={set('password')} required minLength={6} />
          {error && <p className="text-sm text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}
          <button className={`${primaryBtn} w-full`} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      )}

      <div className="mt-4 flex flex-col gap-2 text-sm border-t border-stone-100 pt-3">
        {mode === 'login' && (
          <>
            <button type="button" onClick={() => switchMode('forgot')} className="text-left text-xs text-teal-700 font-medium hover:underline">
              Forgot password?
            </button>
            <button type="button" onClick={() => switchMode('register')} className="text-teal-800 hover:underline text-left text-xs">
              New here? Create an account
            </button>
          </>
        )}
        {mode === 'register' && (
          <button type="button" onClick={() => switchMode('login')} className="text-teal-800 hover:underline text-left text-xs">
            Already registered? Log in
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset-link') && (
          <button type="button" onClick={() => switchMode('login')} className="text-stone-600 hover:text-teal-800 hover:underline text-left text-xs font-medium">
            ← Back to Log in
          </button>
        )}
      </div>
    </div>
  );
}

function Generator() {
  const [ingredients, setIngredients] = useState('');
  const [diet, setDiet] = useState('none');
  const [servings, setServings] = useState(2);
  const [recipes, setRecipes] = useState([]);
  const [shared, setShared] = useState(false);
  const [saved, setSaved] = useState({}); // index -> true
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search feature state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const generate = async (e, forceRefresh = false) => {
    if (e) e.preventDefault();
    setLoading(true); setError(''); setRecipes([]); setSaved({}); setShared(false); setSearchResults(null);
    try {
      const { data } = await api.post('/recipes/generate', {
        ingredients,
        diet,
        servings,
        refresh: forceRefresh
      });
      setRecipes(data.recipes);
      setShared(Boolean(data.shared));
    } catch (err) { setError(errorText(err)); }
    finally { setLoading(false); }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true); setError(''); setRecipes([]);
    try {
      const { data } = await api.get(`/recipes/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data);
    } catch (err) { setError(errorText(err)); }
    finally { setSearchLoading(false); }
  };

  const save = async (recipe, index) => {
    try {
      await api.post('/recipes', recipe);
      setSaved((s) => ({ ...s, [index]: true }));
    } catch (err) { setError(errorText(err)); }
  };

  return (
    <section className="space-y-6">
      {/* Search Recipe by Name Card */}
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-900 mb-1">Search Recipe by Name</h2>
        <p className="text-xs text-stone-500 mb-3">Find any specific dish across your saved recipes and community dishes.</p>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            className={input}
            placeholder="e.g. Garlic Butter Shrimp, Paneer Tikka, Chicken Curry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button className={`${primaryBtn} whitespace-nowrap`} disabled={searchLoading || !searchQuery.trim()}>
            {searchLoading ? 'Searching…' : 'Find Recipe'}
          </button>
        </form>
      </div>

      {/* Main Ingredient Generator Card */}
      <form onSubmit={(e) => generate(e, false)} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-stone-900" htmlFor="ing">What do you have in the kitchen?</label>
          {recipes.length > 0 && (
            <button
              type="button"
              onClick={() => generate(null, true)}
              disabled={loading}
              className="text-xs font-medium text-teal-800 hover:text-teal-900 hover:underline flex items-center gap-1"
            >
              🔄 Generate different recipes
            </button>
          )}
        </div>
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
          <div className="flex items-end gap-2">
            <button className={`${primaryBtn} flex-1`} disabled={loading}>
              {loading ? 'Cooking up ideas…' : 'Generate recipes'}
            </button>
            {ingredients.trim() && (
              <button
                type="button"
                onClick={() => generate(null, true)}
                title="Force generate completely new & different recipes"
                className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                disabled={loading}
              >
                Surprise Me
              </button>
            )}
          </div>
        </div>
      </form>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      {shared && (
        <div className="flex items-center justify-between rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <span>
            <strong className="font-semibold">Community Match:</strong> Showing matched recipe recommendations for these ingredients.
          </span>
          <button
            onClick={() => generate(null, true)}
            className="text-xs font-semibold text-amber-900 underline hover:text-amber-700 ml-3"
          >
            Want something new? Generate different recipes →
          </button>
        </div>
      )}

      {/* Search Results Display */}
      {searchResults && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-800">Search Results for "{searchQuery}"</h3>
            <button onClick={() => setSearchResults(null)} className="text-xs text-stone-500 hover:underline">Clear search</button>
          </div>
          {searchResults.personal.length === 0 && searchResults.community.length === 0 ? (
            <p className="text-sm text-stone-500 bg-white p-4 rounded-lg border border-stone-200">No recipes found matching "{searchQuery}". Try typing ingredients above to generate one!</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {[...searchResults.personal, ...searchResults.community].map((r, i) => (
                <RecipeCard key={i} recipe={r}>
                  {r.isCommunity && (
                    <span className="text-xs bg-teal-50 text-teal-700 font-medium px-2 py-0.5 rounded border border-teal-200 mr-2">Community Dish</span>
                  )}
                  <button onClick={() => save(r, `search-${i}`)} disabled={saved[`search-${i}`]} className={primaryBtn}>
                    {saved[`search-${i}`] ? 'Saved' : 'Save recipe'}
                  </button>
                </RecipeCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generated Recipes Display */}
      {recipes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-800">Suggested Recipes</h3>
            <button
              onClick={() => generate(null, true)}
              disabled={loading}
              className="text-xs font-medium text-teal-800 hover:underline"
            >
              🔄 Get completely different recipes
            </button>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {recipes.map((r, i) => (
              <RecipeCard key={i} recipe={r}>
                <button onClick={() => save(r, i)} disabled={saved[i]} className={primaryBtn}>{saved[i] ? 'Saved' : 'Save recipe'}</button>
              </RecipeCard>
            ))}
          </div>
        </div>
      )}
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
