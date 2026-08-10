module.exports = async function handler(request, response) {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    url,
    anonKey
  });
};
