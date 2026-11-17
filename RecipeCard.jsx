export default function RecipeCard({ recipe, children }) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5">
      <h3 className="text-lg font-semibold text-stone-900">{recipe.title}</h3>
      {recipe.description && <p className="mt-1 text-sm text-stone-600">{recipe.description}</p>}
      <p className="mt-3 text-xs text-stone-500">
        {[recipe.cookTime, recipe.servings && `Serves ${recipe.servings}`, recipe.calories > 0 && `${recipe.calories} kcal each`]
          .filter(Boolean).join(' · ')}
      </p>

      <h4 className="mt-4 text-sm font-medium text-stone-800">Ingredients</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-stone-700">
        {recipe.ingredients?.map((i, n) => <li key={n}>{i}</li>)}
      </ul>

      <h4 className="mt-4 text-sm font-medium text-stone-800">Method</h4>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-stone-700">
        {recipe.steps?.map((s, n) => <li key={n}>{s}</li>)}
      </ol>

      {children && <div className="mt-5 border-t border-stone-100 pt-4">{children}</div>}
    </article>
  );
}
