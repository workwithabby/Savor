function getSupabaseConfig() {
  const runtimeWindow = typeof window !== 'undefined' ? window : {};
  const configuredUrl = runtimeWindow.SUPABASE_URL || runtimeWindow.__SUPABASE_URL__ || '';
  const configuredKey = runtimeWindow.SUPABASE_ANON_KEY || runtimeWindow.__SUPABASE_ANON_KEY__ || '';

  return {
    url: String(configuredUrl || '').trim(),
    key: String(configuredKey || '').trim()
  };
}

let supabaseClient = null;

async function ensureSupabaseClient() {
  if (supabaseClient || typeof supabase === 'undefined') {
    return supabaseClient;
  }

  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    console.warn('Supabase is not configured for this deployment. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel or load the runtime config before calling the client.');
    return null;
  }

  supabaseClient = supabase.createClient(url, key);
  return supabaseClient;
}

function getRecipeDisplayCategory(recipe) {
  const categoryMap = {
    breakfast: 'Breakfast',
    brunch: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    supper: 'Dinner',
    snack: 'Snack',
    dessert: 'Dessert',
    sweets: 'Dessert',
    appetizer: 'Snack',
    side: 'Snack'
  };

  const mealValue = String(recipe?.meal ?? '').trim().toLowerCase();
  const categoryValue = String(recipe?.category ?? '').trim().toLowerCase();

  if (mealValue && categoryMap[mealValue]) {
    return categoryMap[mealValue];
  }

  if (categoryValue && categoryMap[categoryValue]) {
    return categoryMap[categoryValue];
  }

  if (mealValue) {
    return String(recipe.meal).trim() || 'Other';
  }

  if (categoryValue) {
    return String(recipe.category).trim() || 'Other';
  }

  return 'Other';
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [trimmed];
    }
  }

  return [];
}

function normalizeRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    return recipe;
  }

  const normalized = { ...recipe };
  normalized.category = getRecipeDisplayCategory(recipe);
  normalized.meta = parseJsonArray(recipe.meta);
  normalized.ingredients = parseJsonArray(recipe.ingredients);
  normalized.steps = parseJsonArray(recipe.steps);

  if (!normalized.meal && normalized.category) {
    normalized.meal = String(normalized.category).toLowerCase();
  }

  return normalized;
}

async function fetchRecipesFromSupabase() {
  const client = await ensureSupabaseClient();
  if (!client) {
    console.warn('Supabase client is unavailable, falling back to local recipes');
    return window.SAVOR_RECIPES || [];
  }

  const { data, error } = await client
    .from('recipes')
    .select('id, tag, title, summary, image, meta, meal, diet, cuisine, method, category, ingredients, steps')
    .order('id', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeRecipe);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getSupabaseConfig,
    normalizeRecipe,
    parseJsonArray,
    getRecipeDisplayCategory
  };
}

async function fetchRecipesFromSupabaseDirect() {
  const client = await ensureSupabaseClient();
  if (!client) {
    return [];
  }

  const { data, error } = await client
    .from('recipes')
    .select('id, tag, title, summary, image, meta, meal, diet, cuisine, method, category, ingredients, steps')
    .order('id', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizeRecipe);
}

async function fetchRecipeByIdFromSupabase(id) {
  const client = await ensureSupabaseClient();
  if (!Number.isFinite(id) || !client) {
    return null;
  }

  const { data, error } = await client
    .from('recipes')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.details?.includes('Result contains 0 rows')) {
      return null;
    }
    throw error;
  }

  return normalizeRecipe(data);
}

async function getAllRecipes() {
  const client = await ensureSupabaseClient();
  if (!client) {
    console.warn('Supabase client is unavailable; no recipes will be shown.');
    return [];
  }

  try {
    return await fetchRecipesFromSupabase();
  } catch (error) {
    console.warn('Supabase recipe fetch failed.', error);
    return [];
  }
}

async function getRecipeById(id) {
  const client = await ensureSupabaseClient();
  if (!client) {
    return { status: 'fallback', recipe: null };
  }

  try {
    const recipe = await fetchRecipeByIdFromSupabase(id);
    if (recipe) {
      return { status: 'remote', recipe };
    }
    return { status: 'not_found', recipe: null };
  } catch (error) {
    console.warn('Supabase recipe fetch failed, falling back to local data', error);
    return { status: 'fallback_error', recipe: null };
  }
}

async function fetchFeaturedRecipesFromSupabase() {
  const client = await ensureSupabaseClient();
  if (!client) {
    console.warn('Supabase client is unavailable, returning empty featured list');
    return [];
  }

  const { data, error } = await client
    .from('featured_recipes')
    .select('id, recipe_id, label, note, image_override, position, is_active, featured_at, created_at, updated_at, recipes(id, tag, title, summary, image, meta, meal, diet, cuisine, method, category, ingredients, steps)')
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(function(item) {
    return {
      id: item.id,
      recipe_id: item.recipe_id,
      label: item.label,
      note: item.note,
      image_override: item.image_override,
      position: item.position,
      is_active: item.is_active,
      featured_at: item.featured_at,
      created_at: item.created_at,
      updated_at: item.updated_at,
      recipe: normalizeRecipe(item.recipes)
    };
  });
}

async function getFeaturedRecipes() {
  try {
    return await fetchFeaturedRecipesFromSupabase();
  } catch (error) {
    console.warn('Failed to load featured recipes from Supabase', error);
    return [];
  }
}
