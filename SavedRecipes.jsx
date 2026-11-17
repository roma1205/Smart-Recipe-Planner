import { useEffect, useState } from 'react';
import api, { errorText } from './api.js';
import RecipeCard from './RecipeCard.jsx';

export default function SavedRecipes() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // { id, notes }

  useEffect(() => {
    api.get('/recipes')
      .then((res) => setRecipes(res.data))
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoading(false));
  }, []);

  const remove = async (id) => {
    if (!window.confirm('Delete this recipe?')) return;
    try {
      await api.delete(`/recipes/${id}`);
      setRecipes((list) => list.filter((r) => r._id !== id));
    } catch (err) { setError(errorText(err)); }
  };

  const saveNotes = async () => {
    try {
      const { data } = await api.put(`/recipes/${editing.id}`, { notes: editing.notes });
      setRecipes((list) => list.map((r) => (r._id === data._id ? data : r)));
      setEditing(null);
    } catch (err) { setError(errorText(err)); }
  };

  if (loading) return <p className="text-stone-500">Loading your recipes…</p>;

  return (
    <section>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {recipes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
          Nothing saved yet. Generate recipes from your ingredients and save the ones you like.
        </p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {recipes.map((r) => (
            <RecipeCard key={r._id} recipe={r}>
              {editing?.id === r._id ? (
                <div>
                  <textarea
                    className="w-full rounded-lg border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                    rows={3}
                    maxLength={1000}
                    value={editing.notes}
                    onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  />
                  <div className="mt-2 flex gap-2">
                    <button onClick={saveNotes} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm text-white hover:bg-teal-800">Save notes</button>
                    <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-stone-600">{r.notes || <span className="text-stone-400">No notes yet.</span>}</p>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditing({ id: r._id, notes: r.notes || '' })} className="rounded-lg px-3 py-1.5 text-sm text-teal-800 hover:bg-teal-50">Edit notes</button>
                    <button onClick={() => remove(r._id)} className="rounded-lg px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              )}
            </RecipeCard>
          ))}
        </div>
      )}
    </section>
  );
}
